SELECT 'total_words' AS metric, count(*)::bigint AS value
FROM jp_vocab_words;

SELECT 'total_kanji' AS metric, count(*)::bigint AS value
FROM jp_vocab_kanji;

SELECT 'total_word_kanji_relations' AS metric, count(*)::bigint AS value
FROM jp_vocab_word_kanji;

SELECT 'duplicate_words' AS metric, count(*)::bigint AS value
FROM (
    SELECT word
    FROM jp_vocab_words
    GROUP BY word
    HAVING count(*) > 1
) duplicated;

SELECT 'words_without_kanji_relation' AS metric, count(*)::bigint AS value
FROM jp_vocab_words w
WHERE NOT EXISTS (
    SELECT 1
    FROM jp_vocab_word_kanji wk
    WHERE wk.word_id = w.id
);

SELECT w.id, w.word, w.reading_hiragana, w.meaning_ko, w.source_sheet
FROM jp_vocab_words w
JOIN jp_vocab_word_kanji wk ON wk.word_id = w.id
JOIN jp_vocab_kanji k ON k.id = wk.kanji_id
WHERE k.character = '一'
ORDER BY w.word
LIMIT 20;

SELECT w.id, w.word, w.reading_hiragana, w.meaning_ko, w.source_sheet
FROM jp_vocab_words w
JOIN jp_vocab_word_kanji wk ON wk.word_id = w.id
JOIN jp_vocab_kanji k ON k.id = wk.kanji_id
WHERE k.character = '学'
ORDER BY w.word
LIMIT 20;

SELECT
    w.id,
    w.word,
    w.reading_hiragana,
    w.meaning_ko,
    string_agg(k.character, '' ORDER BY wk.position) AS connected_kanji
FROM jp_vocab_words w
LEFT JOIN jp_vocab_word_kanji wk ON wk.word_id = w.id
LEFT JOIN jp_vocab_kanji k ON k.id = wk.kanji_id
GROUP BY w.id, w.word, w.reading_hiragana, w.meaning_ko
ORDER BY w.id
LIMIT 10;

SELECT 'reading_hiragana_null_words' AS metric, count(*)::bigint AS value
FROM jp_vocab_words
WHERE reading_hiragana IS NULL;

SELECT 'meaning_ko_null_words' AS metric, count(*)::bigint AS value
FROM jp_vocab_words
WHERE meaning_ko IS NULL;

SELECT 'korean_name_null_kanji' AS metric, count(*)::bigint AS value
FROM jp_vocab_kanji
WHERE korean_name IS NULL;
