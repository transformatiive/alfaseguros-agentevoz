// O mesmo conteúdo que o n8n põe no email de fim de chamada (alfa-voz-resultado).
// O ticket do Zoho Desk usa este assunto e este HTML, para o consultor ver o pedido igual.

const PEDIDOS = {
  SIMULACAO: "Simulação",
  GESTAO_APOLICE: "Gestão de apólice",
  SINISTRO: "Sinistro",
  CANCELAMENTO: "Cancelamento",
  PEDIDO_SEM_RESPOSTA: "Pedido sem resposta",
  OUTRO: "Outro"
};

function esc(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function texto(valor) {
  if (valor == null) return "";
  return String(valor).trim();
}

export function rotuloPedido(categoria) {
  const codigo = texto(categoria).toUpperCase();
  return PEDIDOS[codigo] || texto(categoria) || "Outro";
}

export function assuntoDoPedido(resultado) {
  const pedido = rotuloPedido(resultado?.categoria);
  const nome = texto(resultado?.nome_cliente);
  const urgente = texto(resultado?.prioridade).toLowerCase() === "alta";
  return `Alice — ${pedido}${nome ? ` · ${nome}` : ""}${urgente ? " [PRIORITÁRIO]" : ""}`;
}

function simNao(valor) {
  return valor ? "Sim" : "Não";
}

function linhasDoPedido(resultado, diag) {
  const r = resultado || {};
  const linhas = [["Pedido", rotuloPedido(r.categoria)]];
  const opcionais = [
    ["Nome", r.nome_cliente],
    ["Telefone", r.telefone],
    ["Número de origem", diag?.telefone_origem],
    ["Email", r.email],
    ["NIF", r.nif],
    ["Já é cliente", r.cliente_existente],
    ["Dados recolhidos", r.dados_recolhidos]
  ];
  for (const [rotulo, valor] of opcionais) {
    const v = texto(valor);
    if (v) linhas.push([rotulo, v]);
  }
  linhas.push(
    ["Quer falar com humano", simNao(r.quer_humano)],
    ["Prioridade", texto(r.prioridade) || "normal"]
  );
  const passo = texto(r.proximo_passo);
  if (passo) linhas.push(["Próximo passo", passo]);
  linhas.push(["Mencionou dados de saúde", simNao(r.mencionou_dados_saude)]);
  return linhas;
}

function linhaHtml(rotulo, valor) {
  return `<tr><td style="padding:6px 12px;font-weight:600;color:#762023;white-space:nowrap;vertical-align:top">${esc(rotulo)}</td><td style="padding:6px 12px">${esc(valor)}</td></tr>`;
}

function transcricoes(transcript) {
  return (transcript || [])
    .map(t => {
      const fala = texto(t?.text);
      if (!fala) return "";
      const cliente = t.role === "user";
      const quem = cliente ? "Cliente" : "Alice";
      const cor = cliente ? "#30343a" : "#f47920";
      return `<p style="margin:4px 0"><strong style="color:${cor}">${quem}:</strong> ${esc(fala)}</p>`;
    })
    .filter(Boolean)
    .join("");
}

function diagnostico(diag) {
  if (!diag) return "";
  const n = chave => Number(diag[chave]) || 0;
  return [
    `Diagnóstico técnico: ${texto(diag.motor) || "Alice"}`,
    `falhas de reprodução (rede): ${n("underruns")}`,
    `interrupções por voz/ruído: ${n("cortes")}`,
    `reconexões: ${n("reconexoes")}`,
    `disparos de VAD com ruído: ${n("falsosVad")}`,
    `falas duplas bloqueadas: ${n("dobresResp")}`,
    `destraves: ${n("destravas")}`,
    `limpezas de buffer: ${n("limpezas")}`
  ].join(" · ");
}

/** HTML do email de resultado. Campos vazios saem, como no n8n. */
export function htmlDoPedido({ resultado, transcript, diag, data, origem } = {}) {
  const quando = `${esc(texto(data))} · ${esc(texto(origem))}`;
  const tabela = linhasDoPedido(resultado, diag).map(([rotulo, valor]) => linhaHtml(rotulo, valor)).join("");
  const resumo = texto(resultado?.resumo);
  const falas = transcricoes(transcript);
  const diagTxt = diagnostico(diag);
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;border:1px solid #f2e4d6;border-radius:12px;overflow:hidden">
<div style="background:#f47920;color:#fff;padding:18px 22px"><h2 style="margin:0;font-size:18px">Alice — Novo pedido registado</h2><p style="margin:4px 0 0;font-size:13px;opacity:.9">${quando}</p></div>
<table style="border-collapse:collapse;width:100%;font-size:14px;color:#30343a">${tabela}</table>
${resumo ? `<div style="padding:14px 22px;background:#fff6ef;font-size:14px;color:#30343a"><strong style="color:#762023">Resumo:</strong> ${esc(resumo)}</div>\n` : ""}${falas ? `<div style="padding:14px 22px;font-size:13px;color:#555"><strong style="color:#762023">Transcrição</strong>${falas}</div>\n` : ""}${diagTxt ? `<div style="padding:10px 22px;background:#f7f7f7;font-size:12px;color:#777">${esc(diagTxt)}</div>\n` : ""}</div>`;
}
