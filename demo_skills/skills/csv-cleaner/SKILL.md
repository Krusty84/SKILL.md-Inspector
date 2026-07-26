---
name: csv-cleaner
description: Clean and normalize messy CSV/TSV files - fix malformed rows, inconsistent headers, mixed encodings, stray delimiters, and duplicated records - and deliver a valid, verified file. Use when the user mentions a broken, messy, or malformed CSV, a file a spreadsheet tool refuses to open, or asks to deduplicate or normalize tabular data. Do not use when the deliverable is analysis or a chart rather than a cleaned file, or for Excel-native features like formulas and pivot tables.
---

# CSV Cleaner

Repair a malformed delimited file into one that parses cleanly, without
silently losing data.

## Core principle

**Never destroy data silently.** Every dropped row, merged duplicate, or
coerced value must be counted and reported to the user at the end.

## Workflow

### 1. Diagnose before touching anything

```bash
file -i input.csv          # encoding
head -5 input.csv          # delimiter, header shape
wc -l input.csv            # row count baseline
```

Then attempt a strict parse (e.g. Python `csv` with `strict=True`) and record
*every* failure with its line number. Common findings:

| Symptom | Likely cause |
|---|---|
| Field count varies by row | unquoted delimiter inside a value |
| `�` replacement chars | wrong encoding assumption (try cp1252, latin-1) |
| Header repeats mid-file | concatenated exports |
| Rows of only commas | trailing padding from export tool |

### 2. Fix in this order

1. Encoding → convert to UTF-8 first; everything downstream assumes it.
2. Structural repairs → re-quote fields containing delimiters, remove repeated
   header rows, drop fully-empty rows.
3. Header normalization → trim whitespace, deduplicate column names
   (`name`, `name_2`), only rename beyond that if the user asked.
4. Value normalization → only what the user requested (date formats, casing,
   whitespace). Do not "improve" values unprompted.
5. Deduplication → only if requested. Ask which columns define identity if it
   is ambiguous; exact-full-row duplicates may be merged without asking.

### 3. Verify — this step is not optional

Re-parse the output strictly. The job is done only when all of these hold:

- [ ] Strict parse succeeds with zero errors
- [ ] Every row has the same field count as the header
- [ ] `rows_in == rows_out + rows_dropped` (and each dropped row is accounted for)
- [ ] Spot-check 3 rows against the original file — values survived intact

If verification fails, fix and re-verify. Never hand over a file that did not
pass.

### 4. Report

Tell the user: what was wrong, what was changed, exact counts
(rows in / out / dropped / merged), and anything that needs their judgment.
Write the result to a new file — never overwrite the original.

## Edge cases

- **Huge files** (>100 MB): stream row-by-row; never load into memory at once.
- **Ambiguous delimiter** (commas *and* semicolons present): count candidate
  delimiters per line across a sample; the one with a consistent count wins.
  If neither is consistent, ask the user.
- **No header row**: confirm with the user before inventing column names.
- **Numeric-looking IDs with leading zeros**: treat as strings; flag if asked
  to convert to numbers.
