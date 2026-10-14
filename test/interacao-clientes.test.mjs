// Melhorias de 14 out 2026 depois dos dois primeiros dias em produção (itens 2, 3, 6, 7 e 9).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prompt = fs.readFileSync(path.join(root, "prompt_alfa.md"), "utf8");
const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("2: nunca diz que não consegue passar a chamada; promete a chamada da pessoa pedida", () => {
  assert.doesNotMatch(prompt, /"Neste momento não consigo passar a chamada/);
  assert.match(prompt, /nunca digas que não consegues passar a chamada/);
  assert.match(prompt, /"Vou deixar o seu pedido como prioritário para \[nome da pessoa pedida\] lhe ligar\."/);
  assert.match(prompt, /usa "para um consultor lhe ligar"/);
});

test("3: resume uma vez e, numa correção, repete só o dado corrigido", () => {
  assert.match(prompt, /resume UMA ÚNICA VEZ/);
  assert.match(prompt, /repetes SÓ o dado corrigido/);
  assert.match(prompt, /Nunca voltas a ler o resumo inteiro/);
});

test("6: no máximo duas tentativas por dado, depois segue em frente", () => {
  assert.match(prompt, /DUAS TENTATIVAS POR DADO, no máximo/);
  assert.match(prompt, /NÃO voltas a pedir: diz "Não faz mal, o consultor confirma consigo"/);
  assert.match(prompt, /ou se já gastaste as duas tentativas desse campo/);
  assert.match(serverSrc, /'campos_por_confirmar' inclui os dados que a Alice tentou recolher duas vezes/);
});

test("7: caminho curto para falar com alguém ou devolver chamada, sem NIF nem email", () => {
  assert.match(prompt, /## CAMINHO CURTO \(FALAR_COLABORADOR e DEVOLUCAO_CHAMADA\)/);
  assert.match(prompt, /Não pedes NIF, email, nem se já é cliente/);
  assert.match(prompt, /IDENTIFICAÇÃO \(sempre, depois da recolha do pedido, exceto no CAMINHO CURTO\)/);
  assert.match(prompt, /No CAMINHO CURTO usas o fecho curto/);
  assert.match(serverSrc, /fecho curto, no caminho curto/);
});

test("9: novas categorias e 'sem resposta' só quando o cliente não fez pedido", () => {
  for (const c of ["FALAR_COLABORADOR", "DEVOLUCAO_CHAMADA", "RECLAMACAO"]) {
    assert.match(prompt, new RegExp(`- ${c}:`));
    assert.match(serverSrc, new RegExp(`"${c}"`));
  }
  assert.doesNotMatch(prompt, /- PEDIDO_SEM_RESPOSTA:/);
  assert.match(serverSrc, /PEDIDO_SEM_RESPOSTA SÓ quando o cliente não chegou a dizer o que queria/);
  assert.match(serverSrc, /'pessoa_pedida: <nome>'/);
});
