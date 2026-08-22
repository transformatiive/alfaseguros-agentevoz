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
const PROMPT = fs.readFileSync(path.join(__dirname, "prompt_alfa.md"), "utf8");
const FIRST_MESSAGE = "Olá, fala a Alfa, assistente virtual da Alfaseguros. Os nossos assistentes não conseguiram atender neste momento. Posso registar o seu pedido para que um colega o contacte. Esta chamada é gravada. Em que posso ajudar?";

const INSTRUCTIONS = `# Voz e sotaque (prioridade máxima)
Falas exclusivamente em português europeu (de Portugal), com sotaque, pronúncia e entoação de Portugal (padrão de Lisboa). NUNCA uses sotaque, entoação, vocabulário ou construções do português do Brasil, em nenhuma circunstância e em nenhuma palavra. Usa sempre a fonética europeia: vogais átonas fechadas ou reduzidas, "e" final mudo, e a construção "estar a + infinitivo". Se notares que a tua pronúncia derivou para o português do Brasil, corrige imediatamente e mantém o sotaque europeu até ao fim da chamada. Formas verbais europeias sempre: "registei" (nunca "registrei"), "confirmei" (nunca com pronúncia brasileira).

# Uma pergunta de cada vez (prioridade máxima)
- Fazes UMA pergunta (ou um grupo de dois ou três dados relacionados) e TERMINAS a tua fala imediatamente a seguir à pergunta. Depois ficas em silêncio à espera da resposta do cliente.
- Quando pedes confirmação de um dado ("Está correto?"), essa pergunta é SEMPRE a última coisa que dizes nessa fala. É PROIBIDO dizer "Obrigada", "Perfeito", "Confirmado" ou avançar para o assunto seguinte na mesma fala. Um dado só fica confirmado depois de o cliente o confirmar por palavras dele, numa fala dele.
- Nunca respondes às tuas próprias perguntas nem assumes a resposta do cliente.
- Não anuncies o que vais fazer ("vou organizar", "vou só confirmar", "vou registar"); faz diretamente, sem frases de transição vazias.

` + PROMPT + `
# Início da chamada
A tua primeira fala é exatamente: "${FIRST_MESSAGE}"

# Terminar a chamada
Só podes chamar a ferramenta end_call DEPOIS de cumprir os três passos: (a) confirmaste o pedido com o cliente e ele disse que está correto, (b) disseste a frase de fecho completa, (c) o cliente se despediu ou ficou em silêncio. Nunca termines a chamada antes da confirmação.
`;

export const sessionConfig = () => ({
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
      output: { voice: VOICE, speed: 1.0 }
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
    const r = await fetch(`${OPENAI_BASE}/v1/realtime/client_secrets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 600 }, ...sessionConfig() })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ client_secret: data.value, model: REALTIME_MODEL, voice: VOICE, base: OPENAI_BASE, first_message: FIRST_MESSAGE });
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
const EXTRACT_PROMPT = `Extrai, a partir da transcrição de uma chamada entre a assistente virtual Alfa (Alfaseguros) e um cliente, os campos pedidos. Regras: 'dados_recolhidos' em formato 'campo: valor; campo: valor'. PROIBIDO incluir qualquer informação de saúde, doenças, medicação ou deficiências em qualquer campo; se o cliente a mencionou, marca mencionou_dados_saude=true e escreve no resumo apenas 'cliente mencionou informação de saúde, a recolher por humano'. 'campos_em_falta' = campos obrigatórios do produto que o cliente não soube. 'produto' usa os códigos: AUTOMOVEL, MULTIRRISCOS_HABITACAO, MULTIRRISCOS_CONDOMINIO, MULTIRRISCOS_EMPRESARIAL, SAUDE, TVDE, ACIDENTES_TRABALHO_INDIVIDUAL, ACIDENTES_TRABALHO_COLETIVO, RC_GERAL, RC_CONSTRUCAO, RC_EMPRESARIAL, RC_MEDICOS, RC_ARMAS_CACADOR, OBRAS_MONTAGENS, ANIMAIS, BICICLETAS_TROTINETAS, VIAGEM, EMBARCACAO, ACIDENTES_PESSOAIS (ou "" se não for simulação). 'quer_humano' só é true se o cliente pediu EXPLICITAMENTE para falar com uma pessoa; um colega ligar de volta é o fluxo normal e NÃO conta. 'prioridade' alta se sinistro urgente, pedido sem resposta, cliente irritado ou quer_humano=true. Resumo em 2 a 4 frases, português europeu, para um assistente humano. Campos vazios = "".`;

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
    res.json({ resultado: JSON.parse(txt), transcript });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/health", (_, res) => res.json({ ok: true, model: REALTIME_MODEL, voice: VOICE }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`alfa-voz-openai on :${port} (${REALTIME_MODEL}, voz ${VOICE})`));
