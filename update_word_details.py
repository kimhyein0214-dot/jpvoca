from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_CSV = "word_details.csv"
REQUIRED_COLUMNS = ("word", "reading_hiragana", "meaning_ko")
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
        seen: set[str] = set()

        for line_number, row in enumerate(reader, start=2):
            word = clean_text(row.get("word"))
            if not word:
                print(f"SKIP line {line_number}: empty word")
                continue

            if word in seen:
                print(f"SKIP line {line_number}: duplicate word in CSV: {word}")
                continue

            seen.add(word)
            rows.append(
                {
                    "word": word,
                    "reading_hiragana": clean_text(row.get("reading_hiragana")),
                    "meaning_ko": clean_text(row.get("meaning_ko")),
                }
            )

    return rows


def update_rows(conn: psycopg.Connection, rows: list[dict[str, str | None]]) -> tuple[int, int]:
    updated_count = 0
    skipped_count = 0

    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                UPDATE jp_vocab_words
                SET
                    reading_hiragana = COALESCE(%s, reading_hiragana),
                    meaning_ko = COALESCE(%s, meaning_ko),
                    updated_at = now()
                WHERE word = %s
                RETURNING id
                """,
                (row["reading_hiragana"], row["meaning_ko"], row["word"]),
            )

            updated = cur.fetchone()
            if updated is None:
                skipped_count += 1
                print(f"SKIP missing word in DB: {row['word']}")
            else:
                updated_count += 1

    conn.commit()
    return updated_count, skipped_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update jp_vocab_words reading_hiragana and meaning_ko from CSV."
    )
    parser.add_argument(
        "--csv",
        default=DEFAULT_CSV,
        help=f"Input CSV path. Default: {DEFAULT_CSV}",
    )
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
        print("No valid CSV rows found.")
        return

    with psycopg.connect(database_url) as conn:
        updated_count, skipped_count = update_rows(conn, rows)

    print(f"updated_rows={updated_count}")
    print(f"skipped_rows={skipped_count}")


if __name__ == "__main__":
    main()
