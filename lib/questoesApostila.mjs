// Extrai questões de concurso coladas na apostila (texto corrido do PDF): cabeçalho "Ano/Banca/Órgão/Prova", enunciado e alternativas a)–e).

const INICIO = /(?:^|\n)[ \t]*(?:QUEST[ÕO]ES:?\s*)?(\d{1,3})\s*(?:º\)|[.\-)])\s*\(?\s*(?=Ano:|\(INSTITUTO AOCP\))/g;
// palavras com que um enunciado costuma começar (separa o cargo, que vem colado no fim do cabeçalho)
const INICIOS_ENUNCIADO = /(?:^|\s)(Considere|Assinale|Sobre|Segundo|Acerca|Com\s+rela[çc][ãa]o|No\s+que|Na\s|No\s|Em\s|A\s+respeito|Quanto|Conforme|Analise|Leia|Julgue|Tendo|Dada|Dado|De\s+acordo|Por\s+meio|Ao\s|Nos\s|Nas\s|Os\s|As\s|Um\s|Uma\s|O\s|A\s|Diante|Observe|Marque|Indique|Identifique|Em\s+rela[çc][ãa]o|Para\s|Sabe-se|Entre|Com\s|Considerando|Acerca|Pode|Qual|Quais|Quem|Diz-se|Assim|Segundo|Joana|Maria|Jo[ãa]o)/;

export function segmentarQuestoes(texto) {
  const marcas = [...texto.matchAll(INICIO)].map((m) => ({ idx: m.index, fim: m.index + m[0].length, num: Number(m[1]) }));
  return marcas.map((m, i) => ({ num: m.num, bruto: texto.slice(m.fim, i + 1 < marcas.length ? marcas[i + 1].idx : texto.length).trim() }));
}

export function separarCabecalho(bruto) {
  const h = {};
  let resto = bruto.replace(/\s+/g, ' ');
  const mAno = resto.match(/^\(?\s*(?:Ano:\s*(\d{4})\s*Banca:\s*(.+?)\s*[ÓO]rg[ãa]o:\s*(.+?)\s*Provas?:\s*)/i);
  if (mAno) {
    h.ano = Number(mAno[1]); h.banca = mAno[2].trim(); h.orgao = mAno[3].trim();
    resto = resto.slice(mAno[0].length);
    // tira "BANCA - ANO - ÓRGÃO - " do começo da prova; sobra "Cargo Enunciado..."
    const ate = resto.match(/^.{0,80}?\b(?:19|20)\d{2}\s*-\s*/);
    if (ate) {
      resto = resto.slice(ate[0].length);
      // o órgão já veio no cabeçalho (pode ter hífen, ex.: TJ-PR): remove exatamente ele e o traço seguinte
      if (resto.toLowerCase().startsWith(h.orgao.toLowerCase())) resto = resto.slice(h.orgao.length).replace(/^\s*-\s*/, '');
      else resto = resto.replace(/^[^-]{1,60}?\s*-\s*/, '');
    }
    // cargo: até a primeira palavra típica de enunciado (pulando a 1ª palavra do cargo)
    const prim = resto.search(/\s/);
    const alvo = INICIOS_ENUNCIADO.exec(resto.slice(prim + 1));
    if (alvo) {
      const corte = prim + 1 + alvo.index + (alvo[0].startsWith(' ') ? 1 : 0);
      h.cargo = resto.slice(0, corte).trim();
      resto = resto.slice(corte);
    }
    h.completo = Boolean(h.cargo);
    resto = resto.replace(/^\)\s*(Adaptada)?\s*/i, '');
  } else {
    resto = resto.replace(/^\(INSTITUTO AOCP\)\s*/i, '');
    h.banca = /INSTITUTO AOCP/i.test(bruto.slice(0, 40)) ? 'INSTITUTO AOCP' : undefined;
    h.completo = true;
  }
  return { cabecalho: h, corpo: resto.trim() };
}

// a) ... b) ... e): exige as cinco letras em ordem
export function extrairAlternativas(corpo) {
  const re = /(?:^|[\s(])([a-eA-E])\)\s+/g;
  const achados = []; let esperada = 'A'; let m;
  while ((m = re.exec(corpo)) !== null) {
    if (m[1].toUpperCase() === esperada) {
      achados.push({ letra: esperada, ini: m.index + (m[0].length - m[0].trimStart().length), texto: m.index + m[0].length });
      esperada = String.fromCharCode(esperada.charCodeAt(0) + 1);
      if (esperada > 'E') break;
    }
  }
  if (achados.length < 5) return null;
  const alternativas = achados.map((a, i) => ({
    letra: a.letra,
    texto: corpo.slice(a.texto, i + 1 < achados.length ? achados[i + 1].ini : corpo.length).trim()
  }));
  return { enunciado: corpo.slice(0, achados[0].ini).trim(), alternativas };
}

// A última alternativa de cada bloco costuma levar junto o que vem depois (gabarito, número de página, começo da próxima questão).
// Corta esse excesso; devolve null quando a questão continua suja ou duvidosa (melhor descartar do que estudar texto trocado).
export function limparQuestao({ enunciado, alternativas }) {
  const cortar = (t) => t
    .replace(/\s+(?:GABARITO|Gabarito)\b[\s\S]*$/, '')
    .replace(/\s+\d{1,2}\s*[-º.)]*\s*Ano:\s*\d{4}[\s\S]*$/, '')
    .replace(/\s+\d{3}$/, '')
    .trim();
  const enun = enunciado
    .replace(/\s+Alternativas$/i, '')
    .replace(/^Ano:\s*\d{4}\s*Banca:\s*(?:INSTITUTO AOCP|[^.]{1,40}?)\s+(?=[A-ZÀ-Ú])/, '')
    .trim();
  const alts = alternativas.map((a) => ({ letra: a.letra, texto: cortar(a.texto) }));
  const suja = /Ano:\s*\d{4}|Banca:|GABARITO|APOSTILA/i.test(enun) || alts.some((a) => !a.texto || a.texto.length > 350 || /Ano:\s*\d{4}|Banca:|GABARITO/i.test(a.texto));
  return suja ? null : { enunciado: enun, alternativas: alts };
}

