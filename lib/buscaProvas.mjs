import { tokenizar } from './texto.mjs';

// O stemmer só trata plurais; aqui também aproxima gênero (facultativa/facultativo) tirando a vogal final
const radicais = (texto) => tokenizar(texto).map((w) => (w.length > 4 ? w.replace(/[aeo]$/, '') : w));

function textoDasAlternativas(alternativas) {
  if (!alternativas) return '';
  if (Array.isArray(alternativas)) return alternativas.map((a) => a.texto || '').join(' ');
  return Object.values(alternativas).join(' ');
}

/**
 * Busca questões de prova que falam do que foi digitado, olhando enunciado, alternativas e texto-base.
 * Só devolve questões que contêm ao menos metade dos termos buscados (ordem: mais termos, depois termos no enunciado).
 * Substitui a busca vetorial antiga, que devolvia questões sem relação alguma quando a pontuação era zero.
 */
export function buscarQuestoesParecidas(query, candidatas, limite = 6) {
  const termos = [...new Set(radicais(query))];
  if (termos.length === 0) return [];
  const minimo = Math.max(1, Math.ceil(termos.length / 2));

  const pontuadas = [];
  for (const q of candidatas) {
    let alternativas = q.alternativas;
    if (alternativas === undefined && q.alternativas_json) {
      try { alternativas = JSON.parse(q.alternativas_json); } catch { alternativas = null; }
    }
    const noEnunciado = new Set(radicais(q.enunciado || ''));
    const noResto = new Set(radicais(`${textoDasAlternativas(alternativas)} ${q.texto_base || ''}`));
    let achados = 0;
    let achadosNoEnunciado = 0;
    for (const t of termos) {
      if (noEnunciado.has(t)) { achados++; achadosNoEnunciado++; }
      else if (noResto.has(t)) achados++;
    }
    if (achados >= minimo) {
      pontuadas.push({ q, alternativas, relevancia: Math.round((achados / termos.length) * 100) / 100, achadosNoEnunciado });
    }
  }

  return pontuadas
    .sort((a, b) => b.relevancia - a.relevancia || b.achadosNoEnunciado - a.achadosNoEnunciado)
    .slice(0, limite);
}
