from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_CSV = "word_examples.csv"
REQUIRED_COLUMNS = ("word", "example_jp", "example_ko")
WHITESPACE_RE = re.compile(r"\s+")


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = WHITESPACE_RE.sub(" ", value.strip())
    return text or None


def read_rows(csv_path: Path) -> list[dict[str, str | None]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames is None:
            raise ValueError("CSV header row is missing.")

        missing = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
        if missing:
            raise ValueError(f"Missing required CSV column(s): {', '.join(missing)}")

        rows: list[dict[str, str | None]] = []
        seen: set[tuple[str, str]] = set()

        for line_number, row in enumerate(reader, start=2):
            word = clean_text(row.get("word"))
            example_jp = clean_text(row.get("example_jp"))
            if not word or not example_jp:
                print(f"SKIP line {line_number}: empty word or example_jp")
                continue

            key = (word, example_jp)
            if key in seen:
                print(f"SKIP line {line_number}: duplicate example in CSV: {word}")
                continue

            seen.add(key)
            rows.append(
                {
                    "word": word,
                    "example_jp": example_jp,
                    "example_ko": clean_text(row.get("example_ko")),
                    "source": clean_text(row.get("source")) or "generated_n1_review",
                }
            )

    return rows


def upsert_examples(conn: psycopg.Connection, rows: list[dict[str, str | None]]) -> tuple[int, int]:
    updated_count = 0
    skipped_count = 0

    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO jp_vocab_word_examples (
                    word_id, example_jp, example_ko, source, updated_at
                )
                SELECT id, %s, %s, %s, now()
                FROM jp_vocab_words
                WHERE word = %s
                ON CONFLICT (word_id, example_jp) DO UPDATE SET
                    example_ko = COALESCE(EXCLUDED.example_ko, jp_vocab_word_examples.example_ko),
                    source = COALESCE(EXCLUDED.source, jp_vocab_word_examples.source),
                    updated_at = now()
                RETURNING id
                """,
                (
                    row["example_jp"],
                    row["example_ko"],
                    row["source"],
                    row["word"],
                ),
            )

            if cur.fetchone() is None:
                skipped_count += 1
                print(f"SKIP missing word in DB: {row['word']}")
            else:
                updated_count += 1

    conn.commit()
    return updated_count, skipped_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upsert jp_vocab_word_examples rows from CSV."
    )
    parser.add_argument("--csv", default=DEFAULT_CSV)
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)

    rows = read_rows(csv_path)
    if not rows:
        print("updated_rows=0")
        print("skipped_rows=0")
        return

    with psycopg.connect(database_url) as conn:
        updated_count, skipped_count = upsert_examples(conn, rows)

    print(f"updated_rows={updated_count}")
    print(f"skipped_rows={skipped_count}")


if __name__ == "__main__":
    main()
