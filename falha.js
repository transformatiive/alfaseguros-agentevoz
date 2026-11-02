// Quando a Alice não consegue registar a chamada.
//
// Antes, uma falha técnica perdia o cliente sem rasto: a 26/10 a conta OpenAI ficou sem
// créditos e as chamadas eram recusadas em 3-5 s; desde 29/10 à noite a extração devolve
// "model_not_found" e as conversas acabavam sem email nem ticket. Como a Alice "atende"
// para o Ringover, também não nasce ticket de chamada perdida. Por isso, em qualquer
// falha, enviamos na mesma um resultado mínimo para o webhook do n8n, que cria o ticket
// e envia o email com a transcrição que houver.

const MOTIVOS = {
  accept: "A Alice não conseguiu atender a chamada (erro técnico). O cliente não deixou pedido.",
  extracao: "A Alice atendeu, mas o resumo automático falhou. O pedido está na transcrição abaixo."
};

/** Resultado com todos os campos do SCHEMA, para o n8n tratar como um pedido normal. */
export function resultadoDeFalha({ telefone = "", motivo = "extracao" } = {}) {
  const resumo = MOTIVOS[motivo] || MOTIVOS.extracao;
  return {
    categoria: "OUTRO",
    produto: "",
    nome_cliente: "",
    telefone: String(telefone || ""),
    email: "",
    nif: "",
    cliente_existente: "desconhecido",
    dados_recolhidos: "",
    campos_por_confirmar: "",
    campos_em_falta: "",
    quer_humano: false,
    prioridade: "alta",
    resumo,
    proximo_passo: "Ligar ao cliente para saber o pedido.",
    mencionou_dados_saude: false
  };
}

/** Texto curto e sem segredos para o log: estado HTTP e mensagem da OpenAI. */
export function descreverErro(e) {
  if (!e) return "erro desconhecido";
  const msg = e.data?.error?.message || e.message || String(e);
  return e.status ? `${e.status} ${msg}` : msg;
}

/**
 * Uma chamada SIP chega muitas vezes em duas pernas (dois session_id para o mesmo número).
 * Devolve true só na primeira falha de cada número dentro da janela, para não criar dois tickets.
 */
export function criarFiltroFalhas(janelaMs = 10 * 60 * 1000) {
  const vistos = new Map();
  return (chave, agora = Date.now()) => {
    for (const [k, t] of vistos) if (agora - t > janelaMs) vistos.delete(k);
    const k = String(chave || "");
    if (!k) return true;
    if (vistos.has(k)) return false;
    vistos.set(k, agora);
    return true;
  };
}
