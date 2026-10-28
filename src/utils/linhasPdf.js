// Reconstrói as linhas da página preservando as quebras (o extrator de questões do servidor depende delas).
// Usa o marcador de fim de linha do pdf.js e, na falta dele, a mudança da coordenada vertical.
export function linhasDaPagina(items) {
  let texto = '';
  let ultimoY = null;
  for (const item of items) {
    if (!('str' in item)) continue;
    const y = item.transform ? Math.round(item.transform[5]) : null;
    if (ultimoY !== null && y !== null && Math.abs(y - ultimoY) > 3 && !texto.endsWith('\n')) {
      texto += ' \n';
    }
    texto += item.str;
    if (item.hasEOL) texto += ' \n';
    if (y !== null && item.str.trim()) ultimoY = y;
  }
  return texto
    .replace(/[ \t]+\n/g, ' \n')
    .replace(/(\w)[ \t]+-[ \t]*(\w)/g, '$1-$2')
    .replace(/[ \t]{2,}/g, ' ');
}
