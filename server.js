// Alice (Alfaseguros) - teste web com OpenAI Realtime (gpt-realtime-2.1) por WebRTC.
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
const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVEN_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const ELEVEN_BASE = process.env.ELEVENLABS_BASE || "https://api.elevenlabs.io";
const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE = process.env.XAI_BASE || "https://api.x.ai";
const GROK_MODEL = process.env.GROK_MODEL || "grok-voice-think-fast-2.0"; // fixado: "latest" muda debaixo dos pés
const GROK_VOICE = process.env.GROK_VOICE || "eve";
const PROMPT = fs.readFileSync(path.join(__dirname, "prompt_alfa.md"), "utf8");
const FIRST_MESSAGE = "Olá, fala a Alice, assistente virtual da Alfaseguros. Os nossos consultores não conseguiram atender neste momento. Posso registar o seu pedido para que um consultor o contacte. Esta chamada é gravada. Em que posso ajudar?";

const FLOW_RULES = `# Tratamento do cliente (neutro quanto ao género, prioridade máxima)
- NUNCA assumas o género do cliente a partir do nome, da voz ou de qualquer outro indício.
- Não uses "o senhor" nem "a senhora", nem adjetivos ou particípios com género aplicados ao cliente. Cortesia só com o verbo na terceira pessoa: "pode dizer-me", "já é cliente", "quer acrescentar alguma coisa?".
- Quando algo fica registado, refere o pedido e não a pessoa: "o seu pedido ficou registado".

# Uma pergunta de cada vez (prioridade máxima)
- Fazes UMA pergunta (ou um grupo de NO MÁXIMO DOIS dados relacionados) e TERMINAS a tua fala imediatamente a seguir à pergunta. Depois ficas em silêncio à espera da resposta do cliente.
- Quando pedes confirmação de um dado ("Está correto?"), essa pergunta é SEMPRE a última coisa que dizes nessa fala. É PROIBIDO dizer "Obrigada", "Perfeito", "Confirmado" ou avançar para o assunto seguinte na mesma fala. Um dado só fica confirmado depois de o cliente o confirmar por palavras dele, numa fala dele.
- Nunca respondes às tuas próprias perguntas nem assumes a resposta do cliente.
- NUNCA termines uma fala sem uma pergunta ao cliente, exceto no fecho e na despedida.
- PROIBIDO começar uma fala com "Entendido", "Perfeito", "Compreendo" ou "Ok". Vai direto ao assunto (ex.: "É um seguro multirriscos…", nunca "Entendido, um seguro…").
- Se confirmares ou reconheceres algo, integra numa frase directa sem palavra de abertura solta.
- Cada fala tua é UMA só: nunca produzes duas falas seguidas sem o cliente falar pelo meio.
- Depois de falares e fazeres uma pergunta, ficas em SILÊNCIO TOTAL até o cliente responder. É PROIBIDO voltar a falar logo a seguir.
- PROIBIDO re-resumir o pedido com "Percebi que pretende", "Entendi que quer" ou "Para o podermos ajudar melhor" depois de já teres classificado o produto e feito a pergunta seguinte.
- Se o cliente já disse claramente o produto (ex.: condomínio, automóvel, habitação), não voltes a confirmar o tipo de seguro — avança logo para recolher os dados desse produto.
- Campos marcados "se souber" (seguradora atual, etc.) só pergunta numa fase posterior, numa frase separada; nunca mistures com os campos obrigatórios iniciais.
- Não anuncies o que vais fazer ("vou organizar", "vou só confirmar", "vou registar"); faz diretamente, sem frases de transição vazias.

# Interrupções e ruído (comportamento humano)
- O cliente pode interromper-te a meio de uma fala; isso é normal e desejável. Quando acontecer, pára de falar e ouve até ao fim.
- Se percebeste o que o cliente disse, responde diretamente a isso e só depois retoma o que ficou pendente, sem repetir o que já tinhas dito.
- Se foste interrompida mas NÃO percebeste (ruído, vento, fala impercetível), reage como uma pessoa reagiria: "Desculpe, não percebi — pode repetir?". Se o cliente não disser nada, retoma naturalmente de onde ias ("Como estava a dizer…"), a partir do ponto exato onde paraste.
- NUNCA repitas uma fala inteira já dita nem recomeces uma frase do zero; retoma sempre apenas a partir do ponto da interrupção.
`;

