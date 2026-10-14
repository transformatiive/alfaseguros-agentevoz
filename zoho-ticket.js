// Cria o ticket no Zoho Desk no fim da chamada. O mesmo padrão de auth dos outros
// serviços Alfaseguros: datacenter US (desk.zoho.com) e refresh token.
import { encaminharPedido } from "./encaminhamento.js";
import { assuntoDoPedido, htmlDoPedido } from "./pedido-email.js";

const ORG_POR_DEFEITO = "683863304";

let avisouSemCredenciais = false;
const agentesPorOrg = new Map();

export function credenciaisZoho(env = process.env) {
  const clientId = env.ZOHO_DESK_CLIENT_ID?.trim();
  const clientSecret = env.ZOHO_DESK_CLIENT_SECRET?.trim();
  const refreshToken = env.ZOHO_DESK_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    orgId: env.ZOHO_DESK_ORG_ID?.trim() || ORG_POR_DEFEITO,
    accountsBase: (env.ZOHO_DESK_ACCOUNTS_BASE || "https://accounts.zoho.com").replace(/\/+$/, ""),
    apiBase: (env.ZOHO_DESK_API_BASE || "https://desk.zoho.com/api/v1").replace(/\/+$/, ""),
    departmentId: env.ZOHO_DESK_DEPARTMENT_ID?.trim() || ""
  };
}

function normalizarNome(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function tokenDeAcesso(cred, fetchImpl) {
  const url = new URL(`${cred.accountsBase}/oauth/v2/token`);
  url.searchParams.set("refresh_token", cred.refreshToken);
  url.searchParams.set("client_id", cred.clientId);
  url.searchParams.set("client_secret", cred.clientSecret);
  url.searchParams.set("grant_type", "refresh_token");
  const res = await fetchImpl(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Zoho token (${res.status})`);
  }
  return json.access_token;
}

async function zoho(cred, token, path, fetchImpl, { method = "GET", body } = {}) {
  const res = await fetchImpl(`${cred.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: cred.orgId,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const erro = new Error(`Zoho Desk ${method} ${path} (${res.status})`);
    erro.status = res.status;
    erro.body = text.slice(0, 400);
    throw erro;
  }
  return json;
}

async function listarAgentes(cred, token, fetchImpl) {
  const cache = agentesPorOrg.get(cred.orgId);
  if (cache) return cache;
  const mapa = new Map();
  let from = 0;
  for (let pagina = 0; pagina < 20; pagina++) {
    const json = await zoho(cred, token, `/agents?from=${from}&limit=100`, fetchImpl);
    const lote = json.data || [];
    for (const agente of lote) {
      const nome = normalizarNome(`${agente.firstName || ""} ${agente.lastName || ""}`);
      if (nome && agente.id) mapa.set(nome, String(agente.id));
    }
    if (lote.length < 100) break;
    from += 100;
  }
  agentesPorOrg.set(cred.orgId, mapa);
  return mapa;
}

function idDoNome(mapa, nome) {
  return mapa.get(normalizarNome(nome)) || "";
}

async function departamento(cred, token, fetchImpl) {
  if (cred.departmentId) return cred.departmentId;
  const json = await zoho(cred, token, "/departments?limit=50", fetchImpl);
  const lista = json.data || [];
  const preferido = lista.find(d => /atendimento|geral|suporte/i.test(d.name || ""));
  const escolhido = preferido || lista.find(d => d.isEnabled !== false) || lista[0];
  if (!escolhido?.id) throw new Error("Zoho Desk sem departamento");
  return String(escolhido.id);
}

function contacto(resultado) {
  const email = String(resultado?.email || "").trim();
  const telefone = String(resultado?.telefone || "").trim();
  const contact = { lastName: String(resultado?.nome_cliente || "Cliente").trim().slice(0, 120) || "Cliente" };
  if (email.includes("@")) contact.email = email;
  if (telefone) contact.phone = telefone;
  return contact;
}

export function esquecerAgentesZoho() {
  agentesPorOrg.clear();
}

/**
 * Cria o ticket com o HTML do email e encaminha. Sem credenciais, não faz nada:
 * o email do n8n continua a sair na mesma.
 */
export async function notificarZohoDesk(payload, { env = process.env, fetch: fetchImpl = fetch } = {}) {
  const cred = credenciaisZoho(env);
  if (!cred) {
    if (!avisouSemCredenciais) {
      console.warn("[zoho] sem ZOHO_DESK_CLIENT_ID/SECRET/REFRESH_TOKEN; ticket não criado");
      avisouSemCredenciais = true;
    }
    return { ok: false, motivo: "sem credenciais" };
  }

  const destino = encaminharPedido(payload.resultado);
  const token = await tokenDeAcesso(cred, fetchImpl);
  const agentes = await listarAgentes(cred, token, fetchImpl);
  const departmentId = await departamento(cred, token, fetchImpl);
  const responsavelId = idDoNome(agentes, destino.responsavel);
  const seguidorIds = destino.seguidores.map(nome => idDoNome(agentes, nome)).filter(Boolean);
  const emFalta = [
    responsavelId ? "" : destino.responsavel,
    ...destino.seguidores.filter(nome => !idDoNome(agentes, nome))
  ].filter(Boolean);

  const ticket = {
    subject: assuntoDoPedido(payload.resultado),
    departmentId,
    description: htmlDoPedido(payload),
    channel: "Phone",
    status: "Open",
    priority: String(payload.resultado?.prioridade || "").toLowerCase() === "alta" ? "High" : "Medium",
    phone: String(payload.resultado?.telefone || "").trim() || undefined,
    contact: contacto(payload.resultado)
  };
  if (responsavelId) ticket.assigneeId = responsavelId;

  const criado = await zoho(cred, token, "/tickets", fetchImpl, { method: "POST", body: ticket });
  if (seguidorIds.length && criado.id) {
    await zoho(cred, token, `/tickets/${encodeURIComponent(criado.id)}/followers`, fetchImpl, {
      method: "POST",
      body: { followerIds: seguidorIds }
    });
  }
  return {
    ok: true,
    id: criado.id ? String(criado.id) : "",
    fila: destino.fila,
    responsavel: destino.responsavel,
    seguidores: destino.seguidores,
    emFalta
  };
}
