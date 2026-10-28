// Fatia texto de lei em trechos por artigo (e súmulas) para servir de base de conhecimento ao RAG
const MAX_CHUNK = 3500;

function dividirLongo(referencia, texto) {
  if (texto.length <= MAX_CHUNK) return [{ referencia, texto }];
  const partes = [];
  const paragrafos = texto.split(/\n+/);
  let atual = '';
  let n = 1;
  for (const p of paragrafos) {
    if ((atual + '\n' + p).length > MAX_CHUNK && atual) {
      partes.push({ referencia: `${referencia} (parte ${n++})`, texto: atual.trim() });
      atual = '';
    }
    atual += (atual ? '\n' : '') + p;
  }
  if (atual.trim()) partes.push({ referencia: n > 1 ? `${referencia} (parte ${n})` : referencia, texto: atual.trim() });
  return partes;
}

export function chunkLei(texto) {
  const limpo = String(texto || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n');
  const re = /^[ \t]*(Art(?:igo)?\.?\s*(\d+)\s*[º°o]?(?:\s*-\s*[A-Z])?|S[úu]mula(?:\s+Vinculante)?\s*(?:n[º°.]?\s*)?(\d+))/gim;
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
    chunks.push(...dividirLongo(marcas[i].referencia, corpo));
  }
  return chunks;
}
