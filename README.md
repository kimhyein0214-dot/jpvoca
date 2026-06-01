# N1 Kanji Vocabulary Import

This folder contains a repeatable PostgreSQL import for `n1-vocab-kanji.xlsx`.

## Safety Rules

- Uses only tables with the `jp_vocab_` prefix.
- Does not use `DROP TABLE` or `TRUNCATE`.
- Uses PostgreSQL SQL and `INSERT ... ON CONFLICT` upserts.
- Reads `DATABASE_URL` from `.env`.
- Does not generate missing readings or meanings.

## Files

- `schema.sql`: creates the vocabulary tables and indexes.
- `import_vocab.py`: reads all workbook sheets and imports kanji-containing words.
- `import_vocab_2.py`: imports new kanji-containing words from `n1-vocab-kanji_2.xlsx`.
- `update_word_examples.py`: upserts example sentences into `jp_vocab_word_examples`.
- `export_missing_word_examples.py`: exports words that still need examples.
- `extract_public_domain_usage.py`: finds public-domain Aozora Bunko usage lines for words that still need examples.
- `export_simplify_meaning_candidates.py`: exports fast-memorization Korean meaning simplification candidates.
- `verify.sql`: runs count and sample validation queries.
- `requirements.txt`: Python dependencies.

## Setup

If your shell has Python available:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

In Codex Desktop, a bundled Python runtime may also be used if system Python is not installed.

## Run

Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

Apply schema:

```powershell
python -c "import os, psycopg; from dotenv import load_dotenv; load_dotenv(); sql=open('schema.sql', encoding='utf-8').read(); conn=psycopg.connect(os.environ['DATABASE_URL']); conn.execute(sql); conn.commit(); conn.close()"
```

Import workbook:

```powershell
python import_vocab.py
```

Import the second workbook without adding duplicates or kana-only words:

```powershell
python import_vocab_2.py --dry-run
python import_vocab_2.py
python export_static_vocab.py
```

Import kana-only or katakana words from the second workbook too:

```powershell
python import_vocab_2.py --include-no-kanji --dry-run
python import_vocab_2.py --include-no-kanji
python export_static_vocab.py
```

Verify:

```powershell
python -c "import os, psycopg; from dotenv import load_dotenv; load_dotenv(); sql=open('verify.sql', encoding='utf-8').read(); conn=psycopg.connect(os.environ['DATABASE_URL']); cur=conn.cursor(); cur.execute(sql); print(cur.fetchall()); conn.close()"
```

## Import Behavior

- All sheets are scanned.
- Empty cells and whitespace are cleaned.
- Only strings containing CJK kanji are imported as words.
- Duplicate words are merged before database import.
- Kanji are extracted from each word.
- Word-kanji relation rows store the 1-based character position inside the word.
- `reading_hiragana` and `meaning_ko` stay `NULL` when not present in the workbook.

`import_vocab_2.py` is stricter:

- Reads only the first column of `n1-vocab-kanji_2.xlsx`.
- Skips words already present in `jp_vocab_words`.
- Skips duplicate words inside the workbook.
- Skips words without CJK kanji unless `--include-no-kanji` is used.
- Leaves `reading_hiragana` and `meaning_ko` as `NULL`.
- Words without CJK kanji are stored in `jp_vocab_words` only and have no `jp_vocab_word_kanji` relation rows.

## Web App

This folder also contains a Next.js web app for browsing the exported vocabulary JSON.

### Features

- Lists vocabulary exported from `jp_vocab_words`.
- Shows kanji per word exported from `jp_vocab_word_kanji` and `jp_vocab_kanji`.
- Filters words by clicked kanji.
- Displays `korean_name` for the selected kanji.
- Searches word, kanji, hiragana reading, Korean meaning, and kanji Korean name.
- Uses `public/vocab-static.json` in the browser, so GitHub Pages can host it without a server.
- Displays `읽기 미등록` and `뜻 미등록` when database values are `NULL`.
- Can toggle furigana on example sentences. Furigana segments are generated into `public/vocab-static.json` during export.

### Install and Run

Install Node dependencies:

```powershell
npm install
```

If `npm` is not on PATH in Codex Desktop, the project can use the local npm CLI downloaded under `.tools`:

```powershell
& 'C:\Users\hihi0\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .tools\package\bin\npm-cli.js install --ignore-scripts
```

Start the local dev server:

```powershell
npm run dev
```

Codex Desktop fallback:

```powershell
& 'C:\Users\hihi0\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\next\dist\bin\next dev -p 3000
```

Open:

```text
http://localhost:3000
```

The local app reads `public/vocab-static.json`. If the database changes, regenerate that JSON before deploying.

## Export Static Vocabulary JSON

Use `export_static_vocab.py` to export the current Neon PostgreSQL vocabulary into a browser-readable JSON file.

Output file:

```text
public/vocab-static.json
```

Run:

```powershell
python export_static_vocab.py
```

Behavior:

- Reads `DATABASE_URL` from `.env`.
- Exports all words and kanji into one JSON file.
- The deployed GitHub Pages app reads only this JSON file.
- `DATABASE_URL` is not included in the deployed site.

## Update Word Examples From CSV

Use `update_word_examples.py` to add N1-level example sentences.

Input file:

```text
word_examples.csv
```

Required CSV columns:

```text
word,example_jp,example_ko
```

Optional column:

```text
source
```

Run:

```powershell
python export_missing_word_examples.py
python update_word_examples.py --csv word_examples.csv
python export_static_vocab.py
```

Behavior:

