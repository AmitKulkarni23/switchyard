# 09 Upload API

`POST /api/estimates` (multipart `file`): max 10 MB, detect by content, upload to the private bucket (`Bun.S3Client`), parse, delete the object in `finally`, return `{ workload, estimate }`. 415 for unsupported formats, 413 for too large, 422 for unparseable. Without bucket env vars (local dev) parse in memory only. Raw bytes never logged or stored.

**Acceptance**: server tests for success, 413, 415; bucket delete runs on failure (mocked client).
