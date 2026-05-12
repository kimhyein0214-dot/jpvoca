from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_OUTPUT = "missing_word_details.csv"
CSV_COLUMNS = ("word", "reading_hiragana", "meaning_ko")


def export_missing_details(conn: psycopg.Connection, output_path: Path) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT word, reading_hiragana, meaning_ko
            FROM jp_vocab_words
            WHERE reading_hiragana IS NULL
               OR meaning_ko IS NULL
            ORDER BY id
            """
        )
        rows = cur.fetchall()

    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(CSV_COLUMNS)
        for word, reading_hiragana, meaning_ko in rows:
            writer.writerow(
                [
                    word,
                    reading_hiragana or "",
                    meaning_ko or "",
                ]
            )

    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export words missing reading_hiragana or meaning_ko to CSV."
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"Output CSV path. Default: {DEFAULT_OUTPUT}",
    )
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    output_path = Path(args.output)
    with psycopg.connect(database_url) as conn:
        exported_count = export_missing_details(conn, output_path)

    print(f"exported_rows={exported_count}")
    print(f"output_file={output_path}")


if __name__ == "__main__":
    main()
