// Critérios: pt exclusivo + confirmação/fecho + shape xAI do Modelo B (Grok).
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

const grokMatch = server.match(/const GROK_INSTRUCTIONS = `([\s\S]*?)`;\n\n\nconst FLOW_RULES/);
const grok = grokMatch ? grokMatch[1] : "";
const productFields = (server.match(/const GROK_PRODUCT_FIELDS = `([\s\S]*?)`;/) || [])[1] || "";
const grokEffective = grok.replace(/\$\{GROK_PRODUCT_FIELDS\}/, productFields);
if (!grok) throw new Error("GROK_INSTRUCTIONS block not found");

// Confirmação / fecho (guião partilhado)
ok("confirmação: volta após digressão", /Se o cliente se desviar[\s\S]*VOLTA a pedir confirmação/.test(prompt));
ok("fecho: nunca end_call sem frase", /Nunca chames end_call sem ter dito esta frase de fecho/.test(prompt));
ok("extract: campos_por_confirmar = ambíguos", /campos_por_confirmar' = APENAS campos cuja resposta ficou AMBÍGUA/.test(server));

// Português exclusivo
ok("guião: SEMPRE e EXCLUSIVAMENTE pt-PT", /Falas SEMPRE e EXCLUSIVAMENTE em português europeu/.test(prompt));
ok("guião: sem BASTA UMA FRASE", !/BASTA UMA FRASE COMPLETA/.test(prompt + server));
ok("transcrição A: language pt", /language: "pt"/.test(server));
ok("página: PT_RESP", /const PT_RESP=/.test(html) && !/LING_RESP/.test(html));

// Modelo B — xAI prompting guide shape
ok("Grok: ## Role & Persona", /## Role & Persona/.test(grokEffective));
ok("Grok: ## Objective", /## Objective/.test(grokEffective));
ok("Grok: ## Conversation Flow", /## Conversation Flow/.test(grokEffective));
ok("Grok: ## Guardrails & Escalation", /## Guardrails & Escalation/.test(grokEffective));
ok("Grok: ## Voice & Communication Style", /## Voice & Communication Style/.test(grokEffective));
ok("Grok: ## CRITICAL INSTRUCTIONS last block", /## CRITICAL INSTRUCTIONS[\s\S]*ALWAYS stay silent/.test(grokEffective));
ok("Grok: second person You are Alice", /You are Alice/.test(grokEffective));
ok("Grok: NOT appending full prompt_alfa", !grokEffective.includes("És a Alice, assistente virtual da Alfaseguros, uma corretora"));
ok("Grok: compact product fields", /EMBARCACAO: tipo/.test(grokEffective));
ok("Grok: end_call after full confirm, no goodbye", /call \\`end_call\\` immediately[\s\S]*Do NOT speak a goodbye/.test(grokEffective));
ok("Grok: language lock pt-PT", /Respond ONLY in European Portuguese \(pt-PT\)/.test(grokEffective));
ok("Grok: slim CRITICAL (no dual CRITICAL headers up front)", !/^## CRITICAL INSTRUCTIONS — UMA FALA/m.test(grokEffective));
ok("Grok prompt under 8k chars", grokEffective.length < 8000);

// Session / client
ok("model pinned to think-fast-2.0", /GROK_MODEL.*grok-voice-think-fast-2\.0/.test(server));
ok("FECHO_MESSAGE exported to session", /fecho_message: FECHO_MESSAGE/.test(server));
ok("VAD threshold 0.85", /threshold:0\.85/.test(html));
ok("VAD silence 600ms", /silence_duration_ms:600/.test(html));
ok("force_message helper", /function forceFala\(/.test(html));
ok("fecho via force_message on end_call", /forceFala\(fechoMsg/.test(html));
ok("abertura Grok via force_message", /provider==='grok'[\s\S]*forceFala\(s\.first_message/.test(html));
ok("end_call tool: system delivers closing", /system delivers the fixed closing message/.test(html));

const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} ok`);
console.log(`Grok instructions: ${grokEffective.length} chars`);
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
if (failed.length) process.exit(1);
