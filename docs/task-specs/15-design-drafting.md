# 15 Idea drafting: cheap pair + tie-breaker

`POST /api/designs`: GLM 5.3 and DeepSeek V4 draft in parallel (strict JSON schema, temperature 0); code checks agreement; on disagreement GPT-6.1 Sol drafts independently and code takes a per-field majority. Postgres cache (`design_drafts`), 10/hour/IP rate limit, `/config` tells the UI whether drafting is on. See `docs/system-specs/design-path.md`.

**Acceptance**: tests with canned drafts cover agree, escalate, failure and cache paths; done. **Follow-up**: run `bun run tests/design-eval.ts` once `OPENROUTER_API_KEY` is set and tune `rules.md` if most ideas escalate.
