from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_OUTPUT = "missing_kanji_names.csv"
CSV_COLUMNS = ("character", "korean_name", "korean_meaning", "korean_sound")


def export_missing_kanji_names(conn: psycopg.Connection, output_path: Path) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT character, korean_name, korean_meaning, korean_sound
            FROM jp_vocab_kanji
            WHERE korean_name IS NULL
               OR btrim(korean_name) = ''
            ORDER BY character
            """
        )
        rows = cur.fetchall()

    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(CSV_COLUMNS)
        for character, korean_name, korean_meaning, korean_sound in rows:
            writer.writerow(
                [
                    character,
                    korean_name or "",
                    korean_meaning or "",
                    korean_sound or "",
                ]
            )

    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export jp_vocab_kanji rows missing korean_name to CSV."
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
        exported_count = export_missing_kanji_names(conn, output_path)

    print(f"exported_rows={exported_count}")
    print(f"output_file={output_path}")


if __name__ == "__main__":
    main()