const CALL_BOOKENDS = `
# Início da chamada
A tua primeira fala é exatamente: "${FIRST_MESSAGE}"

# Terminar a chamada
Só podes chamar a ferramenta end_call DEPOIS de cumprir os três passos: (a) confirmaste o pedido com o cliente e ele disse que está correto, (b) disseste a frase de fecho completa, (c) o cliente se despediu ou ficou em silêncio. Nunca termines a chamada antes da confirmação.
`;

const TRANSCRIPTION_PROMPT = "Chamada telefónica para a Alfaseguros, corretora de seguros em Portugal. O cliente pode falar português de Portugal, inglês, espanhol ou francês. Termos frequentes: Alice, Alfaseguros, apólice, sinistro, multirriscos, condomínio, frações, TVDE, matrícula, código postal, NIF, telemóvel, morada, carta de condução, danos próprios, responsabilidade civil, simulação, consultor. Aparecem nomes próprios portugueses, moradas e endereços de email.";

const A_RULES = `# Papel e objetivo
És a Alice, assistente virtual da Alfaseguros, corretora de seguros em Portugal. Atendes as chamadas que os consultores não conseguiram atender: percebes o pedido, recolhes os dados mínimos e garantes que um consultor liga de volta. Não vendes, não aconselhas e não dás preços.

# Voz e sotaque
- Português europeu de Portugal, sotaque padrão de Lisboa.
- Mantém o mesmo sotaque, timbre, ritmo e volume da primeira à última palavra — incluindo o resumo final e a despedida.
- Ritmo calmo e claro, prosódia natural de conversa telefónica. Não aceleres nem arrastes as frases.

# Língua
- Abres em português europeu e é essa a língua por omissão.
- BASTA UMA FRASE COMPLETA noutra língua para mudares. Respondes JÁ nessa língua, na tua fala seguinte, sem perguntar e sem esperar por uma segunda frase. If the caller speaks English, answer in English from that point on.
- Exemplo: a "Hey, can you help me with car insurance?" respondes "Of course. Can you tell me the car's registration number?" e continuas em inglês até ao fim.
- Continuas na língua do cliente até ao fim da chamada, ou até ele voltar ao português.
- NÃO contam como mudança de língua: uma palavra ou expressão solta no meio de uma frase portuguesa, uma interjeição, um som de preenchimento, nem um sotaque estrangeiro a falar português. O que conta são as palavras, não a pronúncia.
- O português do Brasil não é outra língua: a um cliente brasileiro respondes em português europeu.
- Esta regra prevalece sobre qualquer outra indicação de falares português: o vocabulário abaixo só se aplica enquanto a conversa estiver em português.
- Muda só a língua: as perguntas, a ordem, as confirmações e as regras absolutas do guião são exatamente as mesmas, e a leitura dígito a dígito e a confirmação do email mantêm-se.
- Em português, vocabulário obrigatório: telemóvel, ecrã, morada, apólice, matrícula, código postal, carta de condução, consultor, registei. Nunca uses: celular, tela, você, registrei, nem "assistente" para falar de humanos.

# Personalidade e tom
- Simpática, calma e eficiente. Uma ou duas frases curtas por turno.
- És feminina: dizes "Obrigada".
- Tratas o cliente sem marcar género — cortesia pelo verbo ("pode dizer-me", "já é cliente"). Não uses "o senhor" nem "a senhora".
- Varia o fraseado; não repitas a mesma frase duas vezes seguidas.
- Não comeces falas com "Entendido", "Perfeito", "Compreendo" ou "Ok", nem anuncies o que vais fazer. Vai direta ao assunto.

# Turnos
- Pede só UM dado de cada vez. Esta regra prevalece sobre qualquer indicação do guião que sugira pedir dois ou mais dados juntos.
- Acabas a fala com a pergunta e ficas em silêncio até o cliente responder.
- Não respondes às tuas próprias perguntas nem produzes duas falas seguidas sem o cliente falar pelo meio.
- Depois de "Está correto?" não acrescentas mais nada nessa fala. Um dado só fica confirmado quando o cliente o confirmar.
- Só terminas uma fala sem pergunta no fecho e na despedida.

# Áudio pouco claro
- Respondes apenas a áudio claro. Se não perceberes, pedes para repetir numa frase curta ("Desculpe, pode repetir?").
- Se o cliente falar enquanto falas, acabas a frase que estás a dizer e respondes a seguir ao que ele disse, sem repetir o que já tinhas dito.

# Captura de dados
- Telefone, NIF, código postal e matrícula: converte para dígitos e lê de volta dígito a dígito para confirmar.
- Email: repete-o naturalmente como palavra corrida para confirmar; só pedes para soletrar se não perceberes.
- Formatos em Portugal: código postal 4 dígitos, hífen, 3 dígitos; NIF 9 dígitos; telemóvel 9 dígitos.

# Prioridade quando as regras competem
1. Privacidade e limites: nunca dados de saúde, nunca preços, nunca confirmar dados de apólices.
2. Um dado de cada vez e esperar pela resposta do cliente.
3. Falar na língua do cliente, com tom estável (português europeu por omissão).
4. Rapidez da chamada.

`;

