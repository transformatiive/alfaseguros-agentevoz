// Critérios: confirmação/fecho + português exclusivo (sem mudança de língua).
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

// Confirmação / fecho (mantidos)
ok("confirmação: volta após digressão", /Se o cliente se desviar[\s\S]*VOLTA a pedir confirmação/.test(prompt));
ok("confirmação: Estou pontual não basta", /Um "Estou"[\s\S]*NÃO conta como confirmação do resumo/.test(prompt));
ok("fecho só após confirmação do resumo", /FECHO: só depois de o cliente confirmar o resumo/.test(prompt));
ok("fecho: nunca end_call sem frase", /Nunca chames end_call sem ter dito esta frase de fecho/.test(prompt));
ok("faltas: já é cliente antes do email", /tipicamente se já é cliente — ANTES do email/.test(prompt));
ok("bookends: confirmação pontual não chega", /confirmação pontual[\s\S]*NÃO chega/.test(server));
ok("flow: secção confirmação e digressões", /# Confirmação do pedido e digressões/.test(server));
ok("extract: campos_por_confirmar = ambíguos", /campos_por_confirmar' = APENAS campos cuja resposta ficou AMBÍGUA/.test(server));

// Português exclusivo
ok("guião: SEMPRE e EXCLUSIVAMENTE pt-PT", /Falas SEMPRE e EXCLUSIVAMENTE em português europeu/.test(prompt));
ok("guião: sem secção Língua da chamada multi", !/# Língua da chamada/.test(prompt));
ok("guião: sem âncora inglesa", !/If the caller speaks English/.test(prompt));
ok("guião: sem BASTA UMA FRASE", !/BASTA UMA FRASE COMPLETA/.test(prompt));
ok("guião: cliente noutra língua → nome e telefone", /continua em português europeu[\s\S]*nome e telefone/.test(prompt));
ok("fecho: sem tradução noutra língua", !/mensagem traduzida/.test(prompt));
ok("A_RULES: exclusivo pt-PT", /Respondes SEMPRE e EXCLUSIVAMENTE em português europeu/.test(server));
ok("A_RULES: sem mudança de língua", /Nunca mudas de língua/.test(server));
ok("A_RULES: prioridade português exclusivo", /Português europeu exclusivo e tom estável/.test(server));
ok("GROK: EXCLUSIVAMENTE pt-PT", /Respondes EXCLUSIVAMENTE em português europeu de Portugal \(pt-PT\)/.test(server));
ok("GROK: sem BASTA UMA FRASE / âncora EN", !/BASTA UMA FRASE COMPLETA|If the caller speaks English/.test(server));
ok("GROK: continua em português se EN/ES/FR", /CONTINUAS em português europeu/.test(server));
ok("transcrição: language pt bloqueado", /transcription: \{ model: "gpt-4o-transcribe", language: "pt"/.test(server));
ok("transcrição: prompt só português", /Chamada telefónica em português de Portugal/.test(server));
ok("página: PT_RESP (não LING_RESP)", /const PT_RESP=/.test(html) && !/LING_RESP/.test(html));
ok("página: vigia força pt-PT", /PT_RESP\+' O cliente está em silêncio/.test(html));

const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} ok`);
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
if (failed.length) process.exit(1);
