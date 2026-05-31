from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


DEFAULT_INPUT = "missing_word_examples.csv"
DEFAULT_OUTPUT = "word_examples_remaining_auto.csv"
SOURCE = "generated_n1_auto_complete_20260601"

HIRAGANA_RE = re.compile(r"^[ぁ-ゖー]+$")
KATAKANA_RE = re.compile(r"^[ァ-ヺー・]+$")


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def ko_meaning_text(meaning: str) -> str:
    return meaning or "해당 표현"


def classify(word: str) -> str:
    if "～" in word or word.startswith("~"):
        return "pattern"
    if HIRAGANA_RE.match(word):
        return "kana_expression"
    if KATAKANA_RE.match(word):
        return "katakana"
    if word.endswith("する"):
        return "suru_verb"
    if word.endswith(("う", "く", "ぐ", "す", "つ", "ぬ", "ぶ", "む", "る")) and not word.endswith("なる"):
        return "verb"
    if word.endswith("な"):
        return "na_adj"
    if word.endswith(("しい", "ない", "たい", "い")) and not KATAKANA_RE.match(word):
        return "i_adj"
    if word.endswith(("に", "と")):
        return "adverb"
    return "noun"


def make_example(word: str, meaning: str) -> tuple[str, str]:
    meaning_ko = ko_meaning_text(meaning)
    kind = classify(word)

    if kind == "pattern":
        jp = f"この文章では「{word}」という表現が、前後の関係を整理するために使われている。"
        ko = f"이 문장에서는 '{word}'라는 표현이 앞뒤 관계를 정리하기 위해 쓰이고 있다."
    elif kind == "suru_verb":
        stem = word[:-2]
        jp = f"関係者は状況を正確に把握したうえで、慎重に{word}必要がある。"
        ko = f"관계자는 상황을 정확히 파악한 뒤 신중하게 {meaning_ko}할 필요가 있다."
        if not stem:
            jp = f"必要に応じて{word}ことで、問題の拡大を防ぐことができる。"
    elif kind == "verb":
        jp = f"状況によっては、早めに{word}判断も必要になる。"
        ko = f"상황에 따라서는 일찍 {meaning_ko} 판단도 필요해진다."
    elif kind == "na_adj":
        jp = f"その説明は{word}ものではなく、追加の根拠を示す必要があった。"
        ko = f"그 설명은 {meaning_ko} 것이 아니어서 추가 근거를 제시할 필요가 있었다."
    elif kind == "i_adj":
        jp = f"状況が{word}場合でも、感情に流されず冷静に判断しなければならない。"
        ko = f"상황이 {meaning_ko} 경우에도 감정에 휩쓸리지 말고 냉정하게 판단해야 한다."
    elif kind == "adverb":
        jp = f"彼は周囲の反応を確かめながら、{word}行動した。"
        ko = f"그는 주변 반응을 확인하면서 {meaning_ko} 행동했다."
    elif kind == "kana_expression":
        jp = f"資料では「{word}」という表現が、場面の状態や程度を示す語として使われている。"
        ko = f"자료에서는 '{word}'라는 표현이 상황의 상태나 정도를 나타내는 말로 쓰이고 있다."
    elif kind == "katakana":
        jp = f"この分野では{word}に関する知識が、実務上ますます重要になっている。"
        ko = f"이 분야에서는 {meaning_ko}에 관한 지식이 실무상 점점 더 중요해지고 있다."
    else:
        jp = f"この問題を理解するには、{word}という観点から考えることが重要だ。"
        ko = f"이 문제를 이해하려면 {meaning_ko}이라는 관점에서 생각하는 것이 중요하다."

    return jp, ko


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate examples for all rows in missing_word_examples.csv."
    )
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    rows: list[dict[str, str]] = []
    with input_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        required = {"word", "reading_hiragana", "meaning_ko"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"{input_path} must contain {', '.join(sorted(required))}")

        for row in reader:
            word = clean(row.get("word"))
            if not word:
                continue
            meaning = clean(row.get("meaning_ko"))
            example_jp, example_ko = make_example(word, meaning)
            rows.append(
                {
                    "word": word,
                    "example_jp": example_jp,
                    "example_ko": example_ko,
                    "source": SOURCE,
                }
            )

    seen_words: set[str] = set()
    duplicate_words: list[str] = []
    word_not_in_example: list[str] = []
    for row in rows:
        word = row["word"]
        if word in seen_words:
            duplicate_words.append(word)
        seen_words.add(word)
        if word not in row["example_jp"]:
            word_not_in_example.append(word)

    if duplicate_words:
        raise ValueError(f"Duplicate words in generated rows: {duplicate_words[:10]}")
    if word_not_in_example:
        raise ValueError(
            f"Generated examples missing their word: {word_not_in_example[:10]}"
        )

    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=("word", "example_jp", "example_ko", "source"),
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"input_rows={len(rows)}")
    print(f"output_file={output_path}")
    print("duplicate_words=0")
    print("word_not_in_example=0")


if __name__ == "__main__":
    main()
