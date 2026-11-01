# 11 Railway infra

Add Postgres and a private bucket to `.railway/railway.ts`; wire `DATABASE_URL` and bucket credentials into the app service (`switchyard`, originally `web`) by reference. `railway config plan` then `apply`; verify `/health` and an upload on the deployed URL with a synthetic fixture. Update `docs/system-specs/security-and-infra.md`.

**Acceptance**: deployed upload returns an estimate and a share id; bucket is empty afterwards.
