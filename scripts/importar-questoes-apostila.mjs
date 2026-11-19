// Importa para o banco as questões reais de concurso coladas na apostila, SÓ quando:
//  1) a apostila traz o gabarito, 2) é múltipla escolha A–E e 3) uma resolução independente da IA confirma esse gabarito.
// Uso: node --no-warnings scripts/importar-questoes-apostila.mjs "C:\caminho\APOSTILA PMPE.pdf"            (só relata, sem IA)
//      node --no-warnings scripts/importar-questoes-apostila.mjs "C:\caminho\APOSTILA PMPE.pdf" --aplicar  (confere com a IA e grava)
// Opcional: --relatorio caminho.json  (grava o que entrou e o que ficou de fora)
import { abrirBanco } from '../db/conexao.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { segmentarQuestoes, segmentarSequencial, separarCabecalho, extrairAlternativas, ehCertoErrado, lerChave, limparQuestao } from '../lib/questoesApostila.mjs';
import { classificarTopico } from '../lib/taxonomia.mjs';
import { hashEnunciado } from '../lib/texto.mjs';
import { verificarQuestoesComIA, modelosVerificador, DEFAULT_MODEL } from '../lib/gemini.mjs';

const args = process.argv.slice(2);
const iRel = args.indexOf('--relatorio');
const relatorio = iRel >= 0 ? args[iRel + 1] : null;
const pdf = args.find((a, i) => !a.startsWith('--') && !(iRel >= 0 && i === iRel + 1));
const aplicar = args.includes('--aplicar');
if (!pdf) { console.error('Informe o caminho do PDF.'); process.exit(1); }

const DH = 'Direitos Humanos e Legislação Extravagante';
const DC = 'Direito Constitucional';
// de/ate: páginas das questões. chave: página onde está o gabarito. estilo: 'ano' (cada questão começa com "Ano:") ou 'seq' (numeração corrida)
const BLOCOS = [
  { id: 'dc-1', de: 143, ate: 153, chave: 153, estilo: 'ano', disciplina: DC },
  { id: 'dc-2', de: 180, ate: 182, chave: 182, estilo: 'seq', disciplina: DC },
  { id: 'abuso', de: 283, ate: 284, chave: 284, estilo: 'seq', disciplina: DH },
  { id: 'eca', de: 298, ate: 299, chave: 299, estilo: 'seq', disciplina: DH },
  { id: 'hediondos', de: 305, ate: 308, chave: 307, estilo: 'seq', disciplina: DH },
  { id: 'racismo', de: 310, ate: 311, chave: 311, estilo: 'seq', disciplina: DH },
  { id: 'drogas', de: 318, ate: 319, chave: 319, estilo: 'ano', disciplina: DH },
  { id: 'tortura', de: 322, ate: 323, chave: 323, estilo: 'seq', disciplina: DH },
  { id: 'maria-da-penha', de: 335, ate: 342, chave: 342, estilo: 'seq', disciplina: DH }
];

const r = spawnSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { maxBuffer: 256 * 1024 * 1024 });
if (r.error || !r.stdout?.length) { console.error('pdftotext falhou:', r.error?.message || 'saída vazia'); process.exit(1); }
const paginas = r.stdout.toString('utf8').split('\f');
// junta as páginas tirando o cabeçalho e a linha com o número da própria página (que cai no meio dos enunciados)
const juntar = (a, b) => paginas.slice(a - 1, b)
  .map((pg, i) => pg.split('\n').filter((l) => l.trim() !== String(a + i) && l.trim() !== 'APOSTILA PMPE 2026').join('\n'))
  .join('\n');

const candidatas = [];
const resumo = [];
for (const b of BLOCOS) {
  const texto = juntar(b.de, b.ate);
  const chave = lerChave(juntar(b.chave, b.chave));
  const segs = b.estilo === 'ano' ? segmentarQuestoes(texto) : segmentarSequencial(texto);
  const c = { bloco: b.id, marcas: segs.length, certoErrado: 0, semAlternativas: 0, semChave: 0, aptas: 0 };
  for (const s of segs) {
    const { cabecalho, corpo } = separarCabecalho(s.bruto);
    if (ehCertoErrado(corpo)) { c.certoErrado++; continue; }
    const bruta = extrairAlternativas(corpo);
    const q = bruta && limparQuestao(bruta);
    if (!q || q.enunciado.length < 25) { c.semAlternativas++; continue; }
    const gabarito = chave.get(s.num);
    if (!gabarito) { c.semChave++; continue; }
    c.aptas++;
    const textoClass = `${q.enunciado} ${q.alternativas.map((a) => a.texto).join(' ')}`;
    candidatas.push({
      bloco: b.id, numero: s.num, disciplina: b.disciplina, topico: classificarTopico(b.disciplina, '', textoClass),
      cabecalho, enunciado: q.enunciado, alternativas: q.alternativas, gabarito
    });
  }
  resumo.push(c);
}

