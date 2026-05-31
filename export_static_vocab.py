import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv


DEFAULT_OUTPUT = "public/vocab-static.json"


def fetch_words(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              w.id,
              w.word,
              w.reading_hiragana,
              w.meaning_ko,
              w.level,
              w.source_sheet,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'id', k.id,
                      'character', k.character,
                      'korean_name', k.korean_name,
                      'position', wk.position
                    )
                    ORDER BY wk.position
                  )
                  FROM jp_vocab_word_kanji wk
                  JOIN jp_vocab_kanji k ON k.id = wk.kanji_id
                  WHERE wk.word_id = w.id
                ),
                '[]'::json
              ) AS kanji,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'id', e.id,
                      'example_jp', e.example_jp,
                      'example_ko', e.example_ko,
                      'source', e.source
                    )
                    ORDER BY e.id
                  )
                  FROM jp_vocab_word_examples e
                  WHERE e.word_id = w.id
                ),
                '[]'::json
              ) AS examples
            FROM jp_vocab_words w
            ORDER BY w.word
            """
        )
        rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "word": row[1],
            "reading_hiragana": row[2],
            "meaning_ko": row[3],
            "level": row[4],
            "source_sheet": row[5],
            "kanji": row[6],
            "examples": row[7],
        }
        for row in rows
    ]


def fetch_kanji(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              k.id,
              k.character,
              k.korean_name,
              count(DISTINCT wk.word_id)::int AS word_count
            FROM jp_vocab_kanji k
            LEFT JOIN jp_vocab_word_kanji wk ON wk.kanji_id = k.id
            GROUP BY k.id, k.character, k.korean_name
            ORDER BY
              CASE WHEN k.korean_name IS NULL THEN 1 ELSE 0 END,
              word_count DESC,
              k.character
            """
        )
        rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "character": row[1],
            "korean_name": row[2],
            "word_count": row[3],
        }
        for row in rows
    ]


def main():
    parser = argparse.ArgumentParser(
        description="Export jp_vocab_ tables to a static JSON file for GitHub Pages."
    )
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    load_dotenv()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set.")

    with psycopg.connect(database_url) as conn:
        words = fetch_words(conn)
        kanji = fetch_kanji(conn)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "word_count": len(words),
        "kanji_count": len(kanji),
        "kanji": kanji,
        "words": words,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(f"output_file={output_path}")
    print(f"word_count={len(words)}")
    print(f"kanji_count={len(kanji)}")


if __name__ == "__main__":
    main()
