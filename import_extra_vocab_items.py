from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_CSV = "extra_n1_adverbs.csv"
REQUIRED_COLUMNS = ("word", "reading_hiragana", "meaning_ko", "pos")
CJK_RE = re.compile(r"[\u3400-\u9fff々〆ヵヶ]")
WHITESPACE_RE = re.compile(r"\s+")


def clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = WHITESPACE_RE.sub(" ", value.strip())
    return text or None


def extract_kanji_positions(word: str) -> list[tuple[str, int]]:
    return [
        (character, index)
        for index, character in enumerate(word, start=1)
        if CJK_RE.match(character)
    ]


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames is None:
            raise ValueError("CSV header row is missing.")

        missing = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
        if missing:
            raise ValueError(f"Missing required CSV column(s): {', '.join(missing)}")

        rows: list[dict[str, str]] = []
        seen: set[str] = set()
        for line_number, row in enumerate(reader, start=2):
            cleaned = {column: clean(row.get(column)) for column in REQUIRED_COLUMNS}
            word = cleaned["word"]
            if not word:
                print(f"SKIP line {line_number}: empty word")
                continue
            if word in seen:
                print(f"SKIP line {line_number}: duplicate word in CSV: {word}")
                continue
            if not cleaned["reading_hiragana"] or not cleaned["meaning_ko"]:
                print(f"SKIP line {line_number}: missing reading or meaning: {word}")
                continue
            if not cleaned["pos"]:
                print(f"SKIP line {line_number}: missing pos: {word}")
                continue
            seen.add(word)
            rows.append(cleaned)  # type: ignore[arg-type]
        return rows


def import_rows(
    conn: psycopg.Connection, rows: list[dict[str, str]], source_sheet: str
) -> dict[str, int]:
    inserted_words = 0
    skipped_existing = 0
    inserted_relations = 0

    with conn.cursor() as cur:
        for row in rows:
            cur.execute("SELECT id FROM jp_vocab_words WHERE word = %s", (row["word"],))
            existing = cur.fetchone()
            if existing:
                skipped_existing += 1
                continue

            cur.execute(
                """
                INSERT INTO jp_vocab_words (
                    word, reading_hiragana, meaning_ko, level, pos, source_sheet, updated_at
                )
                VALUES (%s, %s, %s, 'N1', %s, %s, now())
                RETURNING id
                """,
                (
                    row["word"],
                    row["reading_hiragana"],
                    row["meaning_ko"],
                    row["pos"],
                    source_sheet,
                ),
            )
            word_id = cur.fetchone()[0]
            inserted_words += 1

            for character, position in extract_kanji_positions(row["word"]):
                cur.execute(
                    """
                    INSERT INTO jp_vocab_kanji (character, updated_at)
                    VALUES (%s, now())
                    ON CONFLICT (character) DO UPDATE SET updated_at = now()
                    RETURNING id
                    """,
                    (character,),
                )
                kanji_id = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO jp_vocab_word_kanji (word_id, kanji_id, position)
                    VALUES (%s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (word_id, kanji_id, position),
                )
                inserted_relations += cur.rowcount

    conn.commit()
    return {
        "inserted_words": inserted_words,
        "skipped_existing": skipped_existing,
        "inserted_relations": inserted_relations,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Import extra N1 vocabulary items.")
    parser.add_argument("--csv", default=DEFAULT_CSV)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_dotenv(".env")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    csv_path = Path(args.csv)
    rows = read_rows(csv_path)
    print(f"csv_rows={len(rows)}")

    if args.dry_run:
        print("inserted_words=0")
        print("skipped_existing=0")
        print("inserted_relations=0")
        return

    with psycopg.connect(database_url) as conn:
        result = import_rows(conn, rows, csv_path.name)

    for key, value in result.items():
        print(f"{key}={value}")


if __name__ == "__main__":
    main()
