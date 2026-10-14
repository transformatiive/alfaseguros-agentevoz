// Melhorias de 14 out 2026 depois dos dois primeiros dias em produção (itens 1, 2, 3, 6, 7 e 9, com os ajustes do Nuno).
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

test("3: sem resumo final, passa do último dado ao fecho", () => {
  assert.match(prompt, /SEM RESUMO FINAL/);
  assert.doesNotMatch(prompt, /CONFIRMAÇÃO: resume/);
  assert.match(prompt, /7\. FECHO: logo a seguir ao último dado confirmado/);
  assert.match(prompt, /"Obrigada, o seu pedido ficou registado/);
});

test("6: uma só tentativa por dado, depois o consultor confirma", () => {
  assert.match(prompt, /UMA SÓ TENTATIVA POR DADO/);
  assert.match(prompt, /NÃO voltas a pedir nem pedes para soletrar: diz "Não se preocupe, o consultor confirma consigo"/);
  assert.doesNotMatch(prompt, /DUAS TENTATIVAS/);
  assert.match(serverSrc, /'campos_por_confirmar' inclui os dados que a Alice tentou recolher sem ficarem certos/);
});

test("7: caminho curto para falar com alguém ou devolver chamada, sem NIF nem email", () => {
  assert.match(prompt, /## CAMINHO CURTO \(FALAR_COLABORADOR e DEVOLUCAO_CHAMADA\)/);
  assert.match(prompt, /Não pedes nome, NIF, email, nem se já é cliente/);
  assert.match(prompt, /pergunta só o motivo/);
  assert.match(prompt, /Confirma o número de onde está a ligar, que já tens nos dados da chamada/);
  assert.match(prompt, /vai ligar-lhe de volta o mais breve possível para dar seguimento ao seu pedido/);
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
