// Número de contacto do cliente.
//
// O número que vem no cabeçalho SIP "From" é dado da rede: não passa pelo modelo,
// não passa pela transcrição e não se degrada com ruído na linha. O número que sai
// da extração passa pelas duas coisas — na chamada de 14/09 a Alice leu "sessenta e
// quatro, vinte" em vez de dígito a dígito e a extração perdeu um zero (92642327 em
// vez de 926420327). Por isso a regra é: vale o número de origem, e só cede a um
// número ditado na chamada quando esse for um número português completo e diferente.

const PT_NACIONAL = /^[2-9]\d{8}$/;

/** Reduz um valor a um número nacional português, ou "" se não for um. */
export function normalizarTelefonePt(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  // Só tiramos o indicativo quando há dígitos a mais: nenhum número nacional começa por 351.
  const nacional = digitos.length > 9 ? digitos.replace(/^(?:00)?351/, "") : digitos;
  return PT_NACIONAL.test(nacional) ? nacional : "";
}

/** Número de quem liga, a partir do cabeçalho SIP From. */
export function numeroDeOrigem(cabecalhoFrom) {
  const s = String(cabecalhoFrom ?? "");
  // '"+351917318234" <sip:+351917318234@sip.telnyx.eu>;tag=abc' — a parte de utilizador
  // do URI é a fonte fiável; o nome de apresentação é livre e pode vir com texto.
  const uri = s.match(/sips?:([^@;>\s]+)/i);
  return normalizarTelefonePt(uri ? uri[1] : s);
}

/**
 * Decide o telefone de contacto a registar.
 * Devolve { telefone, origem, porConfirmar }.
 */
export function telefoneDeContacto(extraido, cabecalhoOrigem) {
  const origem = numeroDeOrigem(cabecalhoOrigem);
  const ditado = normalizarTelefonePt(extraido);
  const bruto = String(extraido ?? "").trim();

  // Foi partilhado um número diferente durante a chamada: é esse que o cliente quer.
  if (ditado && ditado !== origem) return { telefone: ditado, origem, porConfirmar: "" };

  if (origem) {
    // Disseram alguma coisa que não chegou a ser um número válido (dígito perdido,
    // transcrição partida): registamos o da rede e deixamos o dito para o consultor ver.
    const porConfirmar = !ditado && bruto ? `telefone dito na chamada (não confirmado): ${bruto}` : "";
    return { telefone: origem, origem, porConfirmar };
  }

  // Sem origem (chamada pelo browser): fica o que a extração deu, tal como antes.
  return { telefone: ditado || bruto, origem: "", porConfirmar: "" };
}

/** Acerta a entrada "telefone: ..." dentro de 'campo: valor; campo: valor'. */
export function corrigirTelefoneEmDados(dados, telefone) {
  const s = String(dados ?? "");
  if (!s || !telefone) return s;
  return s.replace(/(^|;\s*)(telefone\s*:\s*)([^;]*)/i, (m, sep, rotulo) => `${sep}${rotulo}${telefone}`);
}

/** Junta um aviso a um campo de texto já existente, sem duplicar separadores. */
export function juntarCampo(atual, aviso) {
  return [String(atual ?? "").trim(), String(aviso ?? "").trim()].filter(Boolean).join("; ");
}
