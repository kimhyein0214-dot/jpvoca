from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

import psycopg
from dotenv import load_dotenv


AOZORA_INDEX_URL = "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip"
DEFAULT_STATIC = "public/vocab-static.json"
DEFAULT_CACHE = ".tools/aozora_cache"
DEFAULT_OUTPUT = "public_domain_examples_selected.csv"

AUTHOR_WHITELIST = {
    "芥川龍之介",
    "有島武郎",
    "泉鏡花",
    "梶井基次郎",
    "菊池寛",
    "国木田独歩",
    "坂口安吾",
    "島崎藤村",
    "太宰治",
    "田山花袋",
    "中島敦",
    "夏目漱石",
    "樋口一葉",
    "堀辰雄",
    "宮沢賢治",
    "森鴎外",
    "夢野久作",
    "横光利一",
}

SENTENCE_RE = re.compile(r"[^。！？\n\r]{8,180}[。！？]")
AOZORA_NOTE_RE = re.compile(r"［＃.*?］")
RUBY_RE = re.compile(r"《.*?》")
WHITESPACE_RE = re.compile(r"\s+")
VARIANT_SUFFIXES = ("する", "した", "して", "される", "された", "されて")


@dataclass(frozen=True)
class Source:
    title: str
    author: str
    url: str


