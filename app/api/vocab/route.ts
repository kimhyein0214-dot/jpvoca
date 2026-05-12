import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

type KanjiRow = {
  id: number;
  character: string;
  korean_name: string | null;
  word_count: number;
};

type WordRow = {
  id: number;
  word: string;
  reading_hiragana: string | null;
  meaning_ko: string | null;
  level: string | null;
  pos: string | null;
  source_sheet: string | null;
  kanji: {
    id: number;
    character: string;
    korean_name: string | null;
    position: number;
  }[];
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const DETAIL_FILTERS = new Set(["all", "missing_reading", "missing_meaning"]);

function parseBoundedInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim() ?? "";
    const kanji = searchParams.get("kanji")?.trim() ?? "";
    const shuffleSeed = searchParams.get("shuffleSeed")?.trim() ?? "";
    const detailFilterParam = searchParams.get("detail") ?? "all";
    const detailFilter = DETAIL_FILTERS.has(detailFilterParam)
      ? detailFilterParam
      : "all";
    const limit = parseBoundedInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseBoundedInt(searchParams.get("offset"), 0, 100000);
    const sql = getSql();
    const likeSearch = `%${search}%`;

    const kanjiRows = (await sql`
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
    LIMIT 200
  `) as KanjiRow[];

    const totalRows = (await sql`
    SELECT count(*)::int AS total
    FROM jp_vocab_words w
    WHERE
      (${search} = '' OR w.word ILIKE ${likeSearch}
        OR COALESCE(w.reading_hiragana, '') ILIKE ${likeSearch}
        OR COALESCE(w.meaning_ko, '') ILIKE ${likeSearch}
        OR EXISTS (
          SELECT 1
          FROM jp_vocab_word_kanji wk_search
          JOIN jp_vocab_kanji k_search ON k_search.id = wk_search.kanji_id
          WHERE wk_search.word_id = w.id
            AND (k_search.character ILIKE ${likeSearch}
              OR COALESCE(k_search.korean_name, '') ILIKE ${likeSearch})
        )
      )
      AND (${kanji} = '' OR EXISTS (
        SELECT 1
        FROM jp_vocab_word_kanji wk_filter
        JOIN jp_vocab_kanji k_filter ON k_filter.id = wk_filter.kanji_id
        WHERE wk_filter.word_id = w.id
          AND k_filter.character = ${kanji}
      ))
      AND (${detailFilter} = 'all'
        OR (${detailFilter} = 'missing_reading' AND w.reading_hiragana IS NULL)
        OR (${detailFilter} = 'missing_meaning' AND w.meaning_ko IS NULL)
      )
  `) as { total: number }[];

    const words = (await sql`
    SELECT
      w.id,
      w.word,
      w.reading_hiragana,
      w.meaning_ko,
      w.level,
      w.pos,
      w.source_sheet,
      COALESCE(
        json_agg(
          json_build_object(
            'id', k.id,
            'character', k.character,
            'korean_name', k.korean_name,
            'position', wk.position
          )
          ORDER BY wk.position
        ) FILTER (WHERE k.id IS NOT NULL),
        '[]'::json
      ) AS kanji
    FROM jp_vocab_words w
    LEFT JOIN jp_vocab_word_kanji wk ON wk.word_id = w.id
    LEFT JOIN jp_vocab_kanji k ON k.id = wk.kanji_id
    WHERE
      (${search} = '' OR w.word ILIKE ${likeSearch}
        OR COALESCE(w.reading_hiragana, '') ILIKE ${likeSearch}
        OR COALESCE(w.meaning_ko, '') ILIKE ${likeSearch}
        OR EXISTS (
          SELECT 1
          FROM jp_vocab_word_kanji wk_search
          JOIN jp_vocab_kanji k_search ON k_search.id = wk_search.kanji_id
          WHERE wk_search.word_id = w.id
            AND (k_search.character ILIKE ${likeSearch}
              OR COALESCE(k_search.korean_name, '') ILIKE ${likeSearch})
        )
      )
      AND (${kanji} = '' OR EXISTS (
        SELECT 1
        FROM jp_vocab_word_kanji wk_filter
        JOIN jp_vocab_kanji k_filter ON k_filter.id = wk_filter.kanji_id
        WHERE wk_filter.word_id = w.id
          AND k_filter.character = ${kanji}
      ))
      AND (${detailFilter} = 'all'
        OR (${detailFilter} = 'missing_reading' AND w.reading_hiragana IS NULL)
        OR (${detailFilter} = 'missing_meaning' AND w.meaning_ko IS NULL)
      )
    GROUP BY w.id
    ORDER BY
      CASE
        WHEN ${shuffleSeed} = '' THEN w.word
        ELSE md5(w.id::text || ${shuffleSeed})
      END,
      w.word
    LIMIT ${limit}
    OFFSET ${offset}
  `) as WordRow[];

    const selectedKanji =
      kanjiRows.find((row) => row.character === kanji) ??
      (kanji
        ? ((await sql`
          SELECT
            k.id,
            k.character,
            k.korean_name,
            count(DISTINCT wk.word_id)::int AS word_count
          FROM jp_vocab_kanji k
          LEFT JOIN jp_vocab_word_kanji wk ON wk.kanji_id = k.id
          WHERE k.character = ${kanji}
          GROUP BY k.id, k.character, k.korean_name
          LIMIT 1
        `) as KanjiRow[])[0] ?? null
        : null);

    return NextResponse.json({
      kanji: kanjiRows,
      words,
      selectedKanji,
      totalWords: totalRows[0]?.total ?? 0,
      totalShown: offset + words.length,
      limit,
      offset,
      detailFilter,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown API error";

    console.error("/api/vocab failed", error);

    return NextResponse.json(
      {
        error: "단어장 데이터를 불러오지 못했습니다.",
        detail,
      },
      { status: 500 },
    );
  }
}