console.log('bloco            marcas  CERTO/ERRADO  sem 5 alt  sem chave  aptas');
for (const c of resumo) {
  console.log(`${c.bloco.padEnd(16)} ${String(c.marcas).padStart(5)} ${String(c.certoErrado).padStart(12)} ${String(c.semAlternativas).padStart(10)} ${String(c.semChave).padStart(10)} ${String(c.aptas).padStart(6)}`);
}
console.log(`\n${candidatas.length} questões aptas para conferir.`);
if (!aplicar) {
  for (const q of candidatas.slice(0, 4)) {
    console.log(`\n[${q.bloco} #${q.numero}] gabarito ${q.gabarito} | ${q.cabecalho.banca || '?'} ${q.cabecalho.ano || ''} ${q.cabecalho.orgao || ''} | cargo: ${q.cabecalho.cargo || '-'}\n${q.enunciado.slice(0, 220)}`);
  }
  console.log('\nRode com --aplicar para conferir com a IA e gravar.');
  process.exit(0);
}

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { db } = abrirBanco(raiz); // aplica as migrações (coluna origem_texto etc.)
const apiKey = process.env.GEMINI_API_KEY || db.prepare("SELECT valor FROM configuracoes WHERE chave = 'gemini_api_key'").get()?.valor;
if (!apiKey) { console.error('Sem chave do Gemini (configure em Opções).'); process.exit(1); }

const ins = db.prepare(`
  INSERT OR IGNORE INTO banco_questoes (hash_enunciado, disciplina, assunto, topico, sub_topico, banca, tipo, fonte_legal, dificuldade,
    enunciado, texto_base, alternativas_json, gabarito, dica, explicacao_json, palavras_chave, verificada, origem_texto, total_vezes_usada, data_criacao)
  VALUES (?, ?, ?, ?, 'Questão Real', ?, 'REAL', NULL, 'Média', ?, NULL, ?, ?, '', ?, ?, 1, ?, 0, ?)
`);
const aceitas = [];
const recusadas = [];
const LOTE = 6;
for (let i = 0; i < candidatas.length; i += LOTE) {
  const lote = candidatas.slice(i, i + LOTE);
  const verificadas = await verificarQuestoesComIA({
    apiKey,
    modelsToTry: modelosVerificador(DEFAULT_MODEL),
    questoes: lote.map((q) => ({ enunciado: q.enunciado, alternativas: q.alternativas, gabarito: q.gabarito, textoBase: '', fonteLegal: '' }))
  });
  verificadas.forEach((v, k) => {
    if (v.verificacao === 'OK') aceitas.push(lote[k]);
    else recusadas.push({ ...lote[k], motivo: v.verificacao === 'DIVERGENTE' ? `IA respondeu ${v.respostaVerificacao}, apostila diz ${lote[k].gabarito}` : 'IA não conseguiu verificar' });
  });
  process.stdout.write(`\rconferidas ${Math.min(i + LOTE, candidatas.length)}/${candidatas.length}`);
}
console.log(`\n${aceitas.length} confirmadas pela IA, ${recusadas.length} divergentes ou não verificadas (ficam de fora).`);

const agora = new Date().toISOString();
let novas = 0;
let repetidas = 0;
db.exec('BEGIN');
for (const q of aceitas) {
  const h = q.cabecalho;
  const origem = [h.banca, h.ano, h.orgao].filter(Boolean).join(' • ') || 'Concurso';
  const res = ins.run(
    hashEnunciado(q.enunciado), q.disciplina, q.topico, q.topico, h.banca || 'Banca', q.enunciado,
    JSON.stringify(q.alternativas), q.gabarito,
    JSON.stringify({ correta: `Gabarito da apostila, confirmado por resolução independente da IA: letra (${q.gabarito}).`, distratores: {} }),
    `${q.disciplina} ${q.topico} ${origem} apostila`, `${origem} (via sua apostila)`, agora
  );
  if (res.changes > 0) novas++; else repetidas++;
}
db.exec('COMMIT');
console.log(`${novas} questões novas no banco (${repetidas} já existiam).`);

if (relatorio) {
  const resumir = ({ bloco, numero, gabarito, motivo, enunciado }) => ({ bloco, numero, gabarito, motivo, enunciado: enunciado.slice(0, 160) });
  fs.writeFileSync(relatorio, JSON.stringify({ aceitas: aceitas.map(resumir), recusadas: recusadas.map(resumir) }, null, 2));
  console.log(`Relatório: ${relatorio}`);
}
