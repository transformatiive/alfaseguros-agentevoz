# alfa-voz-openai (Alice)

Assistente virtual **Alice** (Alfaseguros). O motor falado por omissão no **browser** e na **linha SIP da mesa** (Ringover / Telnyx) é **GPT-Live-1** (`gpt-live-1`, voz **marin**, velocidade **1.0**).

A linha SIP usa **OpenAI Direct SIP**: o áudio vai do tronco para OpenAI; Alice só recebe o webhook, aceita a sessão e segura o sideband (transcrição, `end_call`, hangup). Não é a ponte PCMU/Telnyx do outbound.

Rollback de emergência: `SIP_ENGINE=grok` (tronco xAI + `POST /api/xai/call`).

## Motores

| Superfície | Default | Modelo / voz / speed | Notas |
| --- | --- | --- | --- |
| **Browser** (`POST /api/session` sem `provider`, ou `provider=openai`) | **GPT-Live** | `gpt-live-1` / `marin` / `1.0` | WebRTC: o browser manda o SDP offer; o servidor cria `POST /v1/live/sessions`. |
| **SIP Ringover** | **GPT-Live Direct SIP** | `gpt-live-1` / `marin` / `1.0` | Webhook `POST /api/openai/sip`. Áudio não passa por este processo. |
| Browser Grok | opcional (`?motor=grok`) | `GROK_MODEL` / `GROK_VOICE` (ara) | Token xAI + WebSocket. |
| Browser ElevenLabs | opcional | agente no painel ElevenLabs | Signed URL. |
| SIP Grok | só `SIP_ENGINE=grok` | `grok-voice-think-fast-2.0` / ara | Emergência. Reapontar o tronco à xAI. |

`GET /health` anuncia o default GPT-Live (`model`, `voice`, `speed`) e `sip.engine=gpt-live`, `sip.voice=marin`, `sip.model=gpt-live-1`, `sip.speed=1` quando o Direct SIP Live está configurado.

## Correr

```
npm install
OPENAI_API_KEY=sk-... npm start   # http://localhost:3000
npm test
```

## Variáveis

### GPT-Live (browser + SIP)

- `OPENAI_API_KEY` (obrigatória)
- `OPENAI_WEBHOOK_SECRET` (obrigatória para SIP — signing secret do webhook no dashboard OpenAI)
- `OPENAI_PROJECT_ID` (`proj_…` — entra no URI SIP; ver checklist)
- `OPENAI_LIVE_MODEL` (default `gpt-live-1`). Tem prioridade sobre `REALTIME_MODEL`.
- `REALTIME_MODEL` só é usado se começar por `gpt-live`.
- `OPENAI_LIVE_VOICE` ou `VOICE` (default `marin`; não usar `bossa`/`tempo` — vozes pt-BR)
- `OPENAI_LIVE_SPEED` (default `1.0`, intervalo 0.25–1.5)
- `OPENAI_LIVE_DELEGATE_MODEL` (default `gpt-5.6-terra`, Responses para `end_call`)
- `OPENAI_BASE` (default `https://api.openai.com`; `https://eu.api.openai.com` para residência UE — o URI SIP passa a `sip-eu.api.openai.com`)
- `SIP_ENGINE` (default `gpt-live`; `grok` ou `xai` = rollback)

### Grok (browser opcional / rollback SIP)

- `XAI_API_KEY`, `XAI_WEBHOOK_SECRET`
- `GROK_MODEL` (default `grok-voice-think-fast-2.0`)
- `GROK_VOICE` (default `ara`)

### Outros

- `TEXT_MODEL` (default `gpt-5.4-mini`, extração pós-chamada)
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- `RESULT_WEBHOOK` (n8n; `""` desativa)
- `PORT` (Railway)

## SIP Direct — URL e URI

Webhook Alice (OpenAI dashboard → Project → Webhooks, evento `live.transport.incoming`):

```
https://alfaseguros-agentevoz-production.up.railway.app/api/openai/sip
```

URI do tronco (substituir o project ID):

```
sip:$OPENAI_PROJECT_ID@sip.api.openai.com;transport=tls
```

Residência UE (`OPENAI_BASE=https://eu.api.openai.com`):

```
sip:$OPENAI_PROJECT_ID@sip-eu.api.openai.com;transport=tls
```

O `$OPENAI_PROJECT_ID` está em platform.openai.com → Settings → Project → General (`proj_`…).

## Railway + cutover SIP (manual no Ringover/Telnyx)

O reapontar do tronco **não pode ser feito por este repositório**. Tem de ser feito à mão na UI Ringover e/ou Telnyx **depois** dos secrets e do webhook OpenAI.

1. **Railway secrets** no serviço Alice:
   - `OPENAI_API_KEY` — a mesma chave/projecto com acesso a `gpt-live-1`
   - `OPENAI_WEBHOOK_SECRET` — signing secret do endpoint criado no passo 2
   - `OPENAI_PROJECT_ID=proj_…`
   - `OPENAI_LIVE_MODEL=gpt-live-1`
   - `OPENAI_LIVE_VOICE=marin` (e/ou `VOICE=marin`)
   - `OPENAI_LIVE_SPEED=1.0` (opcional)
   - `SIP_ENGINE` — omitir ou `gpt-live` (não pôr `grok` neste cutover)
   - Opcional UE: `OPENAI_BASE=https://eu.api.openai.com`
2. **OpenAI dashboard** → Settings → Project → Webhooks → Create:
   - URL: `https://alfaseguros-agentevoz-production.up.railway.app/api/openai/sip`
   - Eventos: `live.transport.incoming` (manter também `live.call.incoming` / `realtime.call.incoming` durante a migração se o dashboard ainda os listar)
   - Copiar o signing secret para `OPENAI_WEBHOOK_SECRET`
   - Confirmar que o projecto tem GPT-Live SIP activo
3. **Reapontar o tronco Ringover/Telnyx** (manual — a mesa cai se isto for feito antes dos passos 1–2):
   1. Abrir o tronco SIP que hoje entrega a linha da mesa à xAI (Ringover desk → Telnyx FQDN/SIP, ou SIP directo Ringover).
   2. Anotar o destino actual (URI xAI) para rollback.
   3. Substituir o destino por `sip:$OPENAI_PROJECT_ID@sip.api.openai.com;transport=tls` (ou `sip-eu` se UE).
   4. Transporte **TLS** (porta 5061) e média **SRTP**. Sem TLS/SRTP o Direct SIP OpenAI recusa a chamada.
   5. Guardar e esperar a propagação do tronco (normalmente segundos).
   6. **Telnyx** (se a Ringover envia para um SIP connection Telnyx): Voice → SIP Trunking / FQDN Connections → Origination URI do connection da mesa → o URI OpenAI acima; codec G.711, SRTP required.
   7. **Ringover** (se o destino SIP se configura na Ringover): Admin → a linha/chip da mesa → encaminhamento SIP / trunk → colar o mesmo URI; não deixar o fallback xAI activo em paralelo.
4. **Verificar** `GET https://alfaseguros-agentevoz-production.up.railway.app/health`: `sip.engine=gpt-live`, `sip.voice=marin`, `sip.model=gpt-live-1`, `sip.speed=1`, `sip.configured=true`.
5. Teste humano na mesa (não a partir deste agente). Rollback: `SIP_ENGINE=grok` + reapontar o tronco ao URI xAI guardado no passo 3.2.

`railway up` nesta pasta, ou ligar o repositório GitHub. Porta via `$PORT`. Health-check: `GET /health`.
