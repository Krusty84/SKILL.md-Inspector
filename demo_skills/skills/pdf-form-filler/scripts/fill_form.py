#!/usr/bin/env python3
"""Fill an AcroForm PDF from a JSON mapping, or list its fields.

Usage:
    fill_form.py --list FORM.pdf
    fill_form.py [--no-flatten] FORM.pdf DATA.json OUT.pdf

DATA.json is a flat object of field name -> value. Checkboxes and radio
groups take their export value (see --list output), not booleans.
"""

import argparse
import json
import sys

from pypdf import PdfReader, PdfWriter


def list_fields(path: str) -> int:
    reader = PdfReader(path)
    fields = reader.get_fields()
    if not fields:
        print("No AcroForm fields found (not a fillable form).", file=sys.stderr)
        return 1
    for name, field in fields.items():
        ftype = field.get("/FT", "?")
        value = field.get("/V", "")
        states = field.get("/_States_", "")
        line = f"{name}\ttype={ftype}\tvalue={value!r}"
        if states:
            line += f"\toptions={states}"
        print(line)
    return 0


def fill(path: str, data_path: str, out_path: str, flatten: bool) -> int:
    with open(data_path, encoding="utf-8") as fh:
        data = json.load(fh)

    reader = PdfReader(path)
    known = set(reader.get_fields() or {})
    unknown = sorted(set(data) - known)
    if unknown:
        print(f"Unknown fields in data: {', '.join(unknown)}", file=sys.stderr)
        return 1

    writer = PdfWriter()
    writer.append(reader)
    for page in writer.pages:
        writer.update_page_form_field_values(
            page, data, auto_regenerate=False
        )
    writer.set_need_appearances_writer(True)
    if flatten:
        writer.flatten()

    with open(out_path, "wb") as fh:
        writer.write(fh)
    print(f"Wrote {out_path} ({len(data)} fields set, flatten={flatten})")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", dest="list_only")
    parser.add_argument("--no-flatten", action="store_true")
    parser.add_argument("pdf")
    parser.add_argument("data", nargs="?")
    parser.add_argument("out", nargs="?")
    args = parser.parse_args()

    if args.list_only:
        return list_fields(args.pdf)
    if not (args.data and args.out):
        parser.error("DATA.json and OUT.pdf are required unless --list is given")
    return fill(args.pdf, args.data, args.out, flatten=not args.no_flatten)


if __name__ == "__main__":
    sys.exit(main())