export function ehCertoErrado(corpo) {
  return /\(\s*\)\s*certo\s*\(\s*\)\s*errado/i.test(corpo) || /julgue\s+o\s+(?:seguinte\s+)?item/i.test(corpo.slice(0, 400));
}

// Blocos sem "Ano:" na frente de cada questão (numeração corrida 1, 2, 3...): aceita só o próximo número da sequência
export function segmentarSequencial(texto) {
  const re = /(?:^|\n)[ \t]*(\d{1,3})\s*(?:º\)|[.\-)])\s*/g;
  const marcas = [];
  let esperado = 1;
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (Number(m[1]) === esperado) {
      marcas.push({ idx: m.index, fim: m.index + m[0].length, num: esperado });
      esperado++;
    }
  }
  return marcas.map((mc, i) => ({ num: mc.num, bruto: texto.slice(mc.fim, i + 1 < marcas.length ? marcas[i + 1].idx : texto.length).trim() }));
}

// Lê o gabarito perto da palavra GABARITO: "1-B 2-A", "1. E", "GABARITO: 1-A" ou uma coluna de letras (B A E ...).
export function lerChave(texto) {
  const i = texto.search(/gabarito/i);
  if (i < 0) return new Map();
  const janela = texto.slice(i, i + 3500);
  const mapa = new Map();
  for (const m of janela.matchAll(/(?<![\d.\w])(\d{1,2})\s*[-–.:)]\s*([A-E])(?![A-Za-zÀ-ú])/g)) {
    if (!mapa.has(Number(m[1]))) mapa.set(Number(m[1]), m[2]);
  }
  if (mapa.size >= 3) return mapa;
  const coluna = janela.replace(/^gabarito[:\s]*/i, '').match(/^(?:\s*[A-E]\s*\n)+/);
  if (coluna) coluna[0].trim().split(/\s+/).forEach((l, k) => mapa.set(k + 1, l));
  return mapa;
}
