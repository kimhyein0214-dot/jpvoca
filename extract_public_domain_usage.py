from __future__ import annotations

import argparse
import csv
import re
import urllib.request
import zipfile
from pathlib import Path


DEFAULT_SOURCES = "pd_sources_aozora.csv"
DEFAULT_WORDS = "missing_word_examples.csv"
DEFAULT_OUTPUT = "public_domain_usage_matches.csv"
DEFAULT_CACHE = ".tools/aozora_cache"

SENTENCE_RE = re.compile(r"[^。！？\n\r]{6,160}[。！？]")
AOZORA_NOTE_RE = re.compile(r"［＃.*?］")
RUBY_BASE_MARK_RE = re.compile(r"｜")
RUBY_RE = re.compile(r"《[^》]+》")
WHITESPACE_RE = re.compile(r"\s+")


def clean_aozora_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    parts = text.split("----------")
    if len(parts) >= 3:
        text = "----------".join(parts[2:])
    text = AOZORA_NOTE_RE.sub("", text)
    text = RUBY_BASE_MARK_RE.sub("", text)
    text = RUBY_RE.sub("", text)
    text = WHITESPACE_RE.sub("", text)
    return text


def normalize_word_for_match(word: str) -> list[str]:
    candidates = [word]
    if "・" in word:
      candidates.extend(part for part in word.split("・") if part)
    if word.startswith("～"):
      candidates.append(word[1:])
    return [candidate for candidate in dict.fromkeys(candidates) if candidate]


def read_words(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        rows = []
        for row in reader:
            word = (row.get("word") or "").strip()
            if not word:
                continue
            rows.append(
                {
                    "word": word,
                    "reading_hiragana": (row.get("reading_hiragana") or "").strip(),
                    "meaning_ko": (row.get("meaning_ko") or "").strip(),
                }
            )
        return rows


def read_sources(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return [
            {
                "title": row["title"].strip(),
                "author": row["author"].strip(),
                "url": row["url"].strip(),
                "note": (row.get("note") or "").strip(),
            }
            for row in csv.DictReader(file)
            if row.get("url")
        ]


def download_zip(url: str, cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path = cache_dir / url.rsplit("/", 1)[-1]
    if output_path.exists():
        return output_path
    urllib.request.urlretrieve(url, output_path)
    return output_path


def read_zip_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        text_names = [
            name
            for name in archive.namelist()
            if name.lower().endswith(".txt") and not name.endswith("/")
        ]
        if not text_names:
            raise RuntimeError(f"No txt file found in {path}")
        raw = archive.read(text_names[0])
    return raw.decode("cp932", errors="replace")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract public-domain usage sentences for vocabulary words."
    )
    parser.add_argument("--sources", default=DEFAULT_SOURCES)
    parser.add_argument("--words", default=DEFAULT_WORDS)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--max-per-word", type=int, default=3)
    args = parser.parse_args()

    word_rows = read_words(Path(args.words))
    sources = read_sources(Path(args.sources))
    cache_dir = Path(args.cache)
    matches: dict[str, list[dict[str, str]]] = {row["word"]: [] for row in word_rows}

    for source in sources:
        try:
            zip_path = download_zip(source["url"], cache_dir)
            text = clean_aozora_text(read_zip_text(zip_path))
        except Exception as exc:
            print(f"SKIP source {source['title']}: {exc}")
            continue

        sentences = SENTENCE_RE.findall(text)
        for row in word_rows:
            word = row["word"]
            if len(matches[word]) >= args.max_per_word:
                continue
            candidates = normalize_word_for_match(word)
            for sentence in sentences:
                if any(candidate in sentence for candidate in candidates):
                    matches[word].append(
                        {
                            **row,
                            "source_title": source["title"],
                            "source_author": source["author"],
                            "source_url": source["url"],
                            "matched_sentence": sentence,
                        }
                    )
                    break

    output_path = Path(args.output)
    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "word",
                "reading_hiragana",
                "meaning_ko",
                "source_title",
                "source_author",
                "source_url",
                "matched_sentence",
            ],
        )
        writer.writeheader()
        exported = 0
        for word in matches:
            for match in matches[word]:
                writer.writerow(match)
                exported += 1

    covered = sum(1 for word, word_matches in matches.items() if word_matches)
    print(f"words_scanned={len(word_rows)}")
    print(f"sources_scanned={len(sources)}")
    print(f"words_with_matches={covered}")
    print(f"matches_exported={exported}")
    print(f"output_file={output_path}")


if __name__ == "__main__":
    main()
