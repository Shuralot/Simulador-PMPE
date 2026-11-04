import React from 'react';

/**
 * Renderizador de texto formatado para Leis, Súmulas e Fichas de Estudo da PMPE.
 * Transforma texto bruto / markdown em blocos estruturados:
 * - Caput destacado com badge do artigo
 * - Incisos (I -, II -) estruturados com badges em numerais romanos e indentação
 * - Parágrafos (§ 1º, Parágrafo único) destacados
 * - Alíneas (a), b)) com recuo
 * - Fichas de Informática e História com títulos, listas e atalhos formatados
 */

function formatInlineMarkdown(text) {
  if (!text) return null;

  // Substitui **termo** por <strong> e `código/atalho` por <kbd>
  const parts = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }
    if (match[2]) {
      // **negrito**
      parts.push(
        <strong key={`b-${match.index}`} className="font-bold text-slate-100">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // `atalho / código`
      parts.push(
        <kbd
          key={`k-${match.index}`}
          className="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/[0.08] text-amber-300 border border-white/[0.15] rounded-md shadow-xs"
        >
          {match[3]}
        </kbd>
      );
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return parts.length > 0 ? parts : text;
}

// Início de um novo bloco: inciso, parágrafo, alínea, título, item de lista ou artigo
const INICIO_DE_BLOCO = /^([IVXLCDM]+\s*[-–—]|§|Par[aá]grafo\s+[uú]nico|[a-z]\)|#{1,4}\s|[-*•]\s|\*{0,2}(?:Art|Artigo)\.?\s*\d)/i;

// Os textos de lei vêm quebrados em ~80 colunas: junta as linhas que continuam a frase anterior
function reflow(text) {
  const saida = [];
  for (const linha of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const anterior = saida[saida.length - 1];
    if (anterior !== undefined && !INICIO_DE_BLOCO.test(linha) && !/^#{1,4}\s/.test(anterior)) {
      saida[saida.length - 1] = `${anterior} ${linha}`;
    } else {
      saida.push(linha);
    }
  }
  return saida;
}

export default function FormattedLegalText({ text }) {
  if (!text) return null;

  const lines = reflow(text);

  // Classifica e agrupa as linhas
  const elements = [];
  let currentIncisos = [];

  const flushIncisos = () => {
    if (currentIncisos.length > 0) {
      elements.push(
        <div key={`inc-group-${elements.length}`} className="space-y-2 my-2 pl-3 sm:pl-5">
          {currentIncisos.map((inc, i) => (
            <div key={i} className="flex items-baseline gap-3">
              <span className="shrink-0 font-mono text-sm text-slate-500 min-w-8 text-right">{inc.num}</span>
              <span className="text-base text-slate-200 leading-relaxed flex-1">
                {formatInlineMarkdown(inc.content)}
              </span>
            </div>
          ))}
        </div>
      );
      currentIncisos = [];
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];

    // 1. Inciso (ex: "I - texto", "II – texto", "XXV - texto")
    const matchInciso = rawLine.match(/^([IVXLCDM]+)\s*[-–—]\s*(.*)$/i);
    if (matchInciso) {
      currentIncisos.push({
        num: matchInciso[1].toUpperCase(),
        content: matchInciso[2]
      });
      continue;
    }

    // Se a linha não é inciso, descarrega qualquer grupo de incisos acumulado
    flushIncisos();

    // 2. Parágrafo (ex: "§ 1º texto", "§ 2o texto", "Parágrafo único. texto")
    const matchParagrafo = rawLine.match(/^(§\s*\d+[º°o]?|Par[aá]grafo\s+[uú]nico\.?)\s*(.*)$/i);
    if (matchParagrafo) {
      elements.push(
        <p key={`par-${idx}`} className="my-2 text-base text-slate-200 leading-relaxed">
          <strong className="font-semibold text-slate-100 whitespace-nowrap">{matchParagrafo[1].trim()}</strong>{' '}
          {formatInlineMarkdown(matchParagrafo[2])}
        </p>
      );
      continue;
    }

    // 3. Alínea (ex: "a) texto", "b) texto")
    const matchAlinea = rawLine.match(/^([a-z])\)\s*(.*)$/i);
    if (matchAlinea) {
      elements.push(
        <div key={`ali-${idx}`} className="flex items-baseline gap-2 pl-10 sm:pl-14 py-0.5">
          <span className="shrink-0 font-mono text-sm text-slate-500">
            {matchAlinea[1].toLowerCase()})
          </span>
          <span className="text-base text-slate-300 leading-relaxed flex-1">
            {formatInlineMarkdown(matchAlinea[2])}
          </span>
        </div>
      );
      continue;
    }

    // 4. Cabeçalho de Ficha / Markdown (ex: "## Título", "### Subtítulo")
    const matchHeader = rawLine.match(/^(#{1,4})\s+(.*)$/);
    if (matchHeader) {
      const nivel = matchHeader[1].length;
      elements.push(
        <div
          key={`hdr-${idx}`}
          className={`font-bold text-slate-100 mt-3 mb-1.5 flex items-center gap-2 ${
            nivel <= 2 ? 'text-sm sm:text-base text-indigo-300' : 'text-xs sm:text-sm text-slate-200'
          }`}
        >
          <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full" />
          <span>{formatInlineMarkdown(matchHeader[2])}</span>
        </div>
      );
      continue;
    }

    // 5. Item de lista com bullet (ex: "- Item", "* Item")
    const matchBullet = rawLine.match(/^[-*•]\s+(.*)$/);
    if (matchBullet) {
      elements.push(
        <div key={`bul-${idx}`} className="flex items-start gap-2.5 pl-2 sm:pl-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
          <span className="text-xs sm:text-sm text-slate-200 leading-relaxed flex-1">
            {formatInlineMarkdown(matchBullet[1])}
          </span>
        </div>
      );
      continue;
    }

    // 6. Caput ou Artigo no início da linha (ex: "**Art. 5º** Todos são iguais..." ou "Art. 144. A segurança...")
    const matchArtigo = rawLine.match(/^(\*{0,2}(?:Art|Artigo)\.?\s*\d+[º°o]?\*{0,2}\.?)\s*(.*)$/i);
    if (matchArtigo) {
      const artLabel = matchArtigo[1].replace(/\*/g, '').trim();
      const caputResto = matchArtigo[2].trim();

      elements.push(
        <p key={`art-${idx}`} className="mb-2 text-base text-slate-100 leading-relaxed">
          <strong className="font-semibold text-indigo-300">{artLabel}</strong>{' '}
          {caputResto && formatInlineMarkdown(caputResto)}
        </p>
      );
      continue;
    }

    // 7. Linha normal / parágrafo de texto
    elements.push(
      <p key={`txt-${idx}`} className="text-base text-slate-200 leading-relaxed my-1">
        {formatInlineMarkdown(rawLine)}
      </p>
    );
  }

  flushIncisos();

  return <div className="space-y-1">{elements}</div>;
}
