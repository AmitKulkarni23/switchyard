# 03 Detect

`backend/detect.ts`: `detect(bytes) → Format` from content only. PDF magic `%PDF-` + "Amazon Web Services" text → `aws-invoice-pdf`. CSV header with `lineItem/UnblendedCost` or `line_item_unblended_cost` → `aws-cur-csv`; with `BilledCost` + `ServiceName` → `focus-csv`. Anything else throws `UnsupportedFormatError` with a clear message. File name is never read.

**Acceptance**: tests on synthetic fixtures, including a renamed file and a random binary.