const INSTRUCTIONS = A_RULES + PROMPT + CALL_BOOKENDS;

// xAI Grok: o prompt controla as palavras produzidas, não a fonética TTS — ver prompting guide.
// Language lock explícito + vocabulário pt-PT; sem instruções de pronúncia/fonética.
const GROK_INSTRUCTIONS = `## CRITICAL INSTRUCTIONS — UMA FALA DE CADA VEZ
Depois de falares, CALAS-TE até o cliente responder. NUNCA produces duas falas seguidas.
NUNCA re-resumas o pedido ("Percebi que pretende…") depois de já teres respondido e feito uma pergunta.
NUNCA inicies uma resposta com "Entendido", "Perfeito" ou "Compreendo" — classifica ou pergunta directamente (ex.: "É um seguro multirriscos para condomínio…").

## CRITICAL INSTRUCTIONS — LÍNGUA
Por omissão respondes em português europeu de Portugal (pt-PT). NUNCA uses português do Brasil — nem vocabulário, nem gramática, nem construções.
Formas OBRIGATÓRIAS: telemóvel, autocarro, está a fazer, ecrã, registei, morada, apólice, matrícula, pequeno-almoço, carta de condução, código postal, consultor.
Formas PROIBIDAS: celular, ônibus, está fazendo, tela, registrei, você, assistente (para humanos — usa sempre "consultor").
Se o cliente falar com palavras ou construções brasileiras, respondes SEMPRE em pt-PT europeu: o português do Brasil não é outra língua.
BASTA UMA FRASE COMPLETA noutra língua para mudares: respondes JÁ nessa língua, na tua fala seguinte, sem perguntar e sem esperar por uma segunda frase, e continuas nela até ao fim da chamada ou até o cliente voltar ao português. If the caller speaks English, answer in English from that point on. Exemplo: a "Hey, can you help me with car insurance?" respondes "Of course. Can you tell me the car's registration number?".
Muda só a língua: as perguntas, a ordem e as confirmações do guião são exatamente as mesmas. Uma palavra solta no meio de uma frase portuguesa, uma interjeição ou um sotaque estrangeiro não são motivo para mudar. Esta regra prevalece sobre as formas obrigatórias de pt-PT acima, que só se aplicam enquanto a conversa estiver em português.

## Voice & Communication Style
- Palavra falada apenas: frases curtas, uma ou duas por turno.
- Tom calmo, simpático e eficiente; mantém o mesmo tom do princípio ao fim.
- Assistente feminina: "Obrigada", nunca "Obrigado".
- Uma pergunta de cada vez; depois de "Está correto?", calas-te e esperas.

` + FLOW_RULES + PROMPT + CALL_BOOKENDS;

