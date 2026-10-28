// Ingere um arquivo .txt de lei na base de conhecimento (fatiado por artigo/súmula).
// Uso: node scripts/ingerir-lei.mjs "Constituição Federal de 1988" "Direito Constitucional" caminho/cf88.txt
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chunkLei } from '../lib/leis.mjs';
import { computeTFVector } from '../lib/texto.mjs';

const [fonte, disciplina, arquivo] = process.argv.slice(2);
if (!fonte || !arquivo) {
  console.error('Uso: node scripts/ingerir-lei.mjs "<fonte>" "<disciplina ou vazio>" <arquivo.txt>');
  process.exit(1);
}

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(process.env.DB_PATH || path.join(raiz, 'simulador.db'));
const chunks = chunkLei(fs.readFileSync(arquivo, 'utf8'));

const ins = db.prepare(`
  INSERT INTO base_conhecimento (fonte, disciplina, referencia, texto, vetor_json, data_criacao)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(fonte, referencia) DO UPDATE SET texto = excluded.texto, vetor_json = excluded.vetor_json, disciplina = excluded.disciplina
`);
const agora = new Date().toISOString();
db.exec('BEGIN');
for (const c of chunks) ins.run(fonte, disciplina || null, c.referencia, c.texto, JSON.stringify(computeTFVector(`${c.referencia} ${c.texto}`)), agora);
db.exec('COMMIT');
console.log(`${chunks.length} trechos gravados em "${fonte}".`);
