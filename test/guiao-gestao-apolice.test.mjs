import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prompt = fs.readFileSync(path.join(root, "prompt_alfa.md"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("automobile policy management falls back to registration only without a policy number", () => {
  const management = prompt.slice(prompt.indexOf("## GESTAO_APOLICE"), prompt.indexOf("## SINISTRO"));
  assert.match(management, /seguro automóvel/i);
  assert.match(management, /não indicou.*número de apólice/i);
  assert.match(management, /matrícula/i);
  assert.match(management, /já indicou.*número de apólice.*não peças a matrícula/i);
});

test("existing customers are asked for and extract a NIF", () => {
  assert.match(prompt, /Se responder que já é cliente da Alfaseguros.*pede o NIF/i);
  assert.match(prompt, /Não peças o NIF por este motivo se responder que não é cliente/i);
  assert.match(server, /cliente_existente.*sim[\s\S]*NIF/i);
  assert.match(server, /nif: \{ type: "string" \}/);
});
