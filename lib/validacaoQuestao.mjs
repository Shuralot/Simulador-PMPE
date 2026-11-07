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

// Confere por código se a fonte legal citada pela IA é um dispositivo que estava nos trechos fornecidos.
// Sem trecho de apoio (Português, Raciocínio etc.) não há o que conferir: devolve { ok: true, conferida: false }.
export function conferirFonteLegal(q, trecho) {
  if (!trecho) return { ok: true, conferida: false };
  const fonte = String(q?.fonteLegal || '').trim();
  if (!fonte) return { ok: false, conferida: false, motivo: 'Questão de base normativa sem fonteLegal.' };

  const ref = String(trecho.referencia || '');
  const mSum = ref.match(/S[úu]mula(?:\s+Vinculante)?\s*(\d+)/i);
  const mArt = ref.match(/Art\.?\s*(\d+)/i);
  // tira "nº 8.069/1990" e anos para não confundir número de lei com número de artigo
  const limpa = fonte.replace(/n[º°o]?\.?\s*\d[\d.]*(?:\/\d{2,4})?/gi, ' ').replace(/\b\d{1,2}\.\d{3}\b/g, ' ').replace(/\/\d{2,4}/g, ' ');
  const numeros = new Set((limpa.match(/\d+/g) || []).map((n) => String(Number(n))));

  const alvo = mSum ? String(Number(mSum[1])) : (mArt ? String(Number(mArt[1])) : null);
  if (alvo === null) return { ok: true, conferida: true }; // trecho sem artigo numerado (ficha): basta ter citado fonte
  if (numeros.has(alvo)) return { ok: true, conferida: true };
  return { ok: false, conferida: false, motivo: `fonteLegal ("${fonte}") não corresponde ao trecho fornecido (${ref}).` };
}
