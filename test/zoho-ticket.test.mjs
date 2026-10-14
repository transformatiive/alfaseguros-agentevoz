import assert from "node:assert/strict";
import test from "node:test";

import { reporCursores } from "../encaminhamento.js";
import { esquecerAgentesZoho, notificarZohoDesk } from "../zoho-ticket.js";

const ENV = {
  ZOHO_DESK_CLIENT_ID: "id",
  ZOHO_DESK_CLIENT_SECRET: "secret",
  ZOHO_DESK_REFRESH_TOKEN: "refresh",
  ZOHO_DESK_ORG_ID: "683863304",
  ZOHO_DESK_DEPARTMENT_ID: "dep_1"
};

const AGENTES = {
  data: [
    { id: "a1", firstName: "Ana", lastName: "Inácio" },
    { id: "a2", firstName: "Ruben", lastName: "Matos" },
    { id: "v1", firstName: "Vânia", lastName: "Rodrigues" },
    { id: "t1", firstName: "Tiago", lastName: "Paiva" },
    { id: "c1", firstName: "Andreia", lastName: "Coelho" },
    { id: "j1", firstName: "João", lastName: "Martins" },
    { id: "m1", firstName: "Marina", lastName: "Fernandes" },
    { id: "al1", firstName: "Andreia", lastName: "Almeida" }
  ]
};

function fetchFalso(chamadas) {
  return async (url, opts = {}) => {
    const href = String(url);
    chamadas.push({ href, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : undefined });
    if (href.includes("/oauth/v2/token")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "tok" }), text: async () => "" };
    }
    if (href.includes("/agents")) {
      return { ok: true, status: 200, text: async () => JSON.stringify(AGENTES) };
    }
    if (href.endsWith("/tickets") && opts.method === "POST") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ticket_9" }) };
    }
    if (href.includes("/followers")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) };
    }
    return { ok: false, status: 500, text: async () => "inesperado" };
  };
}

test("sem credenciais não chama o Zoho", async () => {
  const r = await notificarZohoDesk({ resultado: { categoria: "OUTRO" } }, { env: {}, fetch: async () => { throw new Error("não devia"); } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "sem credenciais");
});

test("sinistro cria o ticket com o HTML do email e o primeiro agente da rotação", async () => {
  reporCursores();
  esquecerAgentesZoho();
  const chamadas = [];
  const r = await notificarZohoDesk({
    resultado: {
      categoria: "SINISTRO",
      nome_cliente: "Rita Dias",
      telefone: "910000111",
      email: "rita@example.com",
      prioridade: "alta",
      resumo: "Teve uma batida.",
      quer_humano: true,
      mencionou_dados_saude: false,
      cliente_existente: "nao",
      proximo_passo: "Ligar."
    },
    transcript: [{ role: "user", text: "Bati com o carro." }],
    diag: { motor: "GPT-Live-1 (telefone)", underruns: 0, cortes: 0, reconexoes: 0, falsosVad: 0, dobresResp: 0, destravas: 0, limpezas: 0 },
    data: "2026-10-13T12:00:00.000Z",
    origem: "alfa-voz-sip"
  }, { env: ENV, fetch: fetchFalso(chamadas) });

  assert.equal(r.ok, true);
  assert.equal(r.id, "ticket_9");
  assert.equal(r.responsavel, "Ana Inácio");
  const ticket = chamadas.find(c => c.method === "POST" && c.href.endsWith("/tickets"));
  assert.equal(ticket.body.subject, "Alice — Sinistro · Rita Dias [PRIORITÁRIO]");
  assert.equal(ticket.body.assigneeId, "a1");
  assert.equal(ticket.body.departmentId, "dep_1");
  assert.equal(ticket.body.channel, "Phone");
  assert.equal(ticket.body.priority, "High");
  assert.match(ticket.body.description, /Alice — Novo pedido registado/);
  assert.match(ticket.body.description, /Teve uma batida\./);
  assert.match(ticket.body.description, /Bati com o carro\./);
  assert.equal(ticket.body.contact.email, "rita@example.com");
  assert.equal(chamadas.some(c => c.href.includes("/followers")), false);
  assert.match(chamadas.find(c => c.href.includes("/agents")).href, /desk\.zoho\.com/);
});

test("simulação acrescenta o segundo consultor como seguidor", async () => {
  esquecerAgentesZoho();
  const chamadas = [];
  const r = await notificarZohoDesk({
    resultado: { categoria: "SIMULACAO", nome_cliente: "Rui", prioridade: "normal", resumo: "Quer simular o automóvel." },
    transcript: [],
    data: "2026-10-13T12:00:00.000Z",
    origem: "alfa-voz-web"
  }, { env: ENV, fetch: fetchFalso(chamadas) });
  assert.equal(r.responsavel, "Andreia Coelho");
  assert.deepEqual(r.seguidores, ["João Martins"]);
  const ticket = chamadas.find(c => c.href.endsWith("/tickets"));
  assert.equal(ticket.body.assigneeId, "c1");
  assert.equal(ticket.body.priority, "Medium");
  const seguidores = chamadas.find(c => c.href.includes("/followers"));
  assert.deepEqual(seguidores.body.followerIds, ["j1"]);
});
