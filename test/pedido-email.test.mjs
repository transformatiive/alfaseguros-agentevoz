import assert from "node:assert/strict";
import test from "node:test";

import { assuntoDoPedido, htmlDoPedido } from "../pedido-email.js";

const diag = {
  motor: "GPT-Live-1 (telefone)",
  telefone_origem: "910000000",
  underruns: 0, cortes: 1, reconexoes: 0, falsosVad: 0, dobresResp: 0, destravas: 0, limpezas: 0
};

test("o assunto segue o email: pedido, nome e prioritário", () => {
  assert.equal(assuntoDoPedido({ categoria: "OUTRO" }), "Alice — Outro");
  assert.equal(
    assuntoDoPedido({ categoria: "PEDIDO_SEM_RESPOSTA", nome_cliente: "Ana Costa", prioridade: "alta" }),
    "Alice — Pedido sem resposta · Ana Costa [PRIORITÁRIO]"
  );
  assert.equal(
    assuntoDoPedido({ categoria: "PEDIDO_SEM_RESPOSTA", prioridade: "alta" }),
    "Alice — Pedido sem resposta [PRIORITÁRIO]"
  );
});

test("o HTML omite campos vazios e traz resumo, transcrição e diagnóstico como o email", () => {
  const html = htmlDoPedido({
    resultado: {
      categoria: "OUTRO",
      nome_cliente: "",
      telefone: "910000000",
      email: "",
      nif: "",
      cliente_existente: "desconhecido",
      dados_recolhidos: "",
      quer_humano: false,
      prioridade: "normal",
      proximo_passo: "Aguardar.",
      mencionou_dados_saude: false,
      resumo: "Ainda não disse o motivo."
    },
    transcript: [
      { role: "assistant", text: "Em que posso ajudar?" },
      { role: "user", text: "Daqui <script>" }
    ],
    diag,
    data: "2026-10-13T12:09:23.716Z",
    origem: "alfa-voz-sip"
  });
  assert.match(html, /Alice — Novo pedido registado/);
  assert.match(html, /2026-10-13T12:09:23.716Z · alfa-voz-sip/);
  assert.match(html, />Pedido<\/td><td[^>]*>Outro</);
  assert.match(html, />Telefone<\/td>/);
  assert.match(html, />Número de origem<\/td>/);
  assert.match(html, />Já é cliente<\/td><td[^>]*>desconhecido</);
  assert.match(html, />Quer falar com humano<\/td><td[^>]*>Não</);
  assert.match(html, />Prioridade<\/td><td[^>]*>normal</);
  assert.match(html, />Mencionou dados de saúde<\/td><td[^>]*>Não</);
  assert.doesNotMatch(html, />Nome</);
  assert.doesNotMatch(html, />Email</);
  assert.doesNotMatch(html, />NIF</);
  assert.doesNotMatch(html, />Dados recolhidos</);
  assert.match(html, /Resumo:<\/strong> Ainda não disse o motivo\./);
  assert.match(html, /color:#f47920">Alice:<\/strong> Em que posso ajudar\?/);
  assert.match(html, /color:#30343a">Cliente:<\/strong> Daqui &lt;script&gt;/);
  assert.match(html, /Diagnóstico técnico: GPT-Live-1 \(telefone\) · falhas de reprodução \(rede\): 0 · interrupções por voz\/ruído: 1/);
});
