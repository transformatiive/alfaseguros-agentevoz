import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
const promptSrc = fs.readFileSync(path.join(root, "prompt_alfa.md"), "utf8");
const liveSrc = fs.readFileSync(path.join(root, "live-session.js"), "utf8");
const sipSrc = fs.readFileSync(path.join(root, "sip-agent.js"), "utf8");

const aRules = serverSrc.slice(
  serverSrc.indexOf("const A_RULES"),
  serverSrc.indexOf("const INSTRUCTIONS")
);
const grokBlock = serverSrc.slice(
  serverSrc.indexOf("const GROK_INSTRUCTIONS"),
  serverSrc.indexOf("const LIVE_DELEGATE_INSTRUCTIONS")
);
const flowRules = serverSrc.slice(
  serverSrc.indexOf("const FLOW_RULES"),
  serverSrc.indexOf("const CALL_BOOKENDS")
);

const fillersPt = ["hum", "ah", "ok", "certo", "pois"];
const fillersBrProibidos = ["né", "tá", "Oi", "beleza", "legal"];

test("GPT-Live instructions carry the ChatGPT Voice speaking-style layer", () => {
  assert.match(aRules, /ChatGPT Voice/);
  assert.match(aRules, /pessoa real ao telefone/);
  assert.match(aRules, /não finges ser humana/i);
  assert.match(aRules, /assistente virtual/);
  for (const filler of fillersPt) assert.match(aRules, new RegExp(`«${filler}»`));
  for (const br of fillersBrProibidos) assert.match(aRules, new RegExp(`«${br}»`));
  assert.match(aRules, /PROIBIDO tom de menu automático \/ IVR/);
  assert.match(aRules, /NÃO aceleres a fala \(speed=1\.0\)/);
});

test("shared guião and Grok rollback get the same pt-PT human manner", () => {
  assert.match(promptSrc, /Maneira ao telefone/);
  assert.match(promptSrc, /não finges ser humana/);
  assert.match(promptSrc, /assistente virtual/);
  for (const filler of fillersPt) assert.match(promptSrc, new RegExp(`«${filler}»`));
  assert.match(grokBlock, /«hum»/);
  assert.match(grokBlock, /«ah»/);
  assert.match(grokBlock, /«ok»/);
  assert.match(grokBlock, /não finges ser humana/i);
  assert.match(grokBlock, /assistente virtual/);
  assert.match(flowRules, /Reações humanas curtas são permitidas/);
});

test("Alice still identifies as a virtual assistant, not a pretended human", () => {
  assert.match(promptSrc, /Não és humana e, se te perguntarem, dizes que és uma assistente virtual/);
  assert.match(serverSrc, /Olá, fala a Alice, assistente virtual da Alfaseguros/);
  assert.doesNotMatch(aRules, /Nunca te apresentes como (um produto|uma voz|uma IA)/);
  assert.doesNotMatch(grokBlock, /Nunca te apresentes como (um produto|uma voz|uma IA)/);
  assert.doesNotMatch(promptSrc, /Nunca te apresentes como (um produto|uma voz|uma IA)/);
});

test("speaking-style layer does not retune model, voice, speed, tools, or SIP routing", () => {
  assert.match(liveSrc, /DEFAULT_GPT_LIVE_MODEL = "gpt-live-1"/);
  assert.match(liveSrc, /DEFAULT_GPT_LIVE_VOICE = "marin"/);
  assert.match(liveSrc, /DEFAULT_GPT_LIVE_SPEED = 1\.0/);
  assert.match(liveSrc, /name: "end_call"/);
  assert.match(sipSrc, /openaiLiveAcceptUrl/);
  assert.match(sipSrc, /name: "end_call"/);
  assert.doesNotMatch(liveSrc, /bossa.*default/i);
});
