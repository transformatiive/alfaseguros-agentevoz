// Alfa (Alfaseguros) - teste web com OpenAI Realtime (gpt-realtime-2.1) por WebRTC.
// Endpoints: GET / (página), POST /api/session (token efémero), POST /api/extract (resumo + campos no fim da chamada)
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE || "https://api.openai.com"; // usar https://eu.api.openai.com para residência UE
const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2.1";
const VOICE = process.env.VOICE || "marin";
const TEXT_MODEL = process.env.TEXT_MODEL || "gpt-5.4-mini";
const RESULT_WEBHOOK = process.env.RESULT_WEBHOOK || "https://trnsf.up.railway.app/webhook/alfa-voz-resultado"; // n8n: envia o resultado por email; vazio ("") desativa
const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE = process.env.XAI_BASE || "https://api.x.ai";
const GROK_MODEL = process.env.GROK_MODEL || "grok-voice-latest";
const GROK_VOICE = process.env.GROK_VOICE || "eve";
const PROMPT = fs.readFileSync(path.join(__dirname, "prompt_alfa.md"), "utf8");
const FIRST_MESSAGE = "Olá, fala a Alfa, assistente virtual da Alfaseguros. Os nossos consultores não conseguiram atender neste momento. Posso registar o seu pedido para que um consultor o contacte. Esta chamada é gravada. Em que posso ajudar?";

const INSTRUCTIONS = `# Voz e sotaque (prioridade máxima)
Falas exclusivamente em português europeu (de Portugal), com sotaque, pronúncia e entoação de Portugal (padrão de Lisboa). NUNCA uses sotaque, entoação, vocabulário ou construções do português do Brasil, em nenhuma circunstância e em nenhuma palavra. Usa sempre a fonética europeia: vogais átonas fechadas ou reduzidas, "e" final mudo, e a construção "estar a + infinitivo". Se notares que a tua pronúncia derivou para o português do Brasil, corrige imediatamente e mantém o sotaque europeu até ao fim da chamada. Formas verbais europeias sempre: "registei" (nunca "registrei"), "confirmei" (nunca com pronúncia brasileira).
Mantém EXATAMENTE o mesmo tom, ritmo, timbre e volume de voz do princípio ao fim da chamada — também no resumo final e na despedida. Nunca mudes de estilo de leitura nem de entrega vocal a meio da chamada.

# Tratamento do cliente (neutro quanto ao género, prioridade máxima)
- NUNCA assumas o género do cliente a partir do nome, da voz ou de qualquer outro indício.
- Não uses "o senhor" nem "a senhora", nem adjetivos ou particípios com género aplicados ao cliente. Cortesia só com o verbo na terceira pessoa: "pode dizer-me", "já é cliente", "quer acrescentar alguma coisa?".
- Quando algo fica registado, refere o pedido e não a pessoa: "o seu pedido ficou registado".

# Uma pergunta de cada vez (prioridade máxima)
- Fazes UMA pergunta (ou um grupo de NO MÁXIMO DOIS dados relacionados) e TERMINAS a tua fala imediatamente a seguir à pergunta. Depois ficas em silêncio à espera da resposta do cliente.
- Quando pedes confirmação de um dado ("Está correto?"), essa pergunta é SEMPRE a última coisa que dizes nessa fala. É PROIBIDO dizer "Obrigada", "Perfeito", "Confirmado" ou avançar para o assunto seguinte na mesma fala. Um dado só fica confirmado depois de o cliente o confirmar por palavras dele, numa fala dele.
- Nunca respondes às tuas próprias perguntas nem assumes a resposta do cliente.
- NUNCA termines uma fala sem uma pergunta ao cliente, exceto no fecho e na despedida. Se confirmares ou reconheceres algo ("entendido", "perfeito"), fazes a pergunta seguinte NA MESMA fala — nunca ficas por um reconhecimento solto.
- Cada fala tua é UMA só: nunca produzes duas falas seguidas sem o cliente falar pelo meio.
- Não anuncies o que vais fazer ("vou organizar", "vou só confirmar", "vou registar"); faz diretamente, sem frases de transição vazias.

# Interrupções e ruído (comportamento humano)
- O cliente pode interromper-te a meio de uma fala; isso é normal e desejável. Quando acontecer, pára de falar e ouve até ao fim.
- Se percebeste o que o cliente disse, responde diretamente a isso e só depois retoma o que ficou pendente, sem repetir o que já tinhas dito.
- Se foste interrompida mas NÃO percebeste (ruído, vento, fala impercetível), reage como uma pessoa reagiria: "Desculpe, não percebi — pode repetir?". Se o cliente não disser nada, retoma naturalmente de onde ias ("Como estava a dizer…"), a partir do ponto exato onde paraste.
- NUNCA repitas uma fala inteira já dita nem recomeces uma frase do zero; retoma sempre apenas a partir do ponto da interrupção.

` + PROMPT + `
# Início da chamada
A tua primeira fala é exatamente: "${FIRST_MESSAGE}"

# Terminar a chamada
Só podes chamar a ferramenta end_call DEPOIS de cumprir os três passos: (a) confirmaste o pedido com o cliente e ele disse que está correto, (b) disseste a frase de fecho completa, (c) o cliente se despediu ou ficou em silêncio. Nunca termines a chamada antes da confirmação.
`;

const VOICES = ["marin", "cedar", "coral", "sage", "shimmer", "alloy", "ash", "ballad", "echo", "verse"];

