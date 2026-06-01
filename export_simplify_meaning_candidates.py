from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_OUTPUT = "simplified_meaning_candidates.csv"
DEFAULT_UPDATE_OUTPUT = "word_details_simplified_meanings.csv"

CJK_RE = re.compile(r"[\u3400-\u9fff々〆ヵヶ]")
HIRAGANA_RE = re.compile(r"^[ぁ-ゖー]+$")
KATAKANA_RE = re.compile(r"^[ァ-ヺー・]+$")
EXPLICIT_SEPARATOR_RE = re.compile(r"\s*[,，、/·・;；]\s*")

MANUAL_SIMPLIFIED_MEANINGS = {
    "げっそり": "수척하게",
    "しとやかな": "얌전한",
    "しなやかな": "유연한",
    "しんなり": "축 늘어진",
    "ちやほや": "떠받듦",
    "つぶらな": "동그란",
    "ぺこぺこ": "배고픔",
    "めきめき": "눈에 띄게",
    "不評な": "평판 나쁨",
    "不順な": "순조롭지 않음",
    "多忙な": "매우 바쁜",
    "大柄な": "큰 체격",
    "安っぽい": "싸구려 같은",
    "心地よい": "기분 좋은",
    "欲深い": "욕심 많다",
    "清らかな": "맑고 깨끗한",
    "物好きな": "호기심 많은",
    "生真面目な": "고지식한",
    "臆病な": "겁이 많다",
    "華奢な": "가냘픈",
    "～がたい": "하기 어렵다",
    "一身上": "개인 사정",
    "乗り過ごす": "지나치다",
    "住み慣れる": "익숙해지다",
    "使いこなす": "활용하다",
    "依然": "여전히",
    "偏在": "편재",
    "収支": "수지",
    "取り寄せる": "주문하다",
    "同士": "동료",
    "名実": "명실",
    "名手": "명수",
    "売名": "매명",
    "大当たり": "대성공",
    "大柄": "큰 체격",
    "好悪": "호오",
    "好機": "호기",
    "思い詰める": "고민하다",
    "情け深い": "인정 많다",
    "想像上": "상상 속",
    "愛顧": "애고",
    "手際": "솜씨",
    "生臭い": "비린내 나다",
    "行きそびれる": "놓치다",
    "見落とす": "놓치다",
    "見逃す": "놓치다",
    "見違える": "몰라보다",
    "言い通す": "주장하다",
    "読み上げる": "낭독하다",
    "軽症": "경상",
    "辿り着く": "도착하다",
    "食べそびれる": "놓치다",
}


def classify_word(word: str) -> str:
    if HIRAGANA_RE.fullmatch(word):
        return "kana_expression"
    if KATAKANA_RE.fullmatch(word):
        return "katakana"
    if word.endswith("する"):
        return "suru_verb"
    if word.endswith(("う", "く", "ぐ", "す", "つ", "ぬ", "ぶ", "む", "る")):
        return "verb"
    if word.endswith("な"):
        return "na_adj"
    if word.endswith(("しい", "ない", "たい", "い")):
        return "i_adj"
    if word.endswith(("に", "と")):
        return "adverb"
    if CJK_RE.search(word) and re.search(r"[ぁ-ゖァ-ヺー]$", word):
        return "mixed_inflected"
    return "noun_like"


def first_predicate_gloss(text: str) -> str | None:
    matches = list(re.finditer(r".+?다(?=\s|$)", text))
    if len(matches) >= 2:
        return matches[0].group(0).strip()
    return None


def first_adverb_gloss(text: str) -> str | None:
    for suffix in ("하게", "롭게", "스럽게", "답게", "듯이", "듯", "히", "이", "게"):
        pattern = rf".+?{suffix}(?=\s|$)"
        match = re.match(pattern, text)
        if match and match.end() < len(text):
            return match.group(0).strip()
    return None


def first_short_chunk(text: str) -> str | None:
    parts = [part for part in re.split(r"\s+", text.strip()) if part]
    if len(parts) >= 2:
        return parts[0]
    return None


def simplify_meaning(word: str, meaning: str) -> tuple[str, str]:
    text = re.sub(r"\s+", " ", meaning.strip())
    kind = classify_word(word)

    if not text:
        return text, "empty"

    if word in MANUAL_SIMPLIFIED_MEANINGS:
        return MANUAL_SIMPLIFIED_MEANINGS[word], "manual"

    explicit_parts = [part.strip() for part in EXPLICIT_SEPARATOR_RE.split(text) if part.strip()]
    if len(explicit_parts) >= 2:
        return explicit_parts[0], "explicit_separator"

    predicate = first_predicate_gloss(text)
    if predicate:
        return predicate, "first_predicate"

    adverb = first_adverb_gloss(text)
    if adverb and kind in {
        "kana_expression",
        "adverb",
        "i_adj",
        "na_adj",
        "mixed_inflected",
    }:
        return adverb, "first_adverb_phrase"

    if kind in {"kana_expression", "adverb", "na_adj", "i_adj"}:
        short = first_short_chunk(text)
        if short:
            return short, f"first_chunk_{kind}"

    return text, "unchanged"


def fetch_words(conn: psycopg.Connection) -> list[tuple[str, str | None, str | None]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT word, reading_hiragana, meaning_ko
            FROM jp_vocab_words
            WHERE meaning_ko IS NOT NULL AND btrim(meaning_ko) <> ''
            ORDER BY word
            """
        )
        return cur.fetchall()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export candidate simplified meanings for fast memorization."
    )
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--update-output", default=DEFAULT_UPDATE_OUTPUT)
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    with psycopg.connect(database_url) as conn:
        rows = fetch_words(conn)

    candidates: list[dict[str, str]] = []
    updates: list[dict[str, str]] = []
    for word, reading, meaning in rows:
        current = meaning or ""
        simplified, reason = simplify_meaning(word, current)
        if simplified == current:
            continue

        row = {
            "word": word,
            "reading_hiragana": reading or "",
            "current_meaning_ko": current,
            "simplified_meaning_ko": simplified,
            "word_type": classify_word(word),
            "reason": reason,
        }
        candidates.append(row)
        updates.append(
            {
                "word": word,
                "reading_hiragana": reading or "",
                "meaning_ko": simplified,
            }
        )

    output_path = Path(args.output)
    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=(
                "word",
                "reading_hiragana",
                "current_meaning_ko",
                "simplified_meaning_ko",
                "word_type",
                "reason",
            ),
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(candidates)

    update_path = Path(args.update_output)
    with update_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=("word", "reading_hiragana", "meaning_ko"),
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(updates)

    print(f"candidate_rows={len(candidates)}")
    print(f"output_file={output_path}")
    print(f"update_file={update_path}")


if __name__ == "__main__":
    main()
