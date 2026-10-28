import crypto from 'node:crypto';

export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashEnunciado(enunciado) {
  return crypto.createHash('sha256').update(normalizeText(enunciado)).digest('hex').substring(0, 32);
}

export const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para',
  'com', 'como', 'que', 'se', 'e', 'ou', 'mas', 'ao', 'aos', 'sua', 'seu', 'suas',
  'seus', 'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele',
  'aquela', 'aqueles', 'aquelas', 'isso', 'isto', 'aquilo', 'sobre', 'entre', 'apos',
  'ate', 'sem', 'sob', 'ante', 'contra', 'desde', 'durante', 'mediante', 'conforme',
  'segundo', 'assinale', 'alternativa', 'correta', 'incorreta', 'texto', 'abaixo',
  'apresenta', 'acordo', 'seguinte', 'trecho', 'termo', 'palavra', 'quanto', 'qual',
  'tipo', 'pagina', 'instituto', 'aocp', 'policia', 'militar', 'soldado'
]);

// Stemming leve para o português: plurais e terminações mais comuns
export function stemPt(w) {
  if (w.length > 5 && /(oes|aes|aos)$/.test(w)) return w.slice(0, -3) + 'ao';
  if (w.length > 5 && w.endsWith('is')) return w.slice(0, -2) + 'l';
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function tokenizar(text) {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map(stemPt);
}

export function computeTFVector(text) {
  const words = tokenizar(text);
  if (words.length === 0) return {};
  const tf = {};
  for (const w of words) tf[w] = (tf[w] || 0) + 1;
  let sumSq = 0;
  for (const t in tf) sumSq += tf[t] * tf[t];
  const mag = Math.sqrt(sumSq);
  if (mag > 0) for (const t in tf) tf[t] = Number((tf[t] / mag).toFixed(4));
  return tf;
}

export function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) return 0;
  let dot = 0;
  for (const t in vecA) if (vecB[t]) dot += vecA[t] * vecB[t];
  return Math.min(1, Math.max(0, dot));
}

const cacheVetores = new Map();
export function vetorDe(candidato) {
  const chave = candidato.vetor_json || null;
  if (chave) {
    let v = cacheVetores.get(chave);
    if (!v) {
      try { v = JSON.parse(chave); } catch { v = computeTFVector(candidato.enunciado); }
      if (cacheVetores.size > 5000) cacheVetores.clear();
      cacheVetores.set(chave, v);
    }
    return v;
  }
  return computeTFVector(`${candidato.enunciado || ''} ${candidato.texto || ''}`);
}

// Índice de frequência de documentos de TODO o corpus (provas + banco + base legal), não só dos candidatos filtrados
export function construirIdf(vetores) {
  const df = {};
  for (const v of vetores) for (const t in v) df[t] = (df[t] || 0) + 1;
  const N = Math.max(1, vetores.length);
  return (term) => {
    const d = df[term] || 0;
    return Math.log(1 + (N - d + 0.5) / (d + 0.5));
  };
}

// Cosseno + IDF global, seguido de MMR para diversidade
export function rankCandidates(queryText, candidates, maxItems = 6, idfFn = null) {
  if (!candidates || candidates.length === 0) return [];
  const queryVec = computeTFVector(queryText);
  const queryTerms = Object.keys(queryVec);
  const parsed = candidates.map((q) => ({ q, qVec: vetorDe(q) }));

  const idf = idfFn || construirIdf(parsed.map((p) => p.qVec));
  let idfMax = 0;
  for (const t of queryTerms) idfMax += queryVec[t] * queryVec[t] * idf(t);

  const scored = parsed.map(({ q, qVec }) => {
    const cos = calculateCosineSimilarity(queryVec, qVec);
    let idfScore = 0;
    for (const t of queryTerms) if (qVec[t]) idfScore += qVec[t] * queryVec[t] * idf(t);
    const norm = idfMax > 0 ? Math.min(1, idfScore / idfMax) : 0;
    const score = queryTerms.length > 0 ? cos * 0.5 + norm * 0.5 : 0.1;
    return { q, qVec, cosseno: Number(score.toFixed(4)) };
  });
  scored.sort((a, b) => b.cosseno - a.cosseno);

  const selected = [];
  const pool = [...scored];
  while (selected.length < maxItems && pool.length > 0) {
    if (selected.length === 0) { selected.push(pool.shift()); continue; }
    let bestIdx = 0;
    let bestMmr = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      let maxSim = 0;
      for (const sel of selected) {
        const sim = calculateCosineSimilarity(pool[i].qVec, sel.qVec);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = 0.7 * pool[i].cosseno - 0.3 * maxSim;
      if (mmr > bestMmr) { bestMmr = mmr; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected;
}

// Similaridade entre enunciados para detectar quase-duplicatas (cosseno dos vetores TF)
export function similaridadeTextual(a, b) {
  return calculateCosineSimilarity(computeTFVector(a), computeTFVector(b));
}
