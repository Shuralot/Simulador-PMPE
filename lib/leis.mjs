// Fatia texto de lei em trechos semânticos enxutos por artigo/incisos/parágrafos e súmulas para o RAG
const MAX_CHUNK = 1100;

function extrairRotuloSubtrecho(bloco, indiceFallback) {
  const incisos = [];
  const pars = [];
  for (const linha of bloco.split('\n')) {
    const l = linha.trim();
    const mInc = l.match(/^([IVXLCDM]{1,7})\s*[-–—.)]/);
    if (mInc) incisos.push(mInc[1]);
    const mPar = l.match(/^(?:§\s*(\d+)\s*[º°o]?|Par[áa]grafo\s+[úu]nico)/i);
    if (mPar) pars.push(mPar[1] ? `§${mPar[1]}º` : 'Par. único');
  }
  if (incisos.length > 1) return `${incisos[0]} a ${incisos[incisos.length - 1]}`;
  if (incisos.length === 1 && pars.length === 0) return `inc. ${incisos[0]}`;
  if (pars.length > 1) return `${pars[0]} a ${pars[pars.length - 1]}`;
  if (pars.length === 1 && incisos.length === 0) return pars[0];
  if (incisos.length >= 1 && pars.length >= 1) return `${incisos[0]}..${pars[pars.length - 1]}`;
  return `parte ${indiceFallback}`;
}

function dividirLongo(referencia, texto) {
  if (texto.length <= MAX_CHUNK) return [{ referencia, texto }];
  const paragrafos = texto.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragrafos.length === 0) return [{ referencia, texto }];

  // Preserva o caput resumido como contexto nos sub-blocos seguintes de artigos longos (ex.: Art. 5º, Art. 37, Art. 144)
  const caput = /^Art\./i.test(paragrafos[0]) ? paragrafos[0].slice(0, 220) : '';
  const partesBrutas = [];
  let atual = '';

  for (const p of paragrafos) {
    const limiteBloco = partesBrutas.length === 0 ? MAX_CHUNK : (MAX_CHUNK - (caput ? caput.length + 12 : 0));
    if (atual && (atual.length + 1 + p.length) > Math.max(450, limiteBloco)) {
      partesBrutas.push(atual.trim());
      atual = p;
    } else {
      atual += (atual ? '\n' : '') + p;
    }
  }
  if (atual.trim()) partesBrutas.push(atual.trim());

  if (partesBrutas.length === 1) return [{ referencia, texto: partesBrutas[0] }];

  const rotulosUsados = new Set();
  return partesBrutas.map((bloco, idx) => {
    let rotulo = extrairRotuloSubtrecho(bloco, idx + 1);
    if (idx === 0 && rotulo === 'parte 1' && /^Art\./i.test(bloco)) rotulo = 'caput';
    let refFinal = `${referencia} (${rotulo})`;
    if (rotulosUsados.has(refFinal)) refFinal = `${referencia} (${rotulo} #${idx + 1})`;
    rotulosUsados.add(refFinal);

    const corpoFinal = (idx > 0 && caput && !bloco.startsWith(caput.slice(0, 30)))
      ? `${caput} [...]\n${bloco}`
      : bloco;

    return { referencia: refFinal, texto: corpoFinal };
  });
}

export function chunkLei(texto) {
  const semFrontmatter = String(texto || '').replace(/\r/g, '').replace(/^---[\s\S]*?---\n+/, '');
  const limpo = semFrontmatter.replace(/[ \t]+\n/g, '\n');
  const re = /^[ \t]*(?:#+\s*)?(?:\*\*)?(Art(?:igo)?\.?\s*(\d+)\s*[º°o]?(?:\s*-\s*[A-Z])?|S[úu]mula(?:\s+Vinculante)?\s*(?:n[º°.]?\s*)?(\d+))(?:\*\*)?/gim;
  const marcas = [];
  let m;
  while ((m = re.exec(limpo)) !== null) {
    const ehSumula = /s[úu]mula/i.test(m[1]);
    const num = m[2] || m[3];
    const sufixo = (m[1].match(/-\s*([A-Z])\s*$/) || [])[1];
    marcas.push({
      index: m.index,
      referencia: ehSumula ? `Súmula${/vinculante/i.test(m[1]) ? ' Vinculante' : ''} ${num}` : `Art. ${num}º${sufixo ? '-' + sufixo : ''}`
    });
  }

  if (marcas.length === 0) {
    const blocos = limpo.split(/\n{2,}/).map((b) => b.trim()).filter((b) => b.length > 40);
    return blocos.flatMap((b, i) => dividirLongo(`Trecho ${i + 1}`, b));
  }

  const chunks = [];
  for (let i = 0; i < marcas.length; i++) {
    const fim = i + 1 < marcas.length ? marcas[i + 1].index : limpo.length;
    const corpo = limpo.slice(marcas[i].index, fim).trim();
    if (corpo.length < 20) continue;
    // Ignora artigos inteiramente revogados ou vetados sem texto normativo útil
    const semCabecalho = corpo.replace(/^Art(?:igo)?\.?\s*\d+\s*[º°o]?(?:-[A-Z])?\.?\s*/i, '').trim();
    if (semCabecalho.length < 80 && /^\(?(?:revogad[oa]|vetad[oa]|suprimid[oa])/i.test(semCabecalho)) continue;
    chunks.push(...dividirLongo(marcas[i].referencia, corpo));
  }
  return chunks;
}
