import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  TTS_PAUSA_CURTA,
  gptLiveGreetingCommentary,
  gptLiveGreetingSpeakInstructions,
  saudacaoParaTts
} from "../live-session.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const sipSrc = fs.readFileSync(path.join(root, "sip-agent.js"), "utf8");

const SAUDACAO = `Alfa Seguros, sou a Alice, assistente virtual.

Os consultores estão ocupados, mas eu registo o seu pedido.

Em que posso ajudar?`;

test("a saudação no código é o texto exacto, com as quebras de linha", () => {
  assert.match(serverSrc, new RegExp(SAUDACAO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(serverSrc, /Olá, fala a Alice/);
  assert.doesNotMatch(serverSrc, /Esta chamada é gravada/);
  assert.doesNotMatch(serverSrc, /bem-vindo à Alfa Seguros/);
});

test("o cliente pode interromper a saudação em todos os motores", () => {
  const corte = /Se o cliente começar a falar durante a saudação, páras logo e ouves/;
  assert.match(gptLiveGreetingSpeakInstructions(SAUDACAO), corte);
  assert.match(serverSrc, corte);
  assert.match(sipSrc, corte);
  assert.equal((html.match(new RegExp(corte.source, "g")) || []).length, 2);
});

test("GPT-Live diz a saudação tal e qual, pausa nas quebras e depois espera", () => {
  const fala = gptLiveGreetingSpeakInstructions(SAUDACAO);
  assert.match(fala, /palavra por palavra/);
  assert.match(fala, /Não reformules/);
  assert.match(fala, /pausa curta/);
  assert.match(fala, /ficas em silêncio até o cliente responder/);
  assert.ok(fala.endsWith(`«${SAUDACAO}»`));
  const comentario = gptLiveGreetingCommentary();
  assert.match(comentario, /saudação exacta/);
  assert.match(comentario, /pausa curta em cada quebra de linha/);
  assert.match(comentario, /silêncio até o cliente responder/);
  assert.match(html, /Não reformules, não encurtes, não omitas nem acrescentes palavras/);
  assert.match(html, /pausa curta em cada quebra de linha, e depois fica em silêncio até o cliente responder/);
});

test("Grok no browser e no SIP recebe a mesma ordem de não reformular e de esperar", () => {
  assert.match(html, /sem reformular, encurtar, omitir ou acrescentar/);
  assert.match(html, /Cada quebra de linha é uma pausa curta; não a pronuncies\. Diz só isso e fica em silêncio até o cliente responder/);
  assert.match(sipSrc, /sem reformular, encurtar, omitir ou acrescentar: "\$\{primeiraFala\}"/);
  assert.match(sipSrc, /Cada quebra de linha é uma pausa curta; não a pronuncies\. Diz só isso e fica em silêncio até o cliente responder/);
});

test("no TTS, cada sequência de quebras de linha vira uma pausa curta e o texto falado mantém-se", () => {
  const falado = saudacaoParaTts(SAUDACAO);
  const frases = [
    "Alfa Seguros, sou a Alice, assistente virtual.",
    "Os consultores estão ocupados, mas eu registo o seu pedido.",
    "Em que posso ajudar?"
  ];
  assert.equal(falado, frases.join(` ${TTS_PAUSA_CURTA} `));
  assert.equal(saudacaoParaTts("uma linha"), "uma linha");
  assert.equal((falado.match(/<break time="0\.4s" \/>/g) || []).length, 2);
  assert.match(serverSrc, /first_message: saudacaoParaTts\(FIRST_MESSAGE\)/);
  assert.match(html, /conversation_config_override:\{agent:\{first_message:s\.first_message\}\}/);
});
