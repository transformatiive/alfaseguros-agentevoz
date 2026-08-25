// Critérios de aceitação: confirmação após digressão, fecho, extract, anti-"Percebi que".
import fs from "node:fs";
import assert from "node:assert/strict";

const prompt = fs.readFileSync(new URL("./prompt_alfa.md", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./server.js", import.meta.url), "utf8");

const checks = [];
function ok(name, cond) {
  checks.push({ name, ok: !!cond });
  assert.ok(cond, name);
}

// Guião partilhado
ok("confirmação: volta após digressão", /Se o cliente se desviar[\s\S]*VOLTA a pedir confirmação/.test(prompt));
ok("confirmação: Estou pontual não basta", /Um "Estou"[\s\S]*NÃO conta como confirmação do resumo/.test(prompt));
ok("fecho só após confirmação do resumo", /FECHO: só depois de o cliente confirmar o resumo/.test(prompt));
ok("fecho: nunca end_call sem frase", /Nunca chames end_call sem ter dito esta frase de fecho/.test(prompt));
ok("faltas: já é cliente antes do email", /tipicamente se já é cliente — ANTES do email/.test(prompt));

// CALL_BOOKENDS + FLOW_RULES (Versão B)
ok("bookends: confirmação pontual não chega", /confirmação pontual[\s\S]*NÃO chega/.test(server));
ok("bookends: volta a Está correto após digressão", /volta a pedir "Está correto\?" sobre o resumo/.test(server));
ok("flow: secção confirmação e digressões", /# Confirmação do pedido e digressões/.test(server));
ok("flow: Estou pontual não substitui", /NÃO substitui a confirmação do pedido/.test(server));
ok("flow: proíbe Percebi que", /PROIBIDO começar uma fala com[\s\S]*"Percebi que"/.test(server));
ok("grok: proíbe Percebi que", /NUNCA inicies uma resposta com[\s\S]*"Percebi que"/.test(server));
ok("a_rules: proíbe Percebi que", /Não comeces falas com[\s\S]*"Percebi que"/.test(server));

// Extract
ok("extract: define campos_por_confirmar = ambíguos", /campos_por_confirmar' = APENAS campos cuja resposta ficou AMBÍGUA/.test(server));
ok("extract: valor claro não vai a por confirmar", /"mota de água"[\s\S]*NÃO vai para 'campos_por_confirmar'/.test(server));
ok("extract: resumo não confirmado ≠ por confirmar", /resumo final não ter sido confirmado[\s\S]*NÃO põe os campos/.test(server));

const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} ok`);
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
if (failed.length) process.exit(1);
