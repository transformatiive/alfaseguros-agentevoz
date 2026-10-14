import assert from "node:assert/strict";
import test from "node:test";

import { classificarPedido, encaminharPedido, reporCursores } from "../encaminhamento.js";

test("sinistros alternam entre Ana Inácio e Ruben Matos", () => {
  reporCursores();
  const pedido = { categoria: "SINISTRO", resumo: "Batida no carro." };
  const a = encaminharPedido(pedido);
  const b = encaminharPedido(pedido);
  const c = encaminharPedido(pedido);
  assert.equal(a.fila, "sinistros");
  assert.equal(a.modo, "round-robin");
  assert.equal(a.responsavel, "Ana Inácio");
  assert.deepEqual(a.seguidores, []);
  assert.equal(b.responsavel, "Ruben Matos");
  assert.equal(c.responsavel, "Ana Inácio");
});

test("carta verde, documentos e alteração de morada ficam com a Vânia e o Tiago", () => {
  for (const resumo of [
    "Precisa da carta verde para a viagem.",
    "Pediu as cartas de verde.",
    "Quer a alteração de morada da apólice.",
    "Pedidos de documentos da apólice e uma segunda via."
  ]) {
    const destino = encaminharPedido({ categoria: "GESTAO_APOLICE", resumo });
    assert.equal(destino.fila, "documentos");
    assert.equal(destino.modo, "ambos");
    assert.equal(destino.responsavel, "Vânia Rodrigues");
    assert.deepEqual(destino.seguidores, ["Tiago Paiva"]);
  }
});

test("simulações ficam com a Andreia Coelho e o João Martins", () => {
  const destino = encaminharPedido({ categoria: "SIMULACAO", resumo: "Seguro automóvel, morada de recolha da carta." });
  assert.equal(destino.fila, "simulacoes");
  assert.equal(destino.responsavel, "Andreia Coelho");
  assert.deepEqual(destino.seguidores, ["João Martins"]);
});

test("uma simulação que pede carta verde vai para documentos, e um sinistro não sai da fila de sinistros", () => {
  assert.equal(classificarPedido({ categoria: "SIMULACAO", resumo: "Também quer a carta verde." }), "documentos");
  assert.equal(classificarPedido({ categoria: "SINISTRO", resumo: "Sinistro e precisa de alterar a morada." }), "sinistros");
});

test("o resto alterna entre Marina Fernandes e Andreia Almeida", () => {
  reporCursores();
  const pedidos = [
    { categoria: "GESTAO_APOLICE", resumo: "Quer saber se o recibo está pago." },
    { categoria: "CANCELAMENTO", resumo: "Quer cancelar." },
    { categoria: "PEDIDO_SEM_RESPOSTA", resumo: "Ninguém lhe ligou." },
    { categoria: "OUTRO", resumo: "Só disse olá." }
  ];
  const nomes = pedidos.map(p => encaminharPedido(p).responsavel);
  assert.deepEqual(nomes, [
    "Marina Fernandes",
    "Andreia Almeida",
    "Marina Fernandes",
    "Andreia Almeida"
  ]);
});
