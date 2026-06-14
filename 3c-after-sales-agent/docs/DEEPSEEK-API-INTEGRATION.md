# DeepSeek API Integration

This project now supports real DeepSeek API calls for the Agent runtime while keeping the deterministic local fallback.

DeepSeek is called through its OpenAI-compatible Chat Completions API:

- Base URL: `https://api.deepseek.com`
- Endpoint: `/chat/completions`
- Default model: `deepseek-v4-flash`

## Environment variables

Create `3c-after-sales-agent/.env.local`:

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=20000
DEEPSEEK_MAX_TOKENS=4000
DEEPSEEK_DISABLED=0
```

## Current live API scope

- `Case Understanding Agent` uses DeepSeek JSON output first.
- `Query Router Agent` uses DeepSeek JSON output first.
- `General Service Agent` uses DeepSeek JSON output first to draft ordinary customer-service answers from retrieved knowledge.
- `Reply Agent` uses DeepSeek JSON output first to draft after-sales replies from policy evidence and risk strategy.
- If the API key is missing, the request fails, the response is invalid, or `DEEPSEEK_DISABLED=1`, the runtime falls back to the existing deterministic local logic.

## Safety behavior

- Rule Guardrail still runs before routing.
- Forced handoff from guardrails is not overridden by the model.
- If the model incorrectly routes a non-general after-sales intent to `general_service`, the runtime falls back to the deterministic safe route.
- Model-generated replies still pass through the existing Review/QA and Template Output safety checks.
- Image evidence-chain analysis is paused. The API shape may still accept `images` for compatibility, but the current runtime does not call a vision model and QA rejects replies that ask users for photos, screenshots, image uploads, or visual proof.

## Verification

Without an API key, these commands should still pass through fallback:

```bash
npm run build:index
npm run smoke:index
npm run build
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke
```

With an API key, run the same smoke tests and inspect the trace rationale for `DeepSeek structured router:`.
