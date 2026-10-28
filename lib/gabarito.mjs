// Interpreta o texto de um gabarito colado/extraído de PDF: "1-A 2-B ...", "01) C", "1: X", tabelas "1 A 2 B", JSON {"1":"A"}
export function parseGabaritoTexto(entrada) {
  const mapa = {};
  const raw = String(entrada || '').trim();
  if (!raw) return mapa;

  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        const letra = String(v).trim().toUpperCase();
        if (/^\d+$/.test(k) && /^[A-EX]$/.test(letra)) mapa[Number(k)] = letra;
      }
      return mapa;
    } catch { /* cai no parser textual */ }
  }

  const re = /(?:^|[^\d])(\d{1,3})\s*[-–—.:)\]]?\s*(anulad[ao]|[A-Ea-e*]|X|x)(?![A-Za-zÀ-ú])/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const num = Number(m[1]);
    if (num < 1 || num > 200 || mapa[num]) continue;
    const bruto = m[2].toLowerCase();
    mapa[num] = bruto.startsWith('anul') || bruto === 'x' || bruto === '*' ? 'X' : bruto.toUpperCase();
  }
  return mapa;
}
