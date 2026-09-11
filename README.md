# alfa-voz-openai (Alice)

Assistente virtual **Alice** (Alfaseguros). O motor falado por omissão no browser é **GPT-Live-1** (`gpt-live-1`, voz **marin**, velocidade **1.0**), o mesmo stack que o teste outbound que o Nuno considerou perfeito.

A linha SIP da mesa Ringover **ainda é Grok** (Telnyx → xAI `realtime.call.incoming`, voz `GROK_VOICE` / **ara**). Não se muda o tronco SIP nesta PR: apontar Ringover para `sip.api.openai.com` sem o webhook Live (`live.transport.incoming`) derrubava a mesa. Follow-up: GPT-Live SIP inbound.

## Motores

| Superfície | Default | Modelo / voz / speed | Notas |
| --- | --- | --- | --- |
| **Browser** (`POST /api/session` sem `provider`, ou `provider=openai`) | **GPT-Live** | `gpt-live-1` / `marin` / `1.0` | WebRTC: o browser manda o SDP offer; o servidor cria `POST /v1/live/sessions`. A chave OpenAI não sai do servidor. |
| Browser Grok | opcional (`?motor=grok` ou seletor) | `GROK_MODEL` / `GROK_VOICE` (ara) | Token xAI + WebSocket. |
| Browser ElevenLabs | opcional | agente no painel ElevenLabs | Signed URL. |
| **SIP Ringover** | **Grok** (até follow-up) | `grok-voice-think-fast-2.0` / ara | `sip-agent.js`. Áudio não passa por este processo. |

`GET /health` anuncia o default como GPT-Live (`model`, `voice`, `speed`). `grokVoice` / `sip.voice` descrevem só a perna SIP — **não** são a voz anunciada da Alice.

## Correr

```
npm install
OPENAI_API_KEY=sk-... npm start   # http://localhost:3000
npm test
```

## Variáveis

### GPT-Live (browser default)

- `OPENAI_API_KEY` (obrigatória para o default do browser)
- `OPENAI_LIVE_MODEL` (default `gpt-live-1`). Tem prioridade sobre `REALTIME_MODEL`.
- `REALTIME_MODEL` só é usado se começar por `gpt-live`. Um leftover Railway `gpt-realtime-2.1` **não** impede o default Live.
- `OPENAI_LIVE_VOICE` ou `VOICE` (default `marin`; não usar `bossa`/`tempo` — vozes pt-BR)
- `OPENAI_LIVE_SPEED` (default `1.0`, intervalo 0.25–1.5)
- `OPENAI_LIVE_DELEGATE_MODEL` (default `gpt-5.6-terra`, Responses para `end_call`)
- `OPENAI_BASE` (default `https://api.openai.com`; `https://eu.api.openai.com` para residência UE)

### Grok / SIP (não é o default anunciado)

- `XAI_API_KEY`, `XAI_WEBHOOK_SECRET` (SIP inativo sem o segredo)
- `GROK_MODEL` (default `grok-voice-think-fast-2.0`)
- `GROK_VOICE` (default `ara` — só SIP / seletor Grok)

### Outros

- `TEXT_MODEL` (default `gpt-5.4-mini`, extração pós-chamada)
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- `RESULT_WEBHOOK` (n8n; `""` desativa)
- `PORT` (Railway)

## Railway — LIVE checklist

Depois do merge, no serviço Alice:

1. **`OPENAI_API_KEY`** — a mesma chave do outbound GPT-Live (projecto com acesso a `gpt-live-1`).
2. **`OPENAI_LIVE_MODEL=gpt-live-1`** — explícito, para um `REALTIME_MODEL=gpt-realtime-2.1` antigo não confundir operadores. O código já ignora `REALTIME_MODEL` que não seja `gpt-live*`.
3. **`VOICE=marin`** e/ou **`OPENAI_LIVE_VOICE=marin`**.
4. **`OPENAI_LIVE_SPEED=1.0`** (opcional; já é o default).
5. **`OPENAI_LIVE_DELEGATE_MODEL=gpt-5.6-terra`** (opcional).
6. **Não** apontar o tronco Ringover para OpenAI nesta mudança. `XAI_API_KEY` + `XAI_WEBHOOK_SECRET` mantêm a mesa Grok.
7. Confirmar `GET /health`: `model=gpt-live-1`, `voice=marin`, `speed=1.0`, `sip.engine=grok`.
8. Teste browser na página (seletor **GPT-Live 1**). **Não** discar a linha da mesa a partir deste agente.

`railway up` nesta pasta, ou ligar o repositório GitHub. Porta via `$PORT`. Health-check: `GET /health`.
