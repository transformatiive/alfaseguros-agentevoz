// Quem fica com o ticket no Zoho Desk, a partir do pedido que a Alice registou.
// Sinistros e o resto alternam. Documentos/carta verde/morada e simulações ficam com as duas pessoas.

const PESSOAS = {
  sinistros: ["Ana Inácio", "Ruben Matos"],
  documentos: ["Vânia Rodrigues", "Tiago Paiva"],
  simulacoes: ["Andreia Coelho", "João Martins"],
  resto: ["Marina Fernandes", "Andreia Almeida"]
};

const cursores = { sinistros: 0, resto: 0 };

export function reporCursores() {
  cursores.sinistros = 0;
  cursores.resto = 0;
}

function semAcentos(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function textoDoPedido(resultado) {
  return semAcentos([
    resultado?.resumo,
    resultado?.dados_recolhidos,
    resultado?.proximo_passo,
    resultado?.campos_em_falta,
    resultado?.produto
  ].filter(Boolean).join("\n"));
}

function eDocumentosCartaVerdeOuMorada(texto) {
  if (/carta(?:s)?(?:\s+de)?\s+verdes?/.test(texto)) return true;
  if (/(?:alter\w*|mudan\w*|mudar).{0,40}morada/.test(texto)) return true;
  if (/morada.{0,40}(?:alter|mudan|mudar)/.test(texto)) return true;
  if (/pedidos?\s+de\s+documentos?/.test(texto)) return true;
  if (/segunda via/.test(texto)) return true;
  if (/comprovativo/.test(texto)) return true;
  return false;
}

/** @returns {"sinistros" | "documentos" | "simulacoes" | "resto"} */
export function classificarPedido(resultado) {
  const categoria = String(resultado?.categoria || "").trim().toUpperCase();
  if (categoria === "SINISTRO") return "sinistros";
  if (eDocumentosCartaVerdeOuMorada(textoDoPedido(resultado))) return "documentos";
  if (categoria === "SIMULACAO") return "simulacoes";
  return "resto";
}

function modoDaFila(fila) {
  switch (fila) {
    case "sinistros":
    case "resto":
      return "round-robin";
    case "documentos":
    case "simulacoes":
      return "ambos";
    default: {
      const nunca = fila;
      throw new Error(`fila desconhecida: ${nunca}`);
    }
  }
}

/**
 * @returns {{ fila: string, modo: "round-robin" | "ambos", responsavel: string, seguidores: string[] }}
 */
export function encaminharPedido(resultado, estado = cursores) {
  const fila = classificarPedido(resultado);
  const pessoas = PESSOAS[fila];
  const modo = modoDaFila(fila);
  if (modo === "ambos") {
    return { fila, modo, responsavel: pessoas[0], seguidores: pessoas.slice(1) };
  }
  const i = estado[fila] % pessoas.length;
  estado[fila] = i + 1;
  return { fila, modo, responsavel: pessoas[i], seguidores: [] };
}
