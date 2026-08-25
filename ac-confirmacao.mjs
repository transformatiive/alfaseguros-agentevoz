// Critérios: pt exclusivo + confirmação/fecho + Modelo B pré-#29 + VAD anti-cortes.
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
const bookendsMatch = server.match(/const CALL_BOOKENDS = `([\s\S]*?)`;\n\nconst TRANSCRIPTION/);
const grok = (headerMatch?.[1] || "") + (flowMatch?.[1] || "") + prompt + (bookendsMatch?.[1] || "");
if (!headerMatch) throw new Error("GROK_INSTRUCTIONS block not found");

ok("confirmação: volta após digressão", /Se o cliente se desviar[\s\S]*VOLTA a pedir confirmação/.test(prompt));
ok("fecho: nunca end_call sem frase", /Nunca chames end_call sem ter dito esta frase de fecho/.test(prompt));
ok("extract: campos_por_confirmar = ambíguos", /campos_por_confirmar' = APENAS campos cuja resposta ficou AMBÍGUA/.test(server));
ok("guião: SEMPRE e EXCLUSIVAMENTE pt-PT", /Falas SEMPRE e EXCLUSIVAMENTE em português europeu/.test(prompt));
ok("transcrição A: language pt", /language: "pt"/.test(server));
ok("página: PT_RESP", /const PT_RESP=/.test(html) && !/LING_RESP/.test(html));

ok("Grok: stack pré-#29 (UMA FALA antes de LÍNGUA)", /^## CRITICAL INSTRUCTIONS — UMA FALA/.test(headerMatch[1]));
ok("Grok: append prompt_alfa + CALL_BOOKENDS", grok.includes("És a Alice, assistente virtual da Alfaseguros") && /disseste a frase de fecho completa/.test(grok));
ok("Grok: sem GROK_CALL_BOOKENDS", !/NÃO digas a despedida nem a frase de fecho — o sistema entrega-a/.test(server));
ok("Grok: sem prompt inglês compacto #29", !/## Role & Persona/.test(headerMatch[1]));
ok("voice default eve", /GROK_VOICE.*"eve"/.test(server));
ok("model pinned think-fast-2.0", /GROK_MODEL.*grok-voice-think-fast-2\.0/.test(server));

ok("VAD threshold 0.85 (anti-cortes)", /threshold:0\.85/.test(html));
ok("VAD silence 600ms (anti-cortes)", /silence_duration_ms:600/.test(html));
ok("sem force_message", !/function forceFala\(/.test(html));
ok("abertura via pedeResposta (Grok=A)", /A tua primeira fala é exatamente/.test(html) && !/forceFala\(s\.first_message/.test(html));
ok("fecho pelo modelo (sem forceFala)", /cobre despedida já dita antes do end_call/.test(html));
ok("transcrição Grok: language_hint pt-PT", /language_hint:'pt-PT'/.test(html));

const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} ok`);
console.log(`Grok instructions: ${grok.length} chars`);
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
if (failed.length) process.exit(1);
