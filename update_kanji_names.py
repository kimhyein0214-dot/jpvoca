from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_CSV = "kanji_names.csv"
REQUIRED_COLUMNS = ("character", "korean_name", "korean_meaning", "korean_sound")
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
            character = clean_text(row.get("character"))
            if not character:
                print(f"SKIP line {line_number}: empty character")
                continue

            if character in seen:
                print(f"SKIP line {line_number}: duplicate character in CSV: {character}")
                continue

            seen.add(character)
            rows.append(
                {
                    "character": character,
                    "korean_name": clean_text(row.get("korean_name")),
                    "korean_meaning": clean_text(row.get("korean_meaning")),
                    "korean_sound": clean_text(row.get("korean_sound")),
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
                UPDATE jp_vocab_kanji
                SET
                    korean_name = COALESCE(%s, korean_name),
                    korean_meaning = COALESCE(%s, korean_meaning),
                    korean_sound = COALESCE(%s, korean_sound),
                    updated_at = now()
                WHERE character = %s
                RETURNING id
                """,
                (
                    row["korean_name"],
                    row["korean_meaning"],
                    row["korean_sound"],
                    row["character"],
                ),
            )

            updated = cur.fetchone()
            if updated is None:
                skipped_count += 1
                print(f"SKIP missing character in DB: {row['character']}")
            else:
                updated_count += 1

    conn.commit()
    return updated_count, skipped_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update jp_vocab_kanji Korean name, meaning, and sound from CSV."
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
