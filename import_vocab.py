from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

import openpyxl
import psycopg
from dotenv import load_dotenv
import os


WORKBOOK = "n1-vocab-kanji.xlsx"

HIRAGANA_RE = re.compile(r"[\u3040-\u309f]")
KANA_RE = re.compile(r"^[\u3040-\u30ffー\s]+$")
HANGUL_RE = re.compile(r"[\uac00-\ud7a3\u3131-\u318e]")
WHITESPACE_RE = re.compile(r"\s+")


KANJI_KOREAN_NAMES = {
    "一": "한 일",
    "日": "날 일",
    "月": "달 월",
    "火": "불 화",
    "水": "물 수",
    "木": "나무 목",
    "金": "쇠 금",
    "土": "흙 토",
    "人": "사람 인",
    "大": "클 대",
    "小": "작을 소",
    "学": "배울 학",
    "生": "날 생",
    "先": "먼저 선",
    "時": "때 시",
    "間": "사이 간",
    "国": "나라 국",
    "語": "말씀 어",
    "見": "볼 견",
    "行": "갈 행",
}


@dataclass
class WordRow:
    word: str
    reading_hiragana: str | None
    meaning_ko: str | None
    source_sheet: str


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
    return [(char, idx) for idx, char in enumerate(word, start=1) if is_cjk_kanji(char)]


def parse_workbook(path: Path) -> dict[str, WordRow]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    words: dict[str, WordRow] = {}

    for sheet in workbook.worksheets:
        for row in sheet.iter_rows(values_only=True):
            cells = [text for value in row if (text := clean_text(value))]
            if not cells:
                continue

            word = next((cell for cell in cells if contains_kanji(cell)), None)
            if not word:
                continue

            reading = None
            meaning = None
            for cell in cells:
                if cell == word:
                    continue
                if reading is None and HIRAGANA_RE.search(cell) and KANA_RE.match(cell):
                    reading = cell
                    continue
                if meaning is None and HANGUL_RE.search(cell) and not contains_kanji(cell):
                    meaning = cell

            existing = words.get(word)
            if existing is None:
                words[word] = WordRow(word, reading, meaning, sheet.title)
            else:
                existing.reading_hiragana = existing.reading_hiragana or reading
                existing.meaning_ko = existing.meaning_ko or meaning
                if sheet.title not in existing.source_sheet.split(", "):
                    existing.source_sheet = f"{existing.source_sheet}, {sheet.title}"

    return words


def upsert_words(conn: psycopg.Connection, words: dict[str, WordRow]) -> tuple[int, int, int]:
    kanji_chars = {
        kanji
        for item in words.values()
        for kanji, _position in extract_kanji_positions(item.word)
    }
    relations = [
        (item.word, kanji, position)
        for item in words.values()
        for kanji, position in extract_kanji_positions(item.word)
    ]

    with conn.cursor() as cur:
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
        for character, korean_name in KANJI_KOREAN_NAMES.items():
            cur.execute(
                """
                INSERT INTO jp_vocab_kanji (character, korean_name, updated_at)
                VALUES (%s, %s, now())
                ON CONFLICT (character) DO UPDATE SET
                    korean_name = COALESCE(jp_vocab_kanji.korean_name, EXCLUDED.korean_name),
                    updated_at = now()
                """,
                (character, korean_name),
            )

        word_payload = [
            {
                "word": item.word,
                "reading_hiragana": item.reading_hiragana,
                "meaning_ko": item.meaning_ko,
                "source_sheet": item.source_sheet,
            }
            for item in words.values()
        ]
        cur.execute(
            """
            WITH input AS (
                SELECT *
                FROM jsonb_to_recordset(%s::jsonb) AS x(
                    word text,
                    reading_hiragana text,
                    meaning_ko text,
                    source_sheet text
                )
            )
            INSERT INTO jp_vocab_words (
                word, reading_hiragana, meaning_ko, level, source_sheet, updated_at
            )
            SELECT word, reading_hiragana, meaning_ko, 'N1', source_sheet, now()
            FROM input
            ON CONFLICT (word) DO UPDATE SET
                reading_hiragana = COALESCE(jp_vocab_words.reading_hiragana, EXCLUDED.reading_hiragana),
                meaning_ko = COALESCE(jp_vocab_words.meaning_ko, EXCLUDED.meaning_ko),
                level = COALESCE(jp_vocab_words.level, EXCLUDED.level),
                source_sheet = COALESCE(jp_vocab_words.source_sheet, EXCLUDED.source_sheet),
                updated_at = now()
            """,
            (json.dumps(word_payload, ensure_ascii=False),),
        )

        relation_payload = [
            {"word": word, "kanji": kanji, "position": position}
            for word, kanji, position in relations
        ]
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
    parser = argparse.ArgumentParser(description="Import N1 kanji vocabulary into PostgreSQL.")
    parser.add_argument("--xlsx", default=WORKBOOK, help="Path to the xlsx workbook.")
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    workbook_path = Path(args.xlsx)
    if not workbook_path.exists():
        raise FileNotFoundError(workbook_path)

    words = parse_workbook(workbook_path)
    if not words:
        raise RuntimeError("No CJK kanji-containing words were found in the workbook.")

    with psycopg.connect(database_url) as conn:
        imported_words, kanji_count, relations = upsert_words(conn, words)

    null_reading = sum(1 for item in words.values() if item.reading_hiragana is None)
    null_meaning = sum(1 for item in words.values() if item.meaning_ko is None)
    print(f"imported_words={imported_words}")
    print(f"unique_kanji_in_workbook={kanji_count}")
    print(f"word_kanji_relations_seen={relations}")
    print(f"reading_hiragana_null_in_workbook={null_reading}")
    print(f"meaning_ko_null_in_workbook={null_meaning}")


if __name__ == "__main__":
    main()