- Matches examples by exact `word`.
- Skips words that do not exist in `jp_vocab_words`.
- Uses `INSERT ... ON CONFLICT` so the same CSV can be run repeatedly.
- The web app displays the first example below each word row when examples exist.

## Public Domain Usage References

Use `extract_public_domain_usage.py` when you want to check how missing words appear in public-domain Aozora Bunko texts before writing study examples.

Input files:

```text
missing_word_examples.csv
pd_sources_aozora.csv
```

Run:

```powershell
python export_missing_word_examples.py
python extract_public_domain_usage.py --max-per-word 2
```

Output file:

```text
public_domain_usage_matches.csv
```

Behavior:

- Downloads the listed Aozora Bunko zip files into `.tools/aozora_cache`.
- Strips ruby notes and editor annotations before matching.
- Exports matched public-domain usage lines with title, author, and URL.
- Intended as a reference source for writing modern N1-level examples, not as an automatic raw quote importer.

## Deploy To GitHub Pages

This app is configured for static GitHub Pages deployment. It does not need Netlify, Vercel, or a server API.

The repository includes `.github/workflows/pages.yml`.

In GitHub:

1. Open the repository settings.
2. Go to `Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to the `main` branch.

The workflow builds with `GITHUB_PAGES=true`, exports the static site into `out`, and deploys it.

Public URL format:

```text
https://<github-user>.github.io/jpvoca/
```

## Update Word Details From CSV

Use `update_word_details.py` to fill `reading_hiragana` and `meaning_ko` in `jp_vocab_words`.

Input file:

```text
word_details.csv
```

Required CSV columns:

```text
word,reading_hiragana,meaning_ko
```

Run:

```powershell
python update_word_details.py
```

Codex Desktop bundled Python example:

```powershell
& 'C:\Users\hihi0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' update_word_details.py
```

Optional custom CSV path:

```powershell
python update_word_details.py --csv sample_word_details.csv
```

Behavior:

- Reads `DATABASE_URL` from `.env`.
- Updates rows by exact `word` match.
- Updates only `reading_hiragana` and `meaning_ko`.
- Empty CSV cells do not overwrite existing database values.
- Words not found in `jp_vocab_words` are skipped and printed.
- Prints `updated_rows` and `skipped_rows`.

## Simplify Korean Meanings For Memorization

Use `export_simplify_meaning_candidates.py` to shorten multi-gloss Korean meanings into one fast-memorization representative meaning.

Run:

```powershell
python export_simplify_meaning_candidates.py
python update_word_details.py --csv word_details_simplified_meanings.csv
python export_static_vocab.py
```

Output files:

```text
simplified_meaning_candidates.csv
word_details_simplified_meanings.csv
```

Behavior:

- Focuses on adverbs, kana expressions, verbs, and adjectives.
- Keeps noun-like compound meanings unless a safe manual rule exists.
- Uses manual overrides for meanings that should not be mechanically split.
- Does not change the database schema.

## Export Missing Word Details To CSV

Use `export_missing_word_details.py` to export words where `reading_hiragana` or `meaning_ko` is still missing.

Output file:

```text
missing_word_details.csv
```

CSV columns:

```text
word,reading_hiragana,meaning_ko
```

Run:

```powershell
python export_missing_word_details.py
```

Codex Desktop bundled Python example:

```powershell
& 'C:\Users\hihi0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' export_missing_word_details.py
```

Optional custom output path:

```powershell
python export_missing_word_details.py --output missing_word_details.csv
```

Behavior:

- Reads `DATABASE_URL` from `.env`.
- Selects rows from `jp_vocab_words` where `reading_hiragana IS NULL OR meaning_ko IS NULL`.
- Sorts rows by `id`.
- Keeps existing values in the CSV and writes empty cells for missing values.
- Prints `exported_rows` and `output_file`.

## Export Missing Kanji Names To CSV

Use `export_missing_kanji_names.py` to export kanji where `korean_name` is still missing.

Output file:

```text
missing_kanji_names.csv
```

CSV columns:

```text
character,korean_name,korean_meaning,korean_sound
```

Run:

```powershell
python export_missing_kanji_names.py
```

Codex Desktop bundled Python example:

```powershell
& 'C:\Users\hihi0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' export_missing_kanji_names.py
```

Optional custom output path:

```powershell
python export_missing_kanji_names.py --output missing_kanji_names.csv
```

Behavior:

- Reads `DATABASE_URL` from `.env`.
- Selects rows from `jp_vocab_kanji` where `korean_name IS NULL OR korean_name = ''`.
- Sorts rows by `character`.
- Keeps existing values in the CSV and writes empty cells for missing values.
- Prints `exported_rows` and `output_file`.

## Update Kanji Names From CSV

Use `update_kanji_names.py` to fill Korean-style kanji name fields in `jp_vocab_kanji`.

Input file:

```text
kanji_names.csv
```

Required CSV columns:

```text
character,korean_name,korean_meaning,korean_sound
```

Run:

```powershell
python update_kanji_names.py
```

Codex Desktop bundled Python example:

```powershell
& 'C:\Users\hihi0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' update_kanji_names.py
```

Optional custom CSV path:

```powershell
python update_kanji_names.py --csv sample_kanji_names.csv
```

Behavior:

- Reads `DATABASE_URL` from `.env`.
- Updates rows by exact `character` match.
- Updates only `korean_name`, `korean_meaning`, and `korean_sound`.
- Empty CSV cells do not overwrite existing database values.
- Characters not found in `jp_vocab_kanji` are skipped and printed.
- Prints `updated_rows` and `skipped_rows`.
