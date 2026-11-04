import React from 'react';

/**
 * Parser e formatador minimalista de enunciados para questões de concurso.
 * Mantém o texto como um fluxo natural, sem cards pesados, sem caixas artificiais:
 * - Assertivas Romanas (I, II, III, IV): itens limpos com numerais destacados
 * - Assertivas Verdadeiro/Falso ( ): fluxo natural sem caixas
 * - Comando da questão: parágrafo de fechamento claro
 */

function parseQuestionEnunciado(text) {
  if (!text || typeof text !== 'string') {
    return { type: 'plain', paragraphs: [] };
  }

  const clean = text.trim();

  // 1. Assertivas Romanas (I, II, III, IV, V, VI, etc.)
  const romanRegex = /(?:^|\s|\n)(I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[.\-–—)]\s+/g;
  const romanMatches = [...clean.matchAll(romanRegex)];

  if (romanMatches.length >= 2) {
    const intro = clean.substring(0, romanMatches[0].index).trim();
    const items = [];

    for (let i = 0; i < romanMatches.length; i++) {
      const match = romanMatches[i];
      const start = match.index + match[0].length;
      const end = i < romanMatches.length - 1 ? romanMatches[i + 1].index : clean.length;
      items.push({
        marker: match[1].toUpperCase(),
        content: clean.substring(start, end).trim()
      });
    }

    let conclusion = '';
    const last = items[items.length - 1];
    const cmdRegex = /(?<=[.!?\n])\s+((?:Analise|Assinale|Julgue|Verifique|Está|Estão|É correto|São corretas?|Marque|Quais|Considerando|Dadas?|A respeito|Nesse sentido|Quanto às?|Diante|Em relação).*)$/is;
    const cmdMatch = last.content.match(cmdRegex);
    if (cmdMatch) {
      last.content = last.content.substring(0, cmdMatch.index).trim();
      conclusion = cmdMatch[1].trim();
    }

    return { type: 'roman', intro, items, conclusion };
  }

  // 2. Assertivas Verdadeiro / Falso: ( )
  const vfRegex = /(?:^|\s|\n)\(\s*\)\s+/g;
  const vfMatches = [...clean.matchAll(vfRegex)];

  if (vfMatches.length >= 2) {
    const intro = clean.substring(0, vfMatches[0].index).trim();
    const items = [];

    for (let i = 0; i < vfMatches.length; i++) {
      const match = vfMatches[i];
      const start = match.index + match[0].length;
      const end = i < vfMatches.length - 1 ? vfMatches[i + 1].index : clean.length;
      items.push({
        marker: '( )',
        content: clean.substring(start, end).trim()
      });
    }

    let conclusion = '';
    const last = items[items.length - 1];
    const cmdRegex = /(?<=[.!?\n])\s+((?:Analise|Assinale|Julgue|Verifique|Está|Estão|É correto|São corretas?|Marque|A sequência).*)$/is;
    const cmdMatch = last.content.match(cmdRegex);
    if (cmdMatch) {
      last.content = last.content.substring(0, cmdMatch.index).trim();
      conclusion = cmdMatch[1].trim();
    }

    return { type: 'vf', intro, items, conclusion };
  }

  // 3. Assertivas Numeradas (1., 2., 3.)
  const numRegex = /(?:^|\s|\n)(\d{1,2})\s*[.\-–—)]\s+/g;
  const numMatches = [...clean.matchAll(numRegex)];

  if (numMatches.length >= 2 && numMatches[0][1] === '1') {
    const intro = clean.substring(0, numMatches[0].index).trim();
    const items = [];

    for (let i = 0; i < numMatches.length; i++) {
      const match = numMatches[i];
      const start = match.index + match[0].length;
      const end = i < numMatches.length - 1 ? numMatches[i + 1].index : clean.length;
      items.push({
        marker: match[1] + '.',
        content: clean.substring(start, end).trim()
      });
    }

    let conclusion = '';
    const last = items[items.length - 1];
    const cmdRegex = /(?<=[.!?\n])\s+((?:Analise|Assinale|Julgue|Verifique|Está|Estão|É correto|São corretas?|Marque).*)$/is;
    const cmdMatch = last.content.match(cmdRegex);
    if (cmdMatch) {
      last.content = last.content.substring(0, cmdMatch.index).trim();
      conclusion = cmdMatch[1].trim();
    }

    return { type: 'numbered', intro, items, conclusion };
  }

  // 4. Parágrafos comuns
  const paragraphs = clean.split(/\n{2,}|\n/).map(p => p.trim()).filter(Boolean);
  return { type: 'plain', paragraphs };
}

export default function FormattedQuestionText({ text }) {
  if (!text) return null;

  const parsed = parseQuestionEnunciado(text);

  // Assertivas Romanas
  if (parsed.type === 'roman') {
    return (
      <div className="space-y-3.5 mb-7 text-base sm:text-lg lg:text-xl text-slate-100 leading-relaxed sm:leading-loose">
        {parsed.intro && (
          <p className="font-normal">{parsed.intro}</p>
        )}

        <div className="space-y-2.5 my-3 pl-1 sm:pl-2">
          {parsed.items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5">
              <span className="font-bold text-indigo-400 font-mono shrink-0 select-none">
                {item.marker}.
              </span>
              <span className="flex-1">{item.content}</span>
            </div>
          ))}
        </div>

        {parsed.conclusion && (
          <p className="font-medium text-slate-100 pt-1">{parsed.conclusion}</p>
        )}
      </div>
    );
  }

  // Assertivas Verdadeiro / Falso ( )
  if (parsed.type === 'vf') {
    return (
      <div className="space-y-3.5 mb-7 text-base sm:text-lg lg:text-xl text-slate-100 leading-relaxed sm:leading-loose">
        {parsed.intro && (
          <p className="font-normal">{parsed.intro}</p>
        )}

        <div className="space-y-2.5 my-3 pl-1 sm:pl-2">
          {parsed.items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5">
              <span className="font-mono text-slate-400 font-bold shrink-0 select-none">
                (&nbsp;&nbsp;)
              </span>
              <span className="flex-1">{item.content}</span>
            </div>
          ))}
        </div>

        {parsed.conclusion && (
          <p className="font-medium text-slate-100 pt-1">{parsed.conclusion}</p>
        )}
      </div>
    );
  }

  // Assertivas Numeradas (1., 2., 3.)
  if (parsed.type === 'numbered') {
    return (
      <div className="space-y-3.5 mb-7 text-base sm:text-lg lg:text-xl text-slate-100 leading-relaxed sm:leading-loose">
        {parsed.intro && (
          <p className="font-normal">{parsed.intro}</p>
        )}

        <div className="space-y-2.5 my-3 pl-1 sm:pl-2">
          {parsed.items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5">
              <span className="font-bold text-indigo-400 font-mono shrink-0 select-none">
                {item.marker}
              </span>
              <span className="flex-1">{item.content}</span>
            </div>
          ))}
        </div>

        {parsed.conclusion && (
          <p className="font-medium text-slate-100 pt-1">{parsed.conclusion}</p>
        )}
      </div>
    );
  }

  // Enunciado Comum em Parágrafos
  return (
    <div className="space-y-4 mb-7 text-base sm:text-lg lg:text-xl text-slate-100 leading-relaxed sm:leading-loose">
      {parsed.paragraphs.map((p, idx) => (
        <p key={idx}>{p}</p>
      ))}
    </div>
  );
}
