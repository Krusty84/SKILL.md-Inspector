---
name: pdf-form-filler
description: Fill interactive PDF forms (AcroForm) with user-provided data, verify every field, and deliver a flattened copy. Use when the user asks to fill in, complete, or populate a PDF form, provides data alongside a fillable PDF, or mentions PDF form fields, checkboxes, or dropdowns. Do not use for creating PDFs from scratch, merging or splitting PDFs, or scanned/image-only forms with no interactive fields - for those, tell the user this skill cannot help and suggest an OCR-based approach instead.
---

# PDF Form Filler

Fill AcroForm PDFs programmatically and prove the result is correct before
handing it over. The failure mode to design against: a form that *looks* filled
in one viewer but shows empty fields in another.

## Quick start

```bash
python scripts/fill_form.py --list form.pdf              # discover fields
python scripts/fill_form.py form.pdf data.json out.pdf   # fill + flatten
```

## Workflow

### 1. Inspect the form

Run `scripts/fill_form.py --list` to dump every field with its type, current
value, and (for choices) allowed options.

- **Zero fields found** → this is not an AcroForm. Stop and tell the user; do
  not attempt to overlay text at guessed coordinates.
- **Cryptic field names** (`Text_1`, `untitled4`) → map them to meaning using
  the page number and nearby label text; see
  [references/field-types.md](references/field-types.md) for how each field
  type reports its label.

### 2. Map user data to fields

Build a JSON object of `field_name: value`. Rules that prevent the common bugs:

- Checkboxes take their **export value** (often `/Yes`, sometimes `/On` or
  custom) — `true` does not work. `--list` prints the export value.
- Radio groups are one field; set the group to the chosen option's export value.
- Dropdowns/list boxes only accept values from their options list. If the
  user's value is not in the list, ask — do not pick the "closest" option.
- Leave fields the user gave no data for untouched. Never invent values.

If any required data is missing or ambiguous (e.g. two date fields, one date
provided), ask the user before filling.

### 3. Fill and flatten

Run the fill script. It sets `NeedAppearances`, writes values, and flattens so
the values render everywhere. Flattening makes fields read-only — if the user
wants the form to stay editable, pass `--no-flatten` and warn them some viewers
may not show the values.

### 4. Verify (mandatory)

1. Re-open the output and dump field values (or text, if flattened); confirm
   every value you set is present and correct.
2. Render page 1 to an image and look at it: values must sit inside their
   boxes, not truncated, checkboxes visibly ticked.
3. Confirm page count and non-form content are unchanged from the input.

Any mismatch → fix the mapping and repeat. Do not deliver unverified output.

### 5. Deliver

Send the output file plus a short table of field → value that was filled, and
list any fields intentionally left blank.

## Edge cases

- **Encrypted/password PDF**: ask for the password; never try to strip
  protection.
- **XFA forms** (`--list` reports XFA): legacy Adobe format, not supported —
  say so explicitly rather than producing a file that only works in Acrobat.
- **Date fields with format hints** (`mm/dd/yyyy` in the tooltip): match the
  hinted format exactly.
- **Text longer than the field**: warn the user and ask whether to abbreviate;
  flattened truncation is invisible to them otherwise.

## Files

| File | When to read it |
|---|---|
| [references/field-types.md](references/field-types.md) | Field-type quirks: export values, radio hierarchies, rich-text fields |
| [scripts/fill_form.py](scripts/fill_form.py) | The fill/list/flatten implementation (pypdf) |
