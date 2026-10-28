export const TEMA_STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
  'por', 'para', 'com', 'sem', 'sob', 'sobre', 'ate', 'entre', 'contra', 'desde',
  'que', 'se', 'ao', 'aos', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'ou',
  'cf', 'cf88', 'constituicao', 'federal', 'lei', 'decreto', 'estatuto', 'codigo',
  'art', 'arts', 'artigo', 'artigos', 'inciso', 'incisos', 'paragrafo', 'caput',
  'n', 'no', 'nr', 'numero'
]);

export function normalizeTemaStr(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°ª]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTemaQuery(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return { hasFilter: false, groups: [] };

  const segments = raw
    .split(/[,;\n]+|\s+ou\s+/i)
    .map(s => s.trim())
    .filter(Boolean);

  const groups = [];

  for (const seg of segments) {
    const norm = normalizeTemaStr(seg);
    if (!norm) continue;

    const articles = new Set();
    let working = norm;

    const rangeRegex = /\b(?:art(?:igos?|s)?\.?\s*)?(\d{1,3})\s*(?:a|ate|-|–)\s*(\d{1,3})\b/g;
    working = working.replace(rangeRegex, (_, a, b) => {
      const start = parseInt(a, 10);
      const end = parseInt(b, 10);
      if (start > 0 && end >= start && end - start <= 30) {
        for (let i = start; i <= end; i++) articles.add(String(i));
      } else {
        articles.add(String(start));
        articles.add(String(end));
      }
      return ' ';
    });

    const singleArtRegex = /\bart(?:igos?|s)?\.?\s*(\d{1,3})\b/g;
    working = working.replace(singleArtRegex, (_, num) => {
      articles.add(String(parseInt(num, 10)));
      return ' ';
    });

    if (articles.size > 0) {
      const listAfterArt = /\b(\d{1,3})\b/g;
      let m;
      while ((m = listAfterArt.exec(working)) !== null) {
        const val = parseInt(m[1], 10);
        if (val > 0 && val <= 250) {
          articles.add(String(val));
        }
      }
      working = working.replace(/\b\d{1,3}\b/g, ' ');
    }

    const tokens = working
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2 && !TEMA_STOPWORDS.has(t));

    if (articles.size > 0 || tokens.length > 0) {
      groups.push({
        raw: seg,
        articles: Array.from(articles),
        tokens
      });
    }
  }

  return {
    hasFilter: groups.length > 0,
    groups
  };
}

export function matchQuestionByTema(parsedQuery, fields) {
  if (!parsedQuery || !parsedQuery.hasFilter) return true;

  const combinedRaw = [
    fields.assunto || '',
    fields.enunciado || '',
    fields.explicacao || '',
    fields.disciplina || ''
  ].join(' ');

  const normText = normalizeTemaStr(combinedRaw);

  return parsedQuery.groups.some(group => {
    if (group.articles.length > 0) {
      const hasAnyArticle = group.articles.some(artNum => {
        const re = new RegExp(
          `\\bart(?:igos?|s)?\\.?\\s*(?:\\d{1,3}\\s*(?:,\\s*|e\\s*))*0*${artNum}\\b`,
          'i'
        );
        return re.test(normText);
      });
      if (!hasAnyArticle) return false;
    }

    if (group.tokens.length > 0) {
      const allTokensMatch = group.tokens.every(tok => normText.includes(tok));
      if (!allTokensMatch) return false;
    }

    return true;
  });
}

export function buildTemaMatcher(rawInput) {
  const parsed = parseTemaQuery(rawInput);
  const vazio = !parsed.hasFilter;
  return {
    vazio,
    hasFilter: parsed.hasFilter,
    parsed,
    matches: (fields) => matchQuestionByTema(parsed, fields),
    match: (text) => matchQuestionByTema(parsed, { enunciado: text || '' })
  };
}
