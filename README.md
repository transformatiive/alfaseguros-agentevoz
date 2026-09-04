# alfa-voz-openai
Teste web da assistente "Alice" (Alfaseguros) com OpenAI Realtime (gpt-realtime-2.1, voz Marin) por WebRTC.
Mesmo prompt e mesma estrutura de dados que o agente ElevenLabs.

## Correr
    npm install
    OPENAI_API_KEY=sk-... npm start   # http://localhost:3000

## Variáveis
- OPENAI_API_KEY (obrigatória)
- REALTIME_MODEL (default gpt-realtime-2.1; alternativa gpt-realtime-2.1-mini)
- VOICE (OpenAI Realtime; default marin; alternativas: cedar, coral, sage, shimmer)
- GROK_VOICE (xAI Grok / SIP Telnyx→xAI e browser Grok; default ara)
- TEXT_MODEL (default gpt-5.4-mini, para o resumo/extração pós-chamada)
- OPENAI_BASE (default https://api.openai.com; usar https://eu.api.openai.com para residência UE)

## Railway
`railway up` nesta pasta, ou ligar o repositório GitHub. Definir OPENAI_API_KEY. Porta via $PORT.
