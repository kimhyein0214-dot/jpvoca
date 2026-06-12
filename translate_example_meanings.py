from __future__ import annotations

import argparse
import csv
import os
import re
import time
from pathlib import Path

import psycopg
from deep_translator import GoogleTranslator
from dotenv import load_dotenv


DEFAULT_OUTPUT = "example_translations.csv"
WHITESPACE_RE = re.compile(r"\s+")


def clean(value: str | None) -> str:
    return WHITESPACE_RE.sub(" ", (value or "").strip())


def fetch_missing_examples(limit: int | None = None) -> list[dict[str, str]]:
    load_dotenv(".env")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    query = """
        SELECT e.id, w.word, e.example_jp
        FROM jp_vocab_word_examples e
        JOIN jp_vocab_words w ON w.id = e.word_id
        WHERE e.example_ko IS NULL OR btrim(e.example_ko) = ''
        ORDER BY e.id
    """
    params: tuple[int, ...] = ()
    if limit is not None:
        query += " LIMIT %s"
        params = (limit,)

    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute(query, params)
        return [
            {"example_id": str(row[0]), "word": row[1], "example_jp": row[2]}
            for row in cur.fetchall()
        ]


def read_existing(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        return {
            clean(row.get("example_id")): {
                "example_id": clean(row.get("example_id")),
                "word": clean(row.get("word")),
                "example_jp": clean(row.get("example_jp")),
                "example_ko": clean(row.get("example_ko")),
            }
            for row in reader
            if clean(row.get("example_id")) and clean(row.get("example_ko"))
        }


def write_rows(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=("example_id", "word", "example_jp", "example_ko"),
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)


def translate_missing(
    output_path: Path, limit: int | None, sleep_seconds: float, flush_every: int
) -> tuple[int, int]:
    missing = fetch_missing_examples(limit)
    existing = read_existing(output_path)
    rows_by_id = dict(existing)

    translator = GoogleTranslator(source="ja", target="ko")
    translated = 0
    skipped_cached = 0

    for index, row in enumerate(missing, start=1):
        example_id = row["example_id"]
        if example_id in rows_by_id:
            skipped_cached += 1
            continue

        translated_text = clean(translator.translate(row["example_jp"]))
        rows_by_id[example_id] = {
            **row,
            "example_ko": translated_text,
        }
        translated += 1

        if translated % flush_every == 0:
            write_rows(output_path, list(rows_by_id.values()))
            print(f"translated={translated} cached={skipped_cached} scanned={index}")

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    write_rows(output_path, list(rows_by_id.values()))
    return translated, skipped_cached


def apply_csv(path: Path) -> tuple[int, int]:
    load_dotenv(".env")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        rows = [
            {
                "example_id": clean(row.get("example_id")),
                "example_ko": clean(row.get("example_ko")),
            }
            for row in csv.DictReader(file)
        ]

    updated = 0
    skipped = 0
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        for row in rows:
            if not row["example_id"] or not row["example_ko"]:
                skipped += 1
                continue
            cur.execute(
                """
                UPDATE jp_vocab_word_examples
                SET example_ko = %s, updated_at = now()
                WHERE id = %s
                """,
                (row["example_ko"], int(row["example_id"])),
            )
            if cur.rowcount:
                updated += cur.rowcount
            else:
                skipped += 1
        conn.commit()

    return updated, skipped


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Translate missing jp_vocab_word_examples.example_ko values."
    )
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--sleep", type=float, default=0.05)
    parser.add_argument("--flush-every", type=int, default=25)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--apply-only", action="store_true")
    args = parser.parse_args()

    output_path = Path(args.output)

    if not args.apply_only:
        translated, skipped_cached = translate_missing(
            output_path=output_path,
            limit=args.limit,
            sleep_seconds=args.sleep,
            flush_every=args.flush_every,
        )
        print(f"translated_rows={translated}")
        print(f"cached_rows={skipped_cached}")
        print(f"output_file={output_path}")

    if args.apply or args.apply_only:
        updated, skipped = apply_csv(output_path)
        print(f"updated_rows={updated}")
        print(f"skipped_rows={skipped}")


if __name__ == "__main__":
    main()