export const sessionConfig = (voice = VOICE) => ({
  session: {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: INSTRUCTIONS,
    output_modalities: ["audio"],
    audio: {
      input: {
        transcription: { model: "gpt-4o-transcribe", language: "pt" },
        noise_reduction: { type: "near_field" },
        turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true }
      },
      output: { voice, speed: 1.0 }
    },
    tools: [{
      type: "function",
      name: "end_call",
      description: "Termina a chamada. Usar APENAS depois de o cliente confirmar o resumo e de o agente dizer a frase de fecho completa.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }],
    tool_choice: "auto",
    max_output_tokens: 600
  }
});

app.post("/api/session", async (req, res) => {
  try {
    if (req.body?.provider === "grok") {
      // xAI: o client secret não transporta configuração de sessão; o browser envia session.update depois de ligar.
      if (!XAI_API_KEY) return res.status(503).json({ error: "grok indisponível" });
      const voice = (typeof req.body?.voice === "string" && /^[a-z0-9_-]{1,32}$/i.test(req.body.voice)) ? req.body.voice : GROK_VOICE;
      const r = await fetch(`${XAI_BASE}/v1/realtime/client_secrets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expires_after: { seconds: 600 } })
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json(data);
      const token = data.value || data.client_secret?.value || data.client_secret || data.token;
      return res.json({
        provider: "grok", client_secret: token, model: GROK_MODEL, voice,
        ws_url: `${XAI_BASE.replace("https://", "wss://")}/v1/realtime?model=${encodeURIComponent(GROK_MODEL)}`,
        instructions: INSTRUCTIONS, first_message: FIRST_MESSAGE
      });
    }
    const voice = VOICES.includes(req.body?.voice) ? req.body.voice : VOICE; // override de teste via ?voz= na página
    const r = await fetch(`${OPENAI_BASE}/v1/realtime/client_secrets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 3600 }, ...sessionConfig(voice) })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ provider: "openai", client_secret: data.value, model: REALTIME_MODEL, voice, base: OPENAI_BASE, first_message: FIRST_MESSAGE });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Extração pós-chamada: mesma estrutura de campos que o agente ElevenLabs (spec §4.9)
const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    categoria: { type: "string", enum: ["SIMULACAO","GESTAO_APOLICE","SINISTRO","CANCELAMENTO","PEDIDO_SEM_RESPOSTA","OUTRO"] },
    produto: { type: "string" }, nome_cliente: { type: "string" }, telefone: { type: "string" }, email: { type: "string" }, nif: { type: "string" },
    cliente_existente: { type: "string", enum: ["sim","nao","desconhecido"] },
    dados_recolhidos: { type: "string" }, campos_por_confirmar: { type: "string" }, campos_em_falta: { type: "string" },
    quer_humano: { type: "boolean" }, prioridade: { type: "string", enum: ["normal","alta"] },
    resumo: { type: "string" }, proximo_passo: { type: "string" }, mencionou_dados_saude: { type: "boolean" }
  },
  required: ["categoria","produto","nome_cliente","telefone","email","nif","cliente_existente","dados_recolhidos","campos_por_confirmar","campos_em_falta","quer_humano","prioridade","resumo","proximo_passo","mencionou_dados_saude"]
};
const EXTRACT_PROMPT = `Extrai, a partir da transcrição de uma chamada entre a assistente virtual Alfa (Alfaseguros) e um cliente, os campos pedidos. Regras: 'dados_recolhidos' em formato 'campo: valor; campo: valor'. PROIBIDO incluir qualquer informação de saúde, doenças, medicação ou deficiências em qualquer campo; se o cliente a mencionou, marca mencionou_dados_saude=true e escreve no resumo apenas 'cliente mencionou informação de saúde, a recolher por humano'. 'campos_em_falta' = campos obrigatórios do produto que o cliente não soube. 'produto' usa os códigos: AUTOMOVEL, MULTIRRISCOS_HABITACAO, MULTIRRISCOS_CONDOMINIO, MULTIRRISCOS_EMPRESARIAL, SAUDE, TVDE, ACIDENTES_TRABALHO_INDIVIDUAL, ACIDENTES_TRABALHO_COLETIVO, RC_GERAL, RC_CONSTRUCAO, RC_EMPRESARIAL, RC_MEDICOS, RC_ARMAS_CACADOR, OBRAS_MONTAGENS, ANIMAIS, BICICLETAS_TROTINETAS, VIAGEM, EMBARCACAO, ACIDENTES_PESSOAIS (ou "" se não for simulação). 'quer_humano' só é true se o cliente pediu EXPLICITAMENTE para falar com uma pessoa; um colega ligar de volta é o fluxo normal e NÃO conta. 'prioridade' alta se sinistro urgente, pedido sem resposta, cliente irritado ou quer_humano=true. Resumo em 2 a 4 frases, português europeu, para um consultor humano. Campos vazios = "".`;

app.post("/api/extract", async (req, res) => {
  try {
    const transcript = (req.body.transcript || []).map(t => `${t.role === "user" ? "CLIENTE" : "ALFA"}: ${t.text}`).join("\n");
    const r = await fetch(`${OPENAI_BASE}/v1/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEXT_MODEL, reasoning: { effort: "low" },
        input: [{ role: "system", content: EXTRACT_PROMPT }, { role: "user", content: transcript }],
        text: { format: { type: "json_schema", name: "resultado_chamada", strict: true, schema: SCHEMA } }
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    const txt = data.output?.flatMap(o => o.content || []).find(c => c.type === "output_text")?.text || "{}";
    const resultado = JSON.parse(txt);
    if (RESULT_WEBHOOK) {
      fetch(RESULT_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultado, transcript: req.body.transcript || [], diag: req.body.diag, data: new Date().toISOString(), origem: "alfa-voz-web" })
      }).catch(() => {});
    }
    res.json({ resultado, transcript });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/health", (_, res) => res.json({ ok: true, model: REALTIME_MODEL, voice: VOICE }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`alfa-voz-openai on :${port} (${REALTIME_MODEL}, voz ${VOICE})`));
