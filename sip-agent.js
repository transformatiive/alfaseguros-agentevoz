// Agente de chamada por SIP (Grok Voice).
//
// No browser é a página que segura o WebSocket, reproduz o áudio e no fim manda a
// transcrição para extração. Ao telefone não há página: a Ringover entrega a chamada
// à xAI, a xAI chama este webhook, e a partir daí é este módulo que faz o papel da
// página — com uma diferença importante a nosso favor: o áudio nunca passa por nós.
// Quem termina a perna SIP é a xAI, por isso não há amortecedor de reprodução nem
// vigia de silêncio, que eram exatamente as duas fontes dos defeitos de 26/08.

import crypto from "node:crypto";
import WebSocket from "ws";

const MAX_CHAMADA_MS = 15 * 60 * 1000; // rede de segurança: nenhuma chamada fica pendurada a consumir
const TOLERANCIA_RELOGIO_S = 300;

// A xAI envia webhook-id / webhook-timestamp / webhook-signature, que são os cabeçalhos
// da norma Standard Webhooks, mas não publica o algoritmo. Implementamos o da norma e
// FALHAMOS FECHADO: se divergir, as chamadas são recusadas e vê-se no log — o contrário
// seria aceitar pedidos não autenticados num endpoint que abre chamadas pagas.
export function assinaturaValida(corpoBruto, cabecalhos, segredo) {
  const id = cabecalhos["webhook-id"];
  const ts = cabecalhos["webhook-timestamp"];
  const sig = cabecalhos["webhook-signature"];
  if (!segredo || !id || !ts || !sig) return false;

  const idade = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(idade) || idade > TOLERANCIA_RELOGIO_S) return false; // anti-repetição

  const chave = Buffer.from(String(segredo).replace(/^whsec_/, ""), "base64");
  const esperado = crypto.createHmac("sha256", chave).update(`${id}.${ts}.${corpoBruto}`).digest("base64");

  // o cabeçalho pode trazer várias assinaturas separadas por espaço ("v1,aaa v1,bbb")
  return String(sig).split(" ").some(parte => {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) return false;
    const a = Buffer.from(valor);
    const b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

class ChamadaSip {
  constructor(callId, deDe, cfg) {
    this.callId = callId;
    this.de = deDe; // número de quem liga, para o resultado
    this.cfg = cfg;
    this.transcript = [];
    this.linhasUser = new Map();
    this.terminada = false;
    this.diag = { motor: "SpaceX.ai Grok Live 2 (telefone)", underruns: 0, cortes: 0, reconexoes: 0,
      falsosVad: 0, dobresResp: 0, destravas: 0, limpezas: 0 };
  }

  ligar() {
    const { xaiBase, xaiKey } = this.cfg;
    const url = `${xaiBase.replace("https://", "wss://")}/v1/realtime?call_id=${encodeURIComponent(this.callId)}`;
    this.ws = new WebSocket(url, { headers: { Authorization: `Bearer ${xaiKey}` } });
    this.ws.on("open", () => this.configurar());
    this.ws.on("message", d => { try { this.evento(JSON.parse(d.toString())); } catch { /* frame não-JSON: ignorar */ } });
    this.ws.on("close", () => this.finalizar());
    this.ws.on("error", e => { console.error(`[sip ${this.callId}] ws:`, e?.message || e); });
    this.limite = setTimeout(() => this.desligar("duração máxima"), MAX_CHAMADA_MS);
  }

  enviar(o) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }

  configurar() {
    const { instrucoes, voz, primeiraFala } = this.cfg;
    // voz em separado, como no browser: um update com instruções não pode arrastar a voz
    this.enviar({ type: "session.update", session: { voice: voz } });
    this.enviar({ type: "session.update", session: {
      instructions: instrucoes,
      // ao telefone o áudio é mais estreito e mais ruidoso do que no browser: o silêncio
      // de fim de turno é mais difícil de detetar, por isso damos-lhe mais margem
      turn_detection: { type: "server_vad", threshold: 0.9, silence_duration_ms: 800, prefix_padding_ms: 333, idle_timeout_ms: 10000 },
      reasoning: { effort: "none" },
      audio: { input: { transcription: { language_hint: "pt-PT", keyterms:
        ["Alice", "Alfaseguros", "telemóvel", "apólice", "matrícula", "morada", "código postal", "consultor", "registei", "ecrã", "autocarro", "pequeno-almoço", "carta de condução", "desporto", "utilizador", "ficheiro", "palavra-passe"] } } },
      tools: [{ type: "function", name: "end_call",
        description: "Termina a chamada. Usar APENAS depois de o cliente confirmar o resumo e de o agente dizer a frase de fecho completa.",
        parameters: { type: "object", properties: {}, additionalProperties: false } }],
      tool_choice: "auto"
    } });
    this.enviar({ type: "response.create", response: {
      instructions: `${instrucoes}\n\nA tua primeira fala é exatamente, palavra por palavra: "${primeiraFala}"`
    } });
  }

  evento(ev) {
    const t = ev.type;
    // a transcrição do cliente chega em pedaços (.updated) e fecha em .completed:
    // guardamos por item_id para a linha ser substituída e não duplicada
    if ((t === "conversation.item.input_audio_transcription.completed" ||
         t === "conversation.item.input_audio_transcription.updated") && ev.transcript) {
      this.linhasUser.set(ev.item_id, ev.transcript.trim());
    }
    if ((t === "response.output_audio_transcript.done" || t === "response.audio_transcript.done") && ev.transcript) {
      this.despejarUser();
      this.transcript.push({ role: "assistant", text: ev.transcript.trim() });
    }
    // o fim de chamada pode chegar em qualquer um destes dois formatos
    const nome = ev.name || ev.item?.name;
    if (nome === "end_call" && (t === "response.function_call_arguments.done" || t === "response.output_item.done")) {
      this.despejarUser();
      this.desligar("end_call");
    }
    if (t === "error") console.error(`[sip ${this.callId}] erro da xAI:`, JSON.stringify(ev.error || ev).slice(0, 300));
  }

  despejarUser() {
    for (const texto of this.linhasUser.values()) if (texto) this.transcript.push({ role: "user", text: texto });
    this.linhasUser.clear();
  }

  async desligar(motivo) {
    if (this.terminada) return;
    console.log(`[sip ${this.callId}] a desligar (${motivo})`);
    try {
      await fetch(`${this.cfg.xaiBase}/v1/realtime/calls/${encodeURIComponent(this.callId)}/hangup`,
        { method: "POST", headers: { Authorization: `Bearer ${this.cfg.xaiKey}` } });
    } catch (e) { console.error(`[sip ${this.callId}] hangup:`, e?.message || e); }
    try { this.ws?.close(); } catch { /* já fechado */ }
    this.finalizar();
  }

  finalizar() {
    if (this.terminada) return; // o close e o desligar podem chegar os dois
    this.terminada = true;
    clearTimeout(this.limite);
    this.despejarUser();
    this.cfg.aoTerminar(this.callId);
    if (!this.transcript.length) { console.log(`[sip ${this.callId}] sem transcrição, nada a registar`); return; }
    this.cfg.extrair(this.transcript, { ...this.diag, telefone_origem: this.de }, "alfa-voz-sip")
      .catch(e => console.error(`[sip ${this.callId}] extração:`, e?.message || e));
  }
}