const VOICES = ["marin", "cedar", "coral", "sage", "shimmer", "alloy", "ash", "ballad", "echo", "verse"];

export const sessionConfig = (voice = VOICE) => ({
  session: {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: INSTRUCTIONS,
    output_modalities: ["audio"],
    audio: {
      input: {
        transcription: { model: "gpt-4o-transcribe", prompt: TRANSCRIPTION_PROMPT }, // sem "language": o cliente pode falar noutra língua e o bloqueio rígido transcreveria tudo como português
        noise_reduction: { type: "near_field" },
        turn_detection: { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: false }
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
    max_output_tokens: 4096 // ~3,4 min de fala: o limite anterior (600 = ~30s) truncava resumos a meio
  }
});

app.post("/api/session", async (req, res) => {
  try {
    if (req.body?.provider === "eleven") {
      // ElevenLabs Agents: o guião, o LLM e a voz vivem no agente configurado no painel da ElevenLabs.
      // O servidor só assina o URL — a chave nunca chega ao browser.
      if (!ELEVEN_API_KEY || !ELEVEN_AGENT_ID) return res.status(503).json({ error: "elevenlabs indisponível: falta ELEVENLABS_API_KEY ou ELEVENLABS_AGENT_ID" });
      const r = await fetch(`${ELEVEN_BASE}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(ELEVEN_AGENT_ID)}`, {
        headers: { "xi-api-key": ELEVEN_API_KEY }
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json(data);
      return res.json({
        provider: "eleven", ws_url: data.signed_url, agent_id: ELEVEN_AGENT_ID,
        model: "elevenlabs-agents", first_message: FIRST_MESSAGE
      });
    }
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
        instructions: GROK_INSTRUCTIONS, first_message: FIRST_MESSAGE
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
const EXTRACT_PROMPT = `Extrai, a partir da transcrição de uma chamada entre a assistente virtual Alice (Alfaseguros) e um cliente, os campos pedidos. Regras: 'dados_recolhidos' em formato 'campo: valor; campo: valor'. PROIBIDO incluir qualquer informação de saúde, doenças, medicação ou deficiências em qualquer campo; se o cliente a mencionou, marca mencionou_dados_saude=true e escreve no resumo apenas 'cliente mencionou informação de saúde, a recolher por humano'. 'campos_em_falta' = campos obrigatórios do produto que o cliente não soube. 'produto' usa os códigos: AUTOMOVEL, MULTIRRISCOS_HABITACAO, MULTIRRISCOS_CONDOMINIO, MULTIRRISCOS_EMPRESARIAL, SAUDE, TVDE, ACIDENTES_TRABALHO_INDIVIDUAL, ACIDENTES_TRABALHO_COLETIVO, RC_GERAL, RC_CONSTRUCAO, RC_EMPRESARIAL, RC_MEDICOS, RC_ARMAS_CACADOR, OBRAS_MONTAGENS, ANIMAIS, BICICLETAS_TROTINETAS, VIAGEM, EMBARCACAO, ACIDENTES_PESSOAIS (ou "" se não for simulação). 'quer_humano' só é true se o cliente pediu EXPLICITAMENTE para falar com uma pessoa; um colega ligar de volta é o fluxo normal e NÃO conta. 'prioridade' alta se sinistro urgente, pedido sem resposta, cliente irritado ou quer_humano=true. Resumo em 2 a 4 frases, português europeu, para um consultor humano. Campos vazios = "".`;

app.post("/api/extract", async (req, res) => {
  try {
    const transcript = (req.body.transcript || []).map(t => `${t.role === "user" ? "CLIENTE" : "ALICE"}: ${t.text}`).join("\n");
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

app.get("/health", (_, res) => res.json({ ok: true, model: REALTIME_MODEL, voice: VOICE,
  motores: { grok: !!XAI_API_KEY, eleven: !!(ELEVEN_API_KEY && ELEVEN_AGENT_ID), openai: !!OPENAI_API_KEY } }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`alfa-voz-openai on :${port} (${REALTIME_MODEL}, voz ${VOICE})`));
