// Ingere a apostila de estudo (PDF) na base de conhecimento, só as partes de teoria das matérias sem lei
// (Português, Raciocínio Lógico, História, Informática). Direito Constitucional e Direitos Humanos já usam a letra da lei.
// Uso: node --no-warnings scripts/ingerir-apostila.mjs "C:\caminho\APOSTILA PMPE.pdf"            (só relata)
//      node --no-warnings scripts/ingerir-apostila.mjs "C:\caminho\APOSTILA PMPE.pdf" --aplicar  (grava; refaz do zero)
// Precisa do `pdftotext` (poppler) no PATH. O conteúdo fica só no simulador.db local (não vai para o git).
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classificarTopicoOuNull } from '../lib/taxonomia.mjs';
import { computeTFVector } from '../lib/texto.mjs';

const [pdf] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const aplicar = process.argv.includes('--aplicar');
if (!pdf) { console.error('Informe o caminho do PDF.'); process.exit(1); }

const MAX = 1100;
export const SECOES = [
  { de: 1, ate: 35, disciplina: 'Língua Portuguesa', fonte: 'Apostila PMPE 2026 — Português (Prof. Tiago Xavier)' },
  { de: 53, ate: 76, disciplina: 'Raciocínio Lógico-Matemático', fonte: 'Apostila PMPE 2026 — Raciocínio Lógico', simbolos: true },
  { de: 77, ate: 125, disciplina: 'História de Pernambuco', fonte: 'Apostila PMPE 2026 — História (Prof. Alcidélio Camilo)' },
  { de: 344, ate: 455, disciplina: 'Informática', fonte: 'Apostila PMPE 2026 — Informática (Prof. Marco Guimarães)' }
];

// Fonte Symbol do Word exportada como caracteres privados: devolve os símbolos da lógica
const SIMBOLOS = { '\uf0d9': '∧', '\uf0da': '∨', '\uf0ab': '↔', '\uf0db': '⇔', '\uf0de': '⇒', '\uf0ae': '→', '\uf0a3': '≤', '\uf0b3': '≥', '\uf0b9': '≠', '\uf0d8': '¬' };
const RUIDO = [/^APOSTILA PMPE 2026$/i, /^Parte integrante da apostila.*$/i, /^Professor Alcid[ée]lio Camilo$/i, /^\d{1,3}$/];

export function limparPagina(texto, simbolos) {
  let t = texto;
  t = t.replace(/[\uf000-\uf8ff]/g, (c) => (simbolos ? (SIMBOLOS[c] ?? '') : ''));
  t = t.replace(/INFORM[ÁA]TICA\s+[–-]\s+PROF\.\s+MARCO GUIMAR[ÃA]ES/g, '');
  return t.split('\n').map((l) => l.trim()).filter((l) => l && !RUIDO.some((r) => r.test(l)));
}

const ehTitulo = (l) => l.length >= 5 && l.length <= 70 && l === l.toUpperCase() && /[A-ZÀ-Ú]{4}/.test(l);
const pareceQuestao = (txt) => (txt.match(/(?:^|\s)\(?[a-eA-E]\)\s/g) || []).length >= 3;

function dividir(texto) {
  if (texto.length <= MAX) return [texto];
  const frases = texto.split(/(?<=[.!?])\s+/);
  const partes = []; let atual = '';
  for (const f of frases) {
    if (atual && atual.length + f.length + 1 > MAX) { partes.push(atual); atual = f; } else atual += (atual ? ' ' : '') + f;
  }
  if (atual) partes.push(atual);
  return partes;
}

export function fatiarSecao(paginas, secao) {
  const chunks = [];
  let titulo = '', buffer = '', paginaBuffer = secao.de, pulando = false, ultimoTopico = null;
  const usados = new Map();
  const fechar = () => {
    const txt = buffer.trim(); buffer = '';
    if (txt.length < 120 || pareceQuestao(txt)) return;
    for (const parte of dividir(txt)) {
      const topico = classificarTopicoOuNull(secao.disciplina, titulo, parte) || ultimoTopico || 'Outros';
      if (topico !== 'Outros') ultimoTopico = topico;
      const base = `${titulo || 'Trecho'} (p. ${paginaBuffer})`;
      const n = (usados.get(base) || 0) + 1; usados.set(base, n);
      chunks.push({ referencia: n > 1 ? `${base} #${n}` : base, texto: parte, topico });
    }
  };
  for (let pg = secao.de; pg <= secao.ate; pg++) {
    for (const l of limparPagina(paginas[pg - 1] || '', secao.simbolos)) {
      if (/^EXERC[ÍI]CIOS|^QUEST[ÕO]ES|^GABARITO/i.test(l)) { fechar(); pulando = true; continue; }
      if (ehTitulo(l)) { fechar(); pulando = false; titulo = l.replace(/\s+/g, ' '); paginaBuffer = pg; continue; }
      if (/^\d+\.\s+[A-ZÀ-Ú]{3}/.test(l) && l === l.toUpperCase()) { fechar(); pulando = false; titulo = l; paginaBuffer = pg; continue; }
      if (pulando) continue;
      if (!buffer) paginaBuffer = pg;
      buffer += (buffer ? '\n' : '') + l;
      if (buffer.length > MAX * 1.3) fechar();
    }
  }
  fechar();
  return chunks;
}

const r = spawnSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { maxBuffer: 256 * 1024 * 1024 });
if (r.error) { console.error('pdftotext indisponível:', r.error.message); process.exit(1); }
const paginas = r.stdout.toString('utf8').split('\f');
console.log(`PDF: ${paginas.length - 1} páginas.`);

const todos = [];
for (const secao of SECOES) {
  const chunks = fatiarSecao(paginas, secao);
  const porTopico = {};
  for (const c of chunks) porTopico[c.topico] = (porTopico[c.topico] || 0) + 1;
  console.log(`\n${secao.disciplina}: ${chunks.length} trechos`);
  for (const [t, n] of Object.entries(porTopico).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${t}`);
  todos.push(...chunks.map((c) => ({ ...c, secao })));
}

if (!aplicar) { console.log('\nRode com --aplicar para gravar.'); process.exit(0); }

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(process.env.DB_PATH || path.join(raiz, 'simulador.db'));
const ins = db.prepare('INSERT INTO base_conhecimento (fonte, disciplina, topico, referencia, texto, vetor_json, data_criacao) VALUES (?, ?, ?, ?, ?, ?, ?)');
const agora = new Date().toISOString();
db.exec('BEGIN');
db.prepare("DELETE FROM base_conhecimento WHERE fonte LIKE 'Apostila PMPE 2026%'").run();
for (const c of todos) ins.run(c.secao.fonte, c.secao.disciplina, c.topico, c.referencia, c.texto, JSON.stringify(computeTFVector(`${c.referencia} ${c.texto}`)), agora);
db.exec('DELETE FROM base_conhecimento_fts'); // o servidor refaz o índice no próximo start
db.exec('COMMIT');
console.log(`\n${todos.length} trechos gravados. Reinicie o servidor para reindexar a busca.`);