export function registarRotasSip(app, cfg) {
  const emCurso = new Map();
  const aoTerminar = id => emCurso.delete(id);

  app.post("/api/xai/call", (req, res) => {
    if (!cfg.xaiKey || !cfg.segredoWebhook) return res.status(503).json({ error: "sip indisponível" });
    if (!assinaturaValida(req.rawBody?.toString("utf8") ?? "", req.headers, cfg.segredoWebhook)) {
      console.error("[sip] assinatura inválida — pedido recusado");
      return res.status(401).json({ error: "assinatura inválida" });
    }
    const ev = req.body || {};
    if (ev.type !== "realtime.call.incoming") return res.status(204).end();

    const callId = ev.data?.call_id;
    if (!callId) return res.status(400).json({ error: "sem call_id" });
    if (emCurso.has(callId)) return res.status(200).json({ ok: true }); // reentrega do webhook

    const de = (ev.data?.sip_headers || []).find(h => h.name === "From")?.value || "";
    console.log(`[sip ${callId}] chamada recebida de ${de || "(desconhecido)"}`);
    const chamada = new ChamadaSip(callId, de, { ...cfg, aoTerminar });
    emCurso.set(callId, chamada);
    chamada.ligar();
    res.status(200).json({ ok: true }); // responder já: a xAI não deve esperar pelo nosso WebSocket
  });

  return { emCurso };
}
