from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import openpyxl
import psycopg
from dotenv import load_dotenv


WORKBOOK = "n1-vocab-kanji_2.xlsx"
WHITESPACE_RE = re.compile(r"\s+")


@dataclass
class CandidateWord:
    word: str
    source_sheet: str
    sheet_row: int


def clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = WHITESPACE_RE.sub(" ", str(value).strip())
    return text or None


def is_cjk_kanji(char: str) -> bool:
    code = ord(char)
    return (
        0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0xF900 <= code <= 0xFAFF
        or 0x20000 <= code <= 0x2A6DF
        or 0x2A700 <= code <= 0x2B73F
        or 0x2B740 <= code <= 0x2B81F
        or 0x2B820 <= code <= 0x2CEAF
        or 0x2CEB0 <= code <= 0x2EBEF
        or 0x30000 <= code <= 0x3134F
    )


def contains_kanji(text: str) -> bool:
    return any(is_cjk_kanji(char) for char in text)


def extract_kanji_positions(word: str) -> list[tuple[str, int]]:
    return [(char, index) for index, char in enumerate(word, start=1) if is_cjk_kanji(char)]


def parse_workbook(path: Path) -> tuple[list[CandidateWord], list[CandidateWord], Counter[str]]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    raw_candidates: list[CandidateWord] = []

    for sheet in workbook.worksheets:
        for row_index, row in enumerate(sheet.iter_rows(values_only=True), start=1):
            word = clean_text(row[0] if row else None)
            if not word:
                continue
            raw_candidates.append(
                CandidateWord(
                    word=word,
                    source_sheet=f"{path.name}:{sheet.title}",
                    sheet_row=row_index,
                )
            )

    counts = Counter(item.word for item in raw_candidates)
    seen: set[str] = set()
    unique_candidates: list[CandidateWord] = []
    duplicate_candidates: list[CandidateWord] = []

    for item in raw_candidates:
        if item.word in seen:
            duplicate_candidates.append(item)
            continue
        seen.add(item.word)
        unique_candidates.append(item)

    return unique_candidates, duplicate_candidates, counts


def fetch_existing_words(conn: psycopg.Connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT word FROM jp_vocab_words")
        return {row[0] for row in cur.fetchall()}


def import_words(conn: psycopg.Connection, words: list[CandidateWord]) -> tuple[int, int, int]:
    kanji_chars = {
        kanji
        for item in words
        for kanji, _position in extract_kanji_positions(item.word)
    }
    relations = [
        (item.word, kanji, position)
        for item in words
        for kanji, position in extract_kanji_positions(item.word)
    ]

    word_payload = [
        {
            "word": item.word,
            "source_sheet": item.source_sheet,
        }
        for item in words
    ]
    relation_payload = [
        {"word": word, "kanji": kanji, "position": position}
        for word, kanji, position in relations
    ]

    with conn.cursor() as cur:
        if kanji_chars:
            cur.execute(
                """
                WITH input(character) AS (
                    SELECT unnest(%s::text[])
                )
                INSERT INTO jp_vocab_kanji (character, updated_at)
                SELECT character, now()
                FROM input
                ON CONFLICT (character) DO UPDATE SET updated_at = now()
                """,
                (sorted(kanji_chars),),
            )

        if word_payload:
            cur.execute(
                """
                WITH input AS (
                    SELECT *
                    FROM jsonb_to_recordset(%s::jsonb) AS x(
                        word text,
                        source_sheet text
                    )
                )
                INSERT INTO jp_vocab_words (
                    word, reading_hiragana, meaning_ko, level, source_sheet, updated_at
                )
                SELECT word, NULL, NULL, 'N1', source_sheet, now()
                FROM input
                ON CONFLICT (word) DO NOTHING
                """,
                (json.dumps(word_payload, ensure_ascii=False),),
            )

        if relation_payload:
            cur.execute(
                """
                WITH input AS (
                    SELECT *
                    FROM jsonb_to_recordset(%s::jsonb) AS x(
                        word text,
                        kanji text,
                        position int
                    )
                )
                INSERT INTO jp_vocab_word_kanji (word_id, kanji_id, position)
                SELECT w.id, k.id, input.position
                FROM input
                JOIN jp_vocab_words w ON w.word = input.word
                JOIN jp_vocab_kanji k ON k.character = input.kanji
                ON CONFLICT (word_id, kanji_id, position) DO NOTHING
                """,
                (json.dumps(relation_payload, ensure_ascii=False),),
            )

    conn.commit()
    return len(words), len(kanji_chars), len(relations)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import new kanji-containing words from n1-vocab-kanji_2.xlsx."
    )
    parser.add_argument("--xlsx", default=WORKBOOK, help="Path to the xlsx workbook.")
    parser.add_argument("--dry-run", action="store_true", help="Print summary without writing to DB.")
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    workbook_path = Path(args.xlsx)
    if not workbook_path.exists():
        raise FileNotFoundError(workbook_path)

    unique_candidates, duplicate_candidates, counts = parse_workbook(workbook_path)

    with psycopg.connect(database_url) as conn:
        existing_words = fetch_existing_words(conn)
        existing_skipped = [item for item in unique_candidates if item.word in existing_words]
        no_kanji_skipped = [
            item for item in unique_candidates
            if item.word not in existing_words and not contains_kanji(item.word)
        ]
        import_targets = [
            item for item in unique_candidates
            if item.word not in existing_words and contains_kanji(item.word)
        ]

        print(f"xlsx_rows={sum(counts.values())}")
        print(f"xlsx_unique_words={len(unique_candidates)}")
        print(f"duplicates_in_file={len(duplicate_candidates)}")
        print(
            "duplicate_words="
            + ",".join(sorted(word for word, count in counts.items() if count > 1))
        )
        print(f"existing_words_skipped={len(existing_skipped)}")
        print(f"no_kanji_skipped={len(no_kanji_skipped)}")
        print(f"import_targets={len(import_targets)}")

        if args.dry_run:
            print("dry_run=true")
            return

        imported_words, unique_kanji, relations = import_words(conn, import_targets)

    print(f"imported_words={imported_words}")
    print(f"unique_kanji_seen={unique_kanji}")
    print(f"word_kanji_relations_seen={relations}")


if __name__ == "__main__":
    main()
