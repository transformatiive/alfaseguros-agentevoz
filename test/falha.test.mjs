import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";

import { resultadoDeFalha, descreverErro, criarFiltroFalhas } from "../falha.js";
import { OPENAI_SIP_WEBHOOK_PATH, assinarWebhook, registarRotasSip } from "../sip-agent.js";
import { liveSessionConfig } from "../live-session.js";

const CAMPOS = [
  "categoria", "produto", "nome_cliente", "telefone", "email", "nif", "cliente_existente",
  "dados_recolhidos", "campos_por_confirmar", "campos_em_falta", "quer_humano", "prioridade",
  "resumo", "proximo_passo", "mencionou_dados_saude"
];

test("resultadoDeFalha traz todos os campos do pedido, prioridade alta e o telefone", () => {
  const r = resultadoDeFalha({ telefone: "917318234", motivo: "extracao" });
  assert.deepEqual(Object.keys(r).sort(), [...CAMPOS].sort());
  assert.equal(r.categoria, "OUTRO");
  assert.equal(r.prioridade, "alta");
  assert.equal(r.telefone, "917318234");
  assert.match(r.resumo, /resumo automático falhou/);
  assert.match(resultadoDeFalha({ motivo: "accept" }).resumo, /não conseguiu atender/);
});

test("descreverErro mostra o estado e a mensagem da OpenAI", () => {
  const e = new Error("extracao 403");
  e.status = 403;
  e.data = { error: { message: "Project does not have access to model gpt-5.4-mini" } };
  assert.equal(descreverErro(e), "403 Project does not have access to model gpt-5.4-mini");
  assert.equal(descreverErro(new Error("rede")), "rede");
});

test("criarFiltroFalhas deixa passar só a primeira falha por número dentro da janela", () => {
  const f = criarFiltroFalhas(1000);
  assert.equal(f("351910000000", 0), true);
  assert.equal(f("351910000000", 500), false);
  assert.equal(f("351920000000", 500), true);
  assert.equal(f("351910000000", 2000), true);
});

const SECRET = `whsec_${Buffer.from("test-openai-webhook-secret").toString("base64")}`;

async function arrancar({ fetchImpl }) {
  const falhas = [];
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  registarRotasSip(app, {
    engine: "gpt-live",
    openaiBase: "https://api.openai.com",
    openaiKey: "sk-test",
    openaiWebhookSecret: SECRET,
    session: liveSessionConfig({ instructions: "Alice", delegateInstructions: "end_call" }),
    primeiraFala: "Olá",
    fetch: fetchImpl,
    WebSocket: class { on() { return this; } send() {} close() {} },
    extrair: async () => ({}),
    registarFalha: (transcript, diag, motivo) => falhas.push({ transcript, diag, motivo })
  });
  const server = app.listen(0);
  await once(server, "listening");
  return { server, falhas, url: `http://127.0.0.1:${server.address().port}${OPENAI_SIP_WEBHOOK_PATH}` };
}

function evento(sessionId, from) {
  return {
    object: "event", id: "evt", type: "live.transport.incoming", created_at: Math.floor(Date.now() / 1000),
    data: { type: "sip", session_id: sessionId, sip_headers: [{ name: "From", value: from }] }
  };
}

async function enviar(url, body) {
  const raw = JSON.stringify(body);
  return fetch(url, { method: "POST", headers: assinarWebhook(raw, SECRET, {}), body: raw });
}

test("accept recusado (ex.: sem créditos) cria um só pedido de falha por número", async () => {
  const ctx = await arrancar({
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => "insufficient_quota" })
  });
  try {
    const de = "sip:+351917318234@sip.telnyx.eu";
    assert.equal((await enviar(ctx.url, evento("sess_a", de))).status, 502);
    assert.equal((await enviar(ctx.url, evento("sess_b", de))).status, 502);
    assert.equal(ctx.falhas.length, 1);
    assert.equal(ctx.falhas[0].motivo, "accept");
    assert.equal(ctx.falhas[0].diag.telefone_origem, de);
  } finally {
    await new Promise(r => ctx.server.close(r));
  }
});
