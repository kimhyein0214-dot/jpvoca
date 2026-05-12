BEGIN;

CREATE TABLE IF NOT EXISTS jp_vocab_words (
    id bigserial PRIMARY KEY,
    word text NOT NULL UNIQUE,
    reading_hiragana text,
    meaning_ko text,
    level text DEFAULT 'N1',
    pos text,
    source_sheet text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jp_vocab_kanji (
    id bigserial PRIMARY KEY,
    character text NOT NULL UNIQUE,
    korean_name text,
    korean_sound text,
    korean_meaning text,
    onyomi text,
    kunyomi text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jp_vocab_word_kanji (
    word_id bigint REFERENCES jp_vocab_words(id) ON DELETE CASCADE,
    kanji_id bigint REFERENCES jp_vocab_kanji(id) ON DELETE CASCADE,
    position int NOT NULL,
    PRIMARY KEY (word_id, kanji_id, position)
);

CREATE TABLE IF NOT EXISTS jp_vocab_word_examples (
    id bigserial PRIMARY KEY,
    word_id bigint NOT NULL REFERENCES jp_vocab_words(id) ON DELETE CASCADE,
    example_jp text NOT NULL,
    example_ko text,
    source text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (word_id, example_jp)
);

CREATE TABLE IF NOT EXISTS jp_vocab_user_word_progress (
    id bigserial PRIMARY KEY,
    word_id bigint NOT NULL REFERENCES jp_vocab_words(id) ON DELETE CASCADE,
    user_key text NOT NULL,
    status text DEFAULT 'new',
    correct_count int DEFAULT 0,
    wrong_count int DEFAULT 0,
    last_reviewed_at timestamptz,
    next_review_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (word_id, user_key)
);

CREATE TABLE IF NOT EXISTS jp_vocab_favorite_words (
    id bigserial PRIMARY KEY,
    word_id bigint NOT NULL REFERENCES jp_vocab_words(id) ON DELETE CASCADE,
    user_key text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (word_id, user_key)
);

CREATE INDEX IF NOT EXISTS idx_jp_vocab_word_kanji_kanji_id
    ON jp_vocab_word_kanji (kanji_id);

CREATE INDEX IF NOT EXISTS idx_jp_vocab_words_level
    ON jp_vocab_words (level);

CREATE INDEX IF NOT EXISTS idx_jp_vocab_words_source_sheet
    ON jp_vocab_words (source_sheet);

COMMIT;
