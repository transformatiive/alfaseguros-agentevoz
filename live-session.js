// GPT-Live (ChatGPT Voice) session helpers for Alice's browser WebRTC path.
// Adapted lightly from outbound-voice-agent `src/openai/live-session.ts`.
// Do not copy the Telnyx media bridge / SIP stack.

export const DEFAULT_GPT_LIVE_MODEL = "gpt-live-1";
export const DEFAULT_GPT_LIVE_VOICE = "marin";
export const DEFAULT_GPT_LIVE_SPEED = 1.0;
export const DEFAULT_GPT_LIVE_DELEGATE_MODEL = "gpt-5.6-terra";
export const GPT_LIVE_USER_AGENT = "alfaseguros/alice-agentevoz Node";

/** Brazilian Portuguese GPT-Live voices — never the pt-PT default. */
export const GPT_LIVE_BRAZILIAN_VOICES = ["bossa", "tempo"];

export const GPT_LIVE_VOICES = [
  "marin", "cedar", "coral", "sage", "shimmer", "alloy", "ash", "ballad", "echo", "verse",
  "quartz", "ripple", "vesper", "willow", "stone", "gleam", "meridian",
  "bossa", "tempo", "beacon", "delta", "cinder"
];

const END_CALL_TOOL = {
  type: "function",
  name: "end_call",
  description: "Termina a chamada. Usar APENAS depois de o cliente confirmar o resumo e de o agente dizer a frase de fecho completa.",
  parameters: { type: "object", properties: {}, additionalProperties: false }
};

export function isGptLiveVoice(value) {
  return GPT_LIVE_VOICES.includes(String(value || "").trim().toLowerCase());
}

export function resolveGptLiveModel(env = process.env) {
  const dedicated = env.OPENAI_LIVE_MODEL?.trim();
  if (dedicated) return dedicated;
  const realtime = env.REALTIME_MODEL?.trim();
  // A leftover Railway REALTIME_MODEL=gpt-realtime-2.1 must not keep Alice off gpt-live-1.
  if (realtime && realtime.startsWith("gpt-live")) return realtime;
  return DEFAULT_GPT_LIVE_MODEL;
}

export function resolveGptLiveVoice(env = process.env, requestVoice) {
  const requested = typeof requestVoice === "string" ? requestVoice.trim().toLowerCase() : "";
  if (requested && isGptLiveVoice(requested)) return requested;
  const fromEnv = env.OPENAI_LIVE_VOICE?.trim() || env.VOICE?.trim();
  if (fromEnv && isGptLiveVoice(fromEnv.toLowerCase())) return fromEnv.toLowerCase();
  return DEFAULT_GPT_LIVE_VOICE;
}

export function resolveGptLiveSpeed(env = process.env) {
  const raw = env.OPENAI_LIVE_SPEED?.trim();
  if (!raw) return DEFAULT_GPT_LIVE_SPEED;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_GPT_LIVE_SPEED;
  return Math.min(1.5, Math.max(0.25, n));
}

export function resolveGptLiveDelegateModel(env = process.env) {
  return env.OPENAI_LIVE_DELEGATE_MODEL?.trim() || DEFAULT_GPT_LIVE_DELEGATE_MODEL;
}

export function openaiLiveSessionsUrl(openaiBase = "https://api.openai.com") {
  const https = String(openaiBase).replace(/\/+$/, "");
  return `${https}/v1/live/sessions`;
}

export function liveInputFromTranscript(linhas) {
  if (!Array.isArray(linhas) || !linhas.length) return undefined;
  const input = [];
  for (const t of linhas) {
    const text = typeof t?.text === "string" ? t.text.trim() : "";
    if (!text) continue;
    const user = t.role === "user";
    input.push({
      type: "message",
      role: user ? "user" : "assistant",
      content: [{ type: user ? "input_text" : "output_text", text }]
    });
  }
  return input.length ? input : undefined;
}

/**
 * WebRTC Live session body. Omit `audio.format` — WebRTC negotiates it.
 * `audio.output.speed` is 1.0 unless OPENAI_LIVE_SPEED overrides (0.25–1.5).
 */
export function liveSessionConfig({
  model = DEFAULT_GPT_LIVE_MODEL,
  voice = DEFAULT_GPT_LIVE_VOICE,
  speed = DEFAULT_GPT_LIVE_SPEED,
  instructions,
  delegateModel = DEFAULT_GPT_LIVE_DELEGATE_MODEL,
  delegateInstructions,
  input
} = {}) {
  const session = {
    model,
    instructions,
    audio: {
      output: { voice, speed }
    },
    delegation: {
      type: "responses",
      responses: {
        model: delegateModel,
        instructions: delegateInstructions,
        tools: [END_CALL_TOOL],
        tool_choice: "auto"
      }
    }
  };
  if (input) session.input = input;
  return session;
}

export function gptLiveGreetingSpeakInstructions(firstMessage) {
  return `A tua primeira fala nesta chamada é, palavra por palavra, em português europeu de Portugal (Lisboa, pt-PT — nunca brasileiro), exactamente este texto e nada mais. Diz já, sem esperar pelo cliente; depois fica a escutar:\n\n«${firstMessage}»`;
}

export function gptLiveGreetingCommentary() {
  return "Começa agora a conversa, seguindo as instruções. Diz a saudação exacta e depois escuta.";
}

export function gptLiveResumeInstructions() {
  return "A ligação caiu por instantes e foi retomada; o histórico da conversa já está na sessão. Continua exatamente de onde estava, sem cumprimentar de novo e sem repetir o que já foi dito. Se estavas à espera de um dado do cliente, repete apenas essa pergunta, numa frase curta.";
}

export function gptLiveGreetingInstructionsAppend(firstMessage, eventId = "greeting") {
  return {
    type: "session.instructions.append",
    event_id: eventId,
    delegation_id: null,
    content: gptLiveGreetingSpeakInstructions(firstMessage)
  };
}

export function gptLiveGreetingCommentaryAppend(eventId = "greeting-go") {
  return {
    type: "session.commentary.append",
    event_id: eventId,
    delegation_id: null,
    content: gptLiveGreetingCommentary()
  };
}

export function gptLiveResumeInstructionsAppend(eventId = "resume") {
  return {
    type: "session.instructions.append",
    event_id: eventId,
    delegation_id: null,
    content: gptLiveResumeInstructions()
  };
}
