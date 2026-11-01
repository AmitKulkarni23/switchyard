# 08 LLM fallback hook

`src/llm/fallback.ts`: `classifyUnparsed(lines) → Promise<FocusRow[]>` interface. Disabled unless `LLM_FALLBACK_ENABLED=true` and `OPENROUTER_API_KEY` is set; even then v1 throws "not implemented". Pipeline calls it only when enabled. Default path never touches the network.

**Acceptance**: test that the default config returns [] without a network call.
