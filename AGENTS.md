# alfa-voz-openai

Web test harness for the "Alfa" (Alfaseguros) voice assistant using the OpenAI Realtime API (WebRTC, `gpt-realtime-2.1`, voice Marin), with an optional xAI/Grok "Versão B". A single Node.js/Express service (`server.js`) serves the static UI in `public/` and two API endpoints that proxy to OpenAI.

## Cursor Cloud specific instructions

- Single service, Node.js ESM + Express. Run it in dev with `npm start` (`node server.js`); there is no separate build step or watch/hot-reload — restart the process after editing `server.js` or `prompt_alfa.md` (the prompt is read once at startup). Listens on `$PORT` (default `3000`).
- There is no lint config and no test suite in this repo (`package.json` only defines `start`). Don't assume `npm test`/`npm run lint` exist.
- Endpoints: `GET /health` (works with no secrets), `GET /` (static page), `POST /api/session` (mints an OpenAI/xAI ephemeral realtime token), `POST /api/extract` (post-call summary/field extraction via the OpenAI Responses API).
- Core functionality requires `OPENAI_API_KEY` — both `/api/session` and `/api/extract` call OpenAI and return an `invalid_api_key` error without it. `XAI_API_KEY` is optional and only needed for the Grok "Versão B" provider. Set these via the Secrets panel, not in code.
- `RESULT_WEBHOOK` defaults to a live n8n endpoint (`https://trnsf.up.railway.app/webhook/alfa-voz-resultado`) that emails call results. When testing `/api/extract`, set `RESULT_WEBHOOK=""` to disable it so you don't send spurious emails/webhook calls.
- The full voice call flow (the call button in the UI) needs both `OPENAI_API_KEY` and browser microphone access + WebRTC to OpenAI, which is not available in a headless cloud VM. Prefer testing core logic against `POST /api/extract` with a sample `transcript` payload, which exercises the OpenAI integration without a mic.
- Other env vars (defaults in `server.js`): `REALTIME_MODEL`, `VOICE`, `TEXT_MODEL`, `OPENAI_BASE` (use `https://eu.api.openai.com` for EU residency).
