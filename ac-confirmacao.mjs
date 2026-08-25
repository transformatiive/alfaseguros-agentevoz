// Critérios: pt exclusivo + confirmação/fecho + Modelo B (Grok) com guião português completo.
import fs from "node:fs";
import assert from "node:assert/strict";

const prompt = fs.readFileSync(new URL("./prompt_alfa.md", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./server.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

const checks = [];
function ok(name, cond) {
  checks.push({ name, ok: !!cond });
  assert.ok(cond, name);
}

const headerMatch = server.match(/const GROK_INSTRUCTIONS = `([\s\S]*?)`\s*\+ FLOW_RULES/);
const flowMatch = server.match(/const FLOW_RULES = `([\s\S]*?)`;\n\nconst CALL_BOOKENDS/);
const grokBookendsMatch = server.match(/const GROK_CALL_BOOKENDS = `([\s\S]*?)`;/);
const grok = (headerMatch?.[1] || "") + (flowMatch?.[1] || "") + prompt + (grokBookendsMatch?.[1] || "");
if (!headerMatch) throw new Error("GROK_INSTRUCTIONS block not found");

// Confirmação / fecho (guião partilhado)
ok("confirmação: volta após digressão", /Se o cliente se desviar[\s\S]*VOLTA a pedir confirmação/.test(prompt));
ok("fecho: nunca end_call sem frase", /Nunca chames end_call sem ter dito esta frase de fecho/.test(prompt));
ok("extract: campos_por_confirmar = ambíguos", /campos_por_confirmar' = APENAS campos cuja resposta ficou AMBÍGUA/.test(server));

// Português exclusivo
ok("guião: SEMPRE e EXCLUSIVAMENTE pt-PT", /Falas SEMPRE e EXCLUSIVAMENTE em português europeu/.test(prompt));
ok("guião: sem BASTA UMA FRASE", !/BASTA UMA FRASE COMPLETA/.test(prompt + server));
ok("transcrição A: language pt", /language: "pt"/.test(server));
ok("página: PT_RESP", /const PT_RESP=/.test(html) && !/LING_RESP/.test(html));

// Modelo B — stack português completo (regressão pt-BR)
ok("Grok: CRITICAL LÍNGUA no topo", /^## CRITICAL INSTRUCTIONS — LÍNGUA/.test(grok));
ok("Grok: EXCLUSIVAMENTE pt-PT", /Respondes EXCLUSIVAMENTE em português europeu de Portugal/.test(grok));
ok("Grok: append FLOW_RULES", grok.includes("# Tratamento do cliente (neutro quanto ao género"));
ok("Grok: append prompt_alfa", grok.includes("És a Alice, assistente virtual da Alfaseguros"));
ok("Grok: GROK_CALL_BOOKENDS sem fala de fecho", /NÃO digas a despedida nem a frase de fecho/.test(grok));
ok("Grok: forbidden está fazendo", /está fazendo/.test(grok));
ok("Grok: required está a fazer", /está a fazer/.test(grok));
ok("Grok: forbidden a gente", /a gente/.test(grok));
ok("Grok: NOT English xAI-only stack", !/## Role & Persona/.test(grok));
ok("Grok: guião completo (>10k chars)", grok.length > 10000);

// Session / client (#29 improvements kept)
ok("model pinned to think-fast-2.0", /GROK_MODEL.*grok-voice-think-fast-2\.0/.test(server));
ok("voice default carina", /GROK_VOICE.*carina/.test(server));
ok("FECHO_MESSAGE exported to session", /fecho_message: FECHO_MESSAGE/.test(server));
ok("VAD threshold 0.85", /threshold:0\.85/.test(html));
ok("VAD silence 600ms", /silence_duration_ms:600/.test(html));
ok("force_message helper", /function forceFala\(/.test(html));
ok("fecho via force_message on end_call", /forceFala\(fechoMsg/.test(html));
ok("abertura Grok via force_message", /provider==='grok'[\s\S]*forceFala\(s\.first_message/.test(html));
ok("transcrição Grok: language_hint pt-PT", /language_hint:'pt-PT'/.test(html));

const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} ok`);
console.log(`Grok instructions: ${grok.length} chars`);
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
if (failed.length) process.exit(1);
