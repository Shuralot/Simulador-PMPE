// Backup manual do simulador.db (cópia consistente via VACUUM INTO). O servidor já faz um por dia ao iniciar.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(path.join(raiz, 'simulador.db'));
const dir = path.join(raiz, 'backups');
fs.mkdirSync(dir, { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
const destino = path.join(dir, `manual-${carimbo}.db`);
db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
console.log(`Backup gravado em ${destino}`);
