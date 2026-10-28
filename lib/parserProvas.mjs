import { normalizeText, computeTFVector } from './texto.mjs';
import { classificarTopico } from './taxonomia.mjs';

export function sanitizeExtractedText(str) {
  if (!str) return '';
  return str
    .replace(/(\w)[ \t]+-[ \t]*(\w)/g, '$1-$2')
    .replace(/\bcujos s entidos\b/gi, 'cujos sentidos')
    .replace(/\bd e\b/g, 'de')
    .replace(/\bum a to\b/gi, 'um ato')
    .replace(/\bpr udente\b/gi, 'prudente')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mapeia o título de seção do caderno de prova para uma disciplina canônica (ou "Fora do Edital PMPE")
export function disciplinaDoCabecalho(titulo) {
  const n = normalizeText(titulo);
  if (/portugues/.test(n)) return 'Língua Portuguesa';
  if (/raciocinio logico|matematica|aritmetica/.test(n)) return 'Raciocínio Lógico-Matemático';
  if (/informatica/.test(n)) return 'Informática';
  if (/direito constitucional/.test(n)) return 'Direito Constitucional';
  if (/direitos humanos|legislacao/.test(n)) return 'Direitos Humanos e Legislação Extravagante';
  if (/historia de pernambuco/.test(n)) return 'História de Pernambuco';
  return 'Fora do Edital PMPE';
}

const CABECALHO_RE = /^[ \t]*(?:BLOCO\s+[IVX]+[ \t]*\n[ \t]*)?(Língua Portuguesa|Portugu[eê]s|Matem[aá]tica|Racioc[ií]nio L[oó]gico(?:[- ]Matem[aá]tico)?|Inform[aá]tica|No[cç][õo]es de Inform[aá]tica|Direito Constitucional|Direitos Humanos(?: e Legisla[cç][ãa]o(?: Extravagante| Penal Especial)?)?|Legisla[cç][ãa]o(?: Extravagante| Penal Especial| Institucional)?|Hist[oó]ria(?: de Pernambuco| do Brasil| Geral)?|Conhecimentos Gerais|Conhecimentos Espec[ií]ficos|Atualidades|Geografia(?: de Pernambuco| do Brasil| Geral)?|Ingl[eê]s|Direito Administrativo|Direito Penal(?: Militar)?|Direito Processual(?: Penal| Penal Militar)?|Criminologia|Medicina Legal|Contabilidade|Aritm[eé]tica)[ \t]*$/gim;

export function detectarCabecalhos(texto) {
  const lista = [];
  let m;
  const re = new RegExp(CABECALHO_RE.source, CABECALHO_RE.flags);
  while ((m = re.exec(texto)) !== null) {
    lista.push({ index: m.index, fim: m.index + m[0].length, titulo: m[1].trim(), disciplina: disciplinaDoCabecalho(m[1]) });
  }
  return lista;
}

// Provas já conhecidas usam faixas de numeração; as demais usam cabeçalhos de seção e, por último, vocabulário
export function classificarPorFaixa(num, provaNome) {
  if (provaNome.includes('PMPE')) {
    if (num <= 10) return 'Língua Portuguesa';
    if (num <= 20) return 'História de Pernambuco';
    if (num <= 30) return 'Raciocínio Lógico-Matemático';
    if (num <= 40) return 'Informática';
    if (num <= 50) return 'Direito Constitucional';
    return 'Direitos Humanos e Legislação Extravagante';
  }
  if (provaNome.includes('PMDF')) {
    if (num >= 1 && num <= 10) return 'Língua Portuguesa';
    if (num >= 15 && num <= 22) return 'Raciocínio Lógico-Matemático';
    if (num >= 41 && num <= 46) return 'Direito Constitucional';
    if ((num >= 47 && num <= 52) || (num >= 65 && num <= 70) || num === 80) return 'Direitos Humanos e Legislação Extravagante';
    return 'Fora do Edital PMPE';
  }
  if (provaNome.includes('PC-GO') || provaNome.includes('PCGO')) {
    if (num >= 1 && num <= 10) return 'Língua Portuguesa';
    if (num >= 15 && num <= 19) return 'Raciocínio Lógico-Matemático';
    if ((num >= 26 && num <= 32) || [35, 45, 50, 53].includes(num)) return 'Direito Constitucional';
    if ([55, 56, 57, 58, 59, 62, 63, 64].includes(num)) return 'Direitos Humanos e Legislação Extravagante';
    return 'Fora do Edital PMPE';
  }
  return null;
}

export function classificarPorVocabulario(text) {
  const lower = normalizeText(text);
  if (
    /\b(choose the correct|according to the text|read the text|in the sentence|english)\b/.test(lower) ||
    /\b(caatinga|cerrado|pampa|bioma|vegetacao|relevo|goias|distrito federal|lei federal n 6 450|estatuto dos policiais militares da pmdf)\b/.test(lower) ||
    /\b(improbidade administrativa|poder disciplinar|poder hierarquico|poder de policia|licitacao|inquerito policial|delegado de policia|perdao judicial|indulto)\b/.test(lower)
  ) return 'Fora do Edital PMPE';
  if (/\b(proposicao|proposicoes|negacao|equivalencia logica|probabilidade|combinatoria|sequencia|tabela verdade|diagrama|porcentagem|se entao)\b/.test(lower)) return 'Raciocínio Lógico-Matemático';
  if (/\b(windows|excel|word|libreoffice|calc|writer|navegador|malware|phishing|firewall|criptografia|atalho|tecla|planilha|rede|internet|computador|hardware|software|linux|backup)\b/.test(lower)) return 'Informática';
  if (/\b(tortura|abuso de autoridade|maria da penha|drogas|crimes hediondos|direitos humanos|pacto de san jose|declaracao universal|estatuto dos militares|6 783)\b/.test(lower)) return 'Direitos Humanos e Legislação Extravagante';
  if (/\b(constituicao federal|direitos e garantias fundamentais|art 5|art 144|habeas corpus|mandado de seguranca|nacionalidade|seguranca publica|competencia privativa|estado de defesa|estado de sitio)\b/.test(lower)) return 'Direito Constitucional';
  if (/\b(pernambuco|olinda|recife|duarte coelho|nassau|holandeses|mascates|1817|confederacao do equador|praieira|cabanos|frevo|maracatu)\b/.test(lower)) return 'História de Pernambuco';
  if (/\b(crase|pontuacao|virgula|concordancia|regencia|acentuacao|ortografia|conectivo|conjuncao|pronome|verbo|sujeito|predicado|reescrita|excerto|texto|sentido)\b/.test(lower)) return 'Língua Portuguesa';
  return 'Conhecimentos Gerais';
}

export function trimAlternativeTail(str) {
  return String(str || '')
    .replace(/-{10,}[\s\S]*$/, '')
    .replace(/\s*Instruções para (?:Redação|Discursiva)[\s\S]*$/i, '')
    .replace(/\s*(?:BLOCO\s+[IVX]+\s*)?(?:No[çc][õo]es de\s+)?(?:Língua Portuguesa|História de Pernambuco|Raciocínio Lógico(?:-Matemático)?|Informática|Direito Constitucional|Direitos Humanos(?: e Legislação(?: Extravagante)?)?|Legislação(?: Extravagante)?)\s*$/i, '')
    .replace(/\s*BLOCO\s+[IVX]+\s*$/i, '')
    .trim();
}

export function enunciadoDependeDeTexto(enunciado) {
  if (String(enunciado || '').length > 250) return false;
  const n = normalizeText(enunciado);
  return /\b(no|do|ao|pelo|segundo o|de acordo com o|conforme o) (texto|trecho|excerto|fragmento|poema|charge|tirinha|grafico|quadro|figura|imagem|infografico)\b/.test(n)
    || /\b(texto|trecho|excerto|fragmento|poema|charge|tirinha|grafico|quadro|figura|imagem|infografico) (acima|abaixo|a seguir|anterior|apresentado|apresentada)\b/.test(n);
}

// Questões que só fazem sentido com uma imagem (que a extração de texto do PDF não captura)
export function enunciadoDependeDeFigura(enunciado) {
  if (String(enunciado || '').length > 300) return false;
  const n = normalizeText(enunciado);
  return /\b(figura|imagem|grafico|charge|tirinha|infografico|mapa|fluxograma|organograma)\b ?(acima|abaixo|a seguir|anterior|apresentad[ao]|ilustrad[ao]|mostrad[ao])/.test(n)
    || /\b(observe|analise|considere|veja) (a|o|as|os) (seguinte )?(figura|imagem|grafico|charge|tirinha|mapa|fluxograma)\b/.test(n);
}

// Se o texto perdeu as quebras de linha (PDF antigo ou outro leitor), recria uma quebra antes de cada "QUESTÃO N"
function garantirQuebras(raw) {
  const quebras = (raw.match(/\n/g) || []).length;
  if (quebras >= 30) return raw;
  return raw.replace(/\s(QUEST[ÃA]O\s+\d{1,3})\s/gi, '\n$1\n');
}

// Remove cabeçalhos e rodapés que se repetem em várias páginas (ex.: "Polícia Civil ... Tipo 01 – Página 14")
export function removerCabecalhosRodapes(texto) {
  const paginas = texto.split(/\n--- PÁGINA \d+ ---\n/);
  if (paginas.length < 4) return texto;
  const normaliza = (l) => l.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const contagem = new Map();
  for (const p of paginas) {
    const vistas = new Set(p.split('\n').map(normaliza).filter((l) => l.length >= 8));
    for (const l of vistas) contagem.set(l, (contagem.get(l) || 0) + 1);
  }
  const minimo = Math.max(3, Math.floor(paginas.length * 0.4));
  const repetidas = new Set([...contagem].filter(([l, n]) => n >= minimo && !/^(QUESTÃO|\(?[A-E]\)|#$)/i.test(l)).map(([l]) => l));
  if (repetidas.size === 0) return texto;
  return texto
    .split('\n')
    .filter((l) => !repetidas.has(normaliza(l)))
    .join('\n');
}

const SO_LETRAS = /[^a-zà-úç]/gi;

// Vocabulário (contagem de palavras) para consertar palavras partidas pelo PDF ("convert er", "revist a")
export function construirVocabulario(textos) {
  const vocab = new Map();
  for (const t of textos) {
    for (const tok of String(t).split(/\s+/)) {
      if (/-$/.test(tok) || /^-/.test(tok)) continue;
      const w = tok.toLowerCase().replace(SO_LETRAS, '');
      if (w) vocab.set(w, (vocab.get(w) || 0) + 1);
    }
  }
  return vocab;
}

export function repararPalavrasPartidas(texto, vocab) {
  if (!texto || !vocab) return texto;
  const toks = texto.split(' ');
  const saida = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i];
    const b = toks[i + 1];
    if (b !== undefined && /^[a-zà-úç]{4,}$/i.test(a) && /^[a-zà-úç]{1,3}$/.test(b)) {
      const wa = a.toLowerCase();
      const juntada = wa + b;
      if ((vocab.get(juntada) || 0) >= 1 && (vocab.get(wa) || 0) <= 2) {
        saida.push(a + b);
        i++;
        continue;
      }
    }
    saida.push(a);
  }
  return saida.join(' ');
}

export function extractQuestionsFromExam(rawTextEntrada, provaNome, opcoes = {}) {
  const rawText = removerCabecalhosRodapes(garantirQuebras(rawTextEntrada || ''));
  const vocab = construirVocabulario([rawText]);
  if (opcoes.vocab) for (const [k, v] of opcoes.vocab) vocab.set(k, (vocab.get(k) || 0) + v);
  const san = (t) => repararPalavrasPartidas(sanitizeExtractedText(t), vocab);
  const withoutCover = rawText.replace(/--- PÁGINA 1 ---[\s\S]*?(?=--- PÁGINA 2 ---)/, '');
  const cleaned = withoutCover
    .replace(/--- PÁGINA \d+ ---/g, '')
    .replace(/[A-Z\s]+INSTITUTO AOCP/gi, '')
    .replace(/SOLDADO[^\n]+Página\s+\d+/gi, '');

  const qMatches = [...cleaned.matchAll(/\n\s*(?:QUESTÃO\s+)?(\d{1,2})\s*\n/gi)];
  const questoes = [];
  const seenNumbers = new Set();
  const conhecida = classificarPorFaixa(1, provaNome) !== null;
  const cabecalhos = conhecida ? [] : detectarCabecalhos(cleaned);

  let textoBasePortugues = null;
  if (provaNome.includes('PMPE')) {
    const hdrPt = cleaned.match(/BLOCO\s+I\s*\n\s*Língua Portuguesa\s*\n/);
    const primeira = qMatches.find((m) => parseInt(m[1], 10) === 1);
    if (hdrPt && primeira && primeira.index > hdrPt.index + hdrPt[0].length) {
      const tb = san(cleaned.slice(hdrPt.index + hdrPt[0].length, primeira.index));
      if (tb.length >= 300) textoBasePortugues = tb;
    }
  } else if (provaNome.includes('PMDF')) {
    const hdrPt = cleaned.match(/Língua Portuguesa\s*\n\s*Responda as questões de 1 a 8[\s\S]*?\n/i);
    const primeira = qMatches.find((m) => parseInt(m[1], 10) === 1);
    if (hdrPt && primeira && primeira.index > hdrPt.index + hdrPt[0].length) {
      const tb = san(cleaned.slice(hdrPt.index, primeira.index));
      if (tb.length >= 300) textoBasePortugues = tb;
    }
  } else if (provaNome.includes('PC-GO') || provaNome.includes('PCGO')) {
    const primeira = qMatches.find((m) => parseInt(m[1], 10) === 1);
    if (primeira) {
      const idxStart = cleaned.indexOf('EXERCITAR A MENTE ATIVA');
      if (idxStart !== -1 && primeira.index > idxStart) {
        const tb = san(cleaned.slice(idxStart, primeira.index));
        if (tb.length >= 300) textoBasePortugues = tb;
      }
    }
  }

  // Provas desconhecidas: texto-base por seção (trecho entre o cabeçalho de Português e a 1ª questão da seção)
  const textoBasePorSecao = new Map();
  for (const cab of cabecalhos) {
    if (cab.disciplina !== 'Língua Portuguesa') continue;
    const prox = qMatches.find((m) => m.index > cab.fim);
    if (!prox) continue;
    const tb = san(cleaned.slice(cab.fim, prox.index));
    if (tb.length >= 300) textoBasePorSecao.set(cab.index, tb);
  }

  for (let i = 0; i < qMatches.length; i++) {
    const num = parseInt(qMatches[i][1], 10);
    if (num < 1 || num > 200 || seenNumbers.has(num)) continue;

    const startIdx = qMatches[i].index + qMatches[i][0].length;
    let nextIdx = cleaned.length;
    for (let j = i + 1; j < qMatches.length; j++) {
      if (parseInt(qMatches[j][1], 10) === num + 1) { nextIdx = qMatches[j].index; break; }
    }

    const qBlock = cleaned.substring(startIdx, nextIdx);
    const altAMatch = qBlock.match(/\([A]\)|\bA\)\s/);
    if (!altAMatch) continue;

    const enunciado = qBlock.substring(0, altAMatch.index).trim();
    const altBlock = qBlock.substring(altAMatch.index);
    if (/Folha de Respostas|Fraudar ou tentar fraudar/i.test(enunciado)) continue;

    const matchA = altBlock.match(/\([A]\)\s*([\s\S]*?)(?=\([B]\)|\bB\)|$)/);
    const matchB = altBlock.match(/\([B]\)\s*([\s\S]*?)(?=\([C]\)|\bC\)|$)/);
    const matchC = altBlock.match(/\([C]\)\s*([\s\S]*?)(?=\([D]\)|\bD\)|$)/);
    const matchD = altBlock.match(/\([D]\)\s*([\s\S]*?)(?=\([E]\)|\bE\)|$)/);
    const matchE = altBlock.match(/\([E]\)\s*([\s\S]*?)$/);

    if (matchA && matchB && matchC && matchD && matchE && enunciado.length > 15) {
      seenNumbers.add(num);
      const cleanEnunc = san(enunciado);
      const cleanAlts = {
        A: san(matchA[1]),
        B: san(matchB[1]),
        C: san(matchC[1]),
        D: san(matchD[1]),
        E: san(trimAlternativeTail(matchE[1]))
      };
      const fullItemText = cleanEnunc + ' ' + Object.values(cleanAlts).join(' ');

      let disciplina;
      let secaoPt = null;
      if (conhecida) {
        disciplina = classificarPorFaixa(num, provaNome);
      } else {
        const cab = [...cabecalhos].reverse().find((c) => c.index < qMatches[i].index);
        disciplina = cab ? cab.disciplina : classificarPorVocabulario(fullItemText);
        if (cab && cab.disciplina === 'Língua Portuguesa') secaoPt = cab.index;
      }

      const textoBase = disciplina === 'Língua Portuguesa'
        ? (textoBasePortugues || (secaoPt !== null ? textoBasePorSecao.get(secaoPt) : null) || null)
        : null;
      const dependeDeTexto = !textoBase && enunciadoDependeDeTexto(cleanEnunc) ? 1 : 0;
      const dependeDeFigura = enunciadoDependeDeFigura(cleanEnunc) ? 1 : 0;
      const topico = classificarTopico(disciplina, '', fullItemText);

      questoes.push({
        numero: num,
        disciplina,
        topico,
        enunciado: cleanEnunc,
        alternativas: cleanAlts,
        vetor_json: JSON.stringify(computeTFVector(fullItemText)),
        texto_base: textoBase,
        depende_de_texto: dependeDeTexto,
        depende_de_figura: dependeDeFigura
      });
    }
  }
  return questoes;
}
