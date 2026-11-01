# 04 Adapters

`src/adapters/`: one per format, each `(bytes) → { provider, rows: FocusRow[], unparsed }`.

- `focus-csv.ts`: map columns directly.
- `aws-cur-csv.ts`: CUR 1.0 (`lineItem/...`) and 2.0 (`line_item_...`) headers to FOCUS.
- `aws-invoice-pdf.ts`: extract text deterministically (unpdf), parse service sections and detail lines "$rate per <desc> <qty> <unit> $amount". Lines that match no pattern become unparsed lines, never dropped.

Synthetic fixtures in `tests/fixtures/` (a generator script for the PDF).

**Acceptance**: each adapter test yields expected rows and totals that match the fixture total.
