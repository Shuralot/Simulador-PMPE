// Validação estrutural de questões geradas por IA (compartilhada entre navegador e servidor)
const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const PROIBIDAS = /\b(todas as anteriores|nenhuma das anteriores|nenhuma das alternativas|todas as alternativas)\b/i;

function norm(s) {
  // mantém os acentos: em questões de crase/acentuação, "à" e "a" são alternativas diferentes
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function alternativasComoMapa(alts) {
  const mapa = {};
  if (Array.isArray(alts)) {
    for (const a of alts) mapa[String(a.letra || '').trim().toUpperCase()] = String(a.texto || '').trim();
  } else if (alts && typeof alts === 'object') {
    for (const k of Object.keys(alts)) mapa[k.trim().toUpperCase()] = String(alts[k] || '').trim();
  }
  return mapa;
}

export function validarQuestao(q) {
  const erros = [];
  const avisos = [];
  const enunciado = String(q?.enunciado || '').trim();
  if (enunciado.length < 20) erros.push('Enunciado ausente ou curto demais.');

  const mapa = alternativasComoMapa(q?.alternativas);
  const letras = Object.keys(mapa);
  if (letras.length !== 5 || !LETRAS.every((l) => mapa[l])) {
    erros.push('A questão precisa ter exatamente 5 alternativas (A–E) preenchidas.');
  } else {
    const textos = LETRAS.map((l) => norm(mapa[l]));
    if (new Set(textos).size !== 5) erros.push('Há alternativas com texto repetido.');
    if (LETRAS.some((l) => PROIBIDAS.test(mapa[l]))) erros.push('Alternativa do tipo "todas/nenhuma das anteriores" é proibida.');
  }

  const gabarito = String(q?.gabarito || '').trim().toUpperCase();
  if (!LETRAS.includes(gabarito)) erros.push('Gabarito ausente ou inválido.');

  const correta = String(q?.explicacao?.correta || '').trim();
  if (correta.length < 20) erros.push('Explicação da alternativa correta ausente.');

  const distratores = q?.explicacao?.distratores && typeof q.explicacao.distratores === 'object' ? q.explicacao.distratores : {};
  const faltando = LETRAS.filter((l) => l !== gabarito && !String(distratores[l] || '').trim());
  if (faltando.length > 0) avisos.push(`Sem justificativa para: ${faltando.join(', ')}.`);

  if (/anterior|abaixo|acima/.test(norm(enunciado)) && /texto|trecho/.test(norm(enunciado)) && !q?.textoBase && !q?.texto_base && enunciado.length < 200) {
    avisos.push('Referencia um texto que não foi fornecido.');
  }

  return { ok: erros.length === 0, erros, avisos };
}