def read_static_words(path: Path) -> list[dict[str, str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for word in payload["words"]:
        rows.append(
            {
                "word": word["word"],
                "reading_hiragana": word.get("reading_hiragana") or "",
                "meaning_ko": word.get("meaning_ko") or "",
            }
        )
    return rows


def download_bytes(url: str, cache_dir: Path) -> bytes:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / url.rsplit("/", 1)[-1]
    if cache_path.exists():
        return cache_path.read_bytes()

    with urllib.request.urlopen(url, timeout=45) as response:
        data = response.read()
    cache_path.write_bytes(data)
    return data


def read_aozora_index(cache_dir: Path, max_sources: int) -> list[Source]:
    raw = download_bytes(AOZORA_INDEX_URL, cache_dir)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        name = archive.namelist()[0]
        text = archive.read(name).decode("utf-8-sig", errors="replace")

    selected: list[Source] = []
    seen_titles: set[tuple[str, str]] = set()
    per_author: dict[str, int] = {}
    reader = csv.DictReader(io.StringIO(text))

    for row in reader:
        author = f"{row.get('姓', '')}{row.get('名', '')}"
        if author not in AUTHOR_WHITELIST:
            continue
        if row.get("役割フラグ") != "著者":
            continue
        if row.get("作品著作権フラグ") != "なし" or row.get("人物著作権フラグ") != "なし":
            continue
        if row.get("文字遣い種別") != "新字新仮名":
            continue

        url = (row.get("テキストファイルURL") or "").strip()
        if not url or not url.endswith(".zip"):
            continue

        title = (row.get("作品名") or "").strip()
        key = (title, author)
        if not title or key in seen_titles:
            continue

        if per_author.get(author, 0) >= 12:
            continue

        selected.append(Source(title=title, author=author, url=url))
        seen_titles.add(key)
        per_author[author] = per_author.get(author, 0) + 1
        if len(selected) >= max_sources:
            break

    return selected


def read_zip_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        text_name = next(
            name
            for name in archive.namelist()
            if name.lower().endswith(".txt") and not name.endswith("/")
        )
        raw = archive.read(text_name)
    return raw.decode("cp932", errors="replace")


def clean_aozora_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    parts = text.split("----------")
    if len(parts) >= 3:
        text = "----------".join(parts[2:])
    text = AOZORA_NOTE_RE.sub("", text)
    text = text.replace("｜", "")
    text = RUBY_RE.sub("", text)
    text = WHITESPACE_RE.sub("", text)
    return text


def word_candidates(word: str) -> list[str]:
    candidates = [word]
    if "・" in word:
        candidates.extend(part for part in word.split("・") if part)
    if word.startswith("〜"):
        candidates.append(word[1:])
    for suffix in VARIANT_SUFFIXES:
        if word.endswith(suffix) and len(word) > len(suffix) + 1:
            candidates.append(word[: -len(suffix)])
    return [candidate for candidate in dict.fromkeys(candidates) if candidate]


def useful_sentence(sentence: str, word: str) -> bool:
    if len(sentence) < 10 or len(sentence) > 180:
        return False
    if "底本" in sentence or "校正" in sentence or "入力" in sentence:
        return False
    return any(candidate in sentence for candidate in word_candidates(word))


def find_matches(
    words: list[dict[str, str]], sources: list[Source], cache_dir: Path
) -> dict[str, dict[str, str]]:
    matches: dict[str, dict[str, str]] = {}
    remaining = {row["word"]: row for row in words}

    for source in sources:
        if not remaining:
            break
        try:
            raw = download_bytes(source.url, cache_dir)
            text = clean_aozora_text(read_zip_text(raw))
        except Exception as exc:
            print(f"SKIP source {source.title}: {exc}")
            continue

        sentences = SENTENCE_RE.findall(text)
        for word, row in list(remaining.items()):
            for sentence in sentences:
                if useful_sentence(sentence, word):
                    matches[word] = {
                        **row,
                        "source_title": source.title,
                        "source_author": source.author,
                        "source_url": source.url,
                        "example_jp": sentence,
                    }
                    remaining.pop(word)
                    break

    return matches


def write_matches(path: Path, matches: dict[str, dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "word",
                "reading_hiragana",
                "meaning_ko",
                "source_title",
                "source_author",
                "source_url",
                "example_jp",
                "example_ko",
                "source",
            ],
            lineterminator="\n",
        )
        writer.writeheader()
        for row in matches.values():
            writer.writerow(
                {
                    **row,
                    "example_ko": "",
                    "source": (
                        "public_domain:"
                        f"青空文庫:{row['source_title']}:{row['source_author']}"
                    ),
                }
            )


def apply_to_db(
    matches: dict[str, dict[str, str]], purge_generated: bool = False
) -> dict[str, int]:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    generated_sources = (
        "generated_n1_auto_complete_20260601",
        "generated_n1_review_batch_001",
        "extra_n1_verbs",
    )

    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, word FROM jp_vocab_words")
        word_ids = {word: word_id for word_id, word in cur.fetchall()}

        applied = 0
        missing = 0
        removed_old = 0

        if purge_generated:
            cur.execute(
                """
                DELETE FROM jp_vocab_word_examples
                WHERE source = ANY(%s)
                   OR source LIKE 'pd_guided:%%'
                   OR source IS NULL
                """,
                (list(generated_sources),),
            )
            removed_old += cur.rowcount

        for word, row in matches.items():
            word_id = word_ids.get(word)
            if not word_id:
                missing += 1
                continue

            if not purge_generated:
                cur.execute(
                    """
                    DELETE FROM jp_vocab_word_examples
                    WHERE word_id = %s
                      AND (
                        source = ANY(%s)
                        OR source LIKE 'pd_guided:%%'
                        OR source IS NULL
                      )
                    """,
                    (word_id, list(generated_sources)),
                )
                removed_old += cur.rowcount

            source = f"public_domain:青空文庫:{row['source_title']}:{row['source_author']}"
            cur.execute(
                """
                INSERT INTO jp_vocab_word_examples (
                    word_id, example_jp, example_ko, source, updated_at
                )
                VALUES (%s, %s, NULL, %s, now())
                ON CONFLICT (word_id, example_jp) DO UPDATE SET
                    example_ko = NULL,
                    source = EXCLUDED.source,
                    updated_at = now()
                """,
                (word_id, row["example_jp"], source),
            )
            applied += 1

        conn.commit()

    return {
        "applied_rows": applied,
        "missing_words": missing,
        "removed_old_examples": removed_old,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replace generated examples with public-domain Aozora sentences."
    )
    parser.add_argument("--static", default=DEFAULT_STATIC)
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--max-sources", type=int, default=120)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--purge-generated",
        action="store_true",
        help="Remove generated/template examples that were not backed by public-domain text.",
    )
    args = parser.parse_args()

    cache_dir = Path(args.cache)
    words = read_static_words(Path(args.static))
    sources = read_aozora_index(cache_dir, args.max_sources)
    matches = find_matches(words, sources, cache_dir)
    write_matches(Path(args.output), matches)

    print(f"words_scanned={len(words)}")
    print(f"sources_scanned={len(sources)}")
    print(f"matched_words={len(matches)}")
    print(f"output_file={args.output}")

    if args.apply:
        result = apply_to_db(matches, purge_generated=args.purge_generated)
        for key, value in result.items():
            print(f"{key}={value}")


if __name__ == "__main__":
    main()
