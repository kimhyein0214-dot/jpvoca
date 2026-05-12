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

## Web App

This folder also contains a Next.js web app for browsing the imported `jp_vocab_` tables.

### Features

- Lists vocabulary from `jp_vocab_words`.
- Shows kanji per word from `jp_vocab_word_kanji` and `jp_vocab_kanji`.
- Filters words by clicked kanji.
- Displays `korean_name` for the selected kanji.
- Searches word, kanji, hiragana reading, Korean meaning, and kanji Korean name.
- Keeps `DATABASE_URL` in server-only code through `app/api/vocab/route.ts`.
- Displays `읽기 미등록` and `뜻 미등록` when database values are `NULL`.

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

The app reads `DATABASE_URL` from `.env` on the server side. Do not rename it to `NEXT_PUBLIC_DATABASE_URL`.

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
