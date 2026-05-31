from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_OUTPUT = "missing_word_examples.csv"
CSV_COLUMNS = ("word", "reading_hiragana", "meaning_ko", "example_jp", "example_ko")


def export_missing_examples(conn: psycopg.Connection, output_path: Path) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT w.word, w.reading_hiragana, w.meaning_ko
            FROM jp_vocab_words w
            WHERE NOT EXISTS (
                SELECT 1
                FROM jp_vocab_word_examples e
                WHERE e.word_id = w.id
            )
            ORDER BY w.word
            """
        )
        rows = cur.fetchall()

    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(CSV_COLUMNS)
        for word, reading_hiragana, meaning_ko in rows:
            writer.writerow([word, reading_hiragana or "", meaning_ko or "", "", ""])

    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export words that do not have example sentences yet."
    )
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    output_path = Path(args.output)
    with psycopg.connect(database_url) as conn:
        exported_count = export_missing_examples(conn, output_path)

    print(f"exported_rows={exported_count}")
    print(f"output_file={output_path}")


if __name__ == "__main__":
    main()
