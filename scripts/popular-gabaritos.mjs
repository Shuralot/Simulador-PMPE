import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const gabs = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'gabaritosOficiais.json'), 'utf8'));
const db = new DatabaseSync(path.join(root, 'simulador.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS gabaritos_oficiais (
    prova_id TEXT NOT NULL,
    numero INTEGER NOT NULL,
    letra TEXT NOT NULL CHECK (letra IN ('A','B','C','D','E','X')),
    anulada INTEGER DEFAULT 0,
    fonte TEXT,
    data_importacao TEXT,
    PRIMARY KEY (prova_id, numero)
  );
`);

for (const [col, ddl] of [
  ['texto_base', 'TEXT'],
  ['depende_de_texto', 'INTEGER DEFAULT 0'],
  ['gabarito_fonte', 'TEXT'],
  ['anulada', 'INTEGER DEFAULT 0']
]) {
  const cols = db.prepare('PRAGMA table_info(questoes_provas)').all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE questoes_provas ADD COLUMN ${col} ${ddl}`);
}

const ins = db.prepare('INSERT OR REPLACE INTO gabaritos_oficiais (prova_id, numero, letra, anulada, fonte, data_importacao) VALUES (?,?,?,?,?,?)');
const agora = new Date().toISOString();

db.exec('BEGIN');
for (const [provaId, items] of Object.entries(gabs)) {
  for (const [numStr, letra] of Object.entries(items)) {
    const isAnulada = letra === 'X' ? 1 : 0;
    ins.run(provaId, Number(numStr), letra, isAnulada, 'Instituto AOCP Oficial', agora);
  }
}

db.prepare(`
  UPDATE questoes_provas SET
    gabarito_oficial = (SELECT CASE WHEN g.anulada = 1 THEN NULL ELSE g.letra END FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero),
    anulada = COALESCE((SELECT g.anulada FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero), 0),
    gabarito_fonte = (SELECT g.fonte FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero)
  WHERE EXISTS (SELECT 1 FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero)
`).run();
db.exec('COMMIT');

console.log('Gabaritos gravados com sucesso!');
const total = db.prepare('SELECT COUNT(*) as c, SUM(CASE WHEN gabarito_oficial IS NOT NULL OR anulada = 1 THEN 1 ELSE 0 END) as g FROM questoes_provas').get();
console.log('Total de questoes:', total.c, '| Com gabarito/anuladas:', total.g);
