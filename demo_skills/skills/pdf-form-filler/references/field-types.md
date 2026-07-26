# AcroForm field-type quirks

Reference for mapping user data onto each AcroForm field type. Read this when
`--list` output is confusing or a filled value does not render.

## Text fields (`/Tx`)

- Plain string values. Multiline only if the `Ff` multiline flag is set.
- **Max length**: honor `/MaxLen` if present; longer input is silently cut by
  most viewers.
- **Comb fields** (fixed character cells, common on tax forms): value must be
  exactly the cell count or fewer; spaces count.
- Rich-text fields (`/RV` present): write the plain `/V` too, or non-Adobe
  viewers show nothing.

## Checkboxes (`/Btn`, no radio flag)

- The "on" state is the **export value** — found under
  `/AP → /N` as the non-`/Off` key. Usually `/Yes`, but forms generated from
  Word often use `/On`, and localized forms use arbitrary names (`/Ja`, `/1`).
- To untick: set `/Off` (always literally `/Off`, regardless of export value).

## Radio groups (`/Btn` with radio flag)

- One *group* field with several widget kids; each kid has its own export
  value. Set the **group's** `/V` to the chosen kid's export value.
- Kids without distinct export values (broken form): report to the user; the
  choice cannot be expressed reliably.

## Dropdowns & list boxes (`/Ch`)

- `/Opt` holds the options. Entries may be pairs `[export, display]` — the
  user sees *display*, but `/V` must be the **export** string.
- Editable combos (`Ff` edit flag) accept free text; plain dropdowns do not.
- Multi-select list boxes take an array in `/V`.

## Signature fields (`/Sig`)

- Never fill these. Filling requires a cryptographic signing workflow; writing
  a name string into a signature field produces an invalid document. Leave the
  field empty and tell the user.

## Appearance streams

After changing any value, either regenerate appearances or set
`NeedAppearances=true` (the script does the latter, then flattens). Skipping
both is the #1 cause of "the PDF is empty when I open it".
