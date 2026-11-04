// Gera seed/simulador.seed.db: o acervo (provas, banco, leis) SEM o seu histórico pessoal nem a chave de API.
// O servidor copia esse arquivo para simulador.db na primeira execução, quando o banco ainda não existe.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const origem = path.join(raiz, 'simulador.db');
const destino = path.join(raiz, 'seed', 'simulador.seed.db');

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.rmSync(destino, { force: true });

const db = new DatabaseSync(origem);
db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
db.close();

const seed = new DatabaseSync(destino);
for (const t of ['simulados', 'questoes_respondidas', 'caderno_erros', 'uso_questoes_provas']) {
  try { seed.exec(`DELETE FROM ${t}`); } catch { /* tabela pode não existir */ }
}
seed.exec("DELETE FROM configuracoes WHERE chave LIKE '%key%'");
seed.exec('VACUUM');
seed.close();
console.log(`Seed gerado em ${destino}`);
