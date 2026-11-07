// Auditoria da classificação por tópico do edital (banco de IA, provas, histórico e caderno de erros).
// Uso: node --no-warnings scripts/auditar-classificacao.mjs           (só relata)
//      node --no-warnings scripts/auditar-classificacao.mjs --aplicar (faz backup e corrige)
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classificarTopico, TOPICOS_EDITAL } from '../lib/taxonomia.mjs';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const aplicar = process.argv.includes('--aplicar');
const db = new DatabaseSync(path.join(raiz, 'simulador.db'));

const TABELAS = [
  { nome: 'banco_questoes', alts: false },
  { nome: 'questoes_respondidas', alts: false },
  { nome: 'caderno_erros', alts: false },
  { nome: 'questoes_provas', alts: true }
];

const mudancas = [];
for (const t of TABELAS) {
  const cols = `id, disciplina, assunto, enunciado, topico${t.alts ? ', alternativas_json' : ''}`;
  for (const r of db.prepare(`SELECT ${cols} FROM ${t.nome}`).all()) {
    if (!TOPICOS_EDITAL[r.disciplina]) continue; // fora do edital: nada a classificar
    // Nas provas o "assunto" é só o rótulo do tópico antigo (auto-confirmaria o erro): classifica pelo conteúdo
    const novo = classificarTopico(r.disciplina, t.alts ? '' : (r.assunto || ''), t.alts ? `${r.enunciado || ''} ${r.alternativas_json || ''}` : (r.enunciado || ''));
    if (novo !== r.topico) mudancas.push({ tabela: t.nome, id: r.id, disciplina: r.disciplina, de: r.topico, para: novo, trecho: String(r.enunciado || '').replace(/\s+/g, ' ').slice(0, 90) });
  }
}

console.log(`${mudancas.length} questão(ões) com classificação divergente.`);
for (const m of mudancas) console.log(`  [${m.tabela} #${m.id}] ${m.de} -> ${m.para} | ${m.trecho}`);

if (!aplicar) {
  if (mudancas.length) console.log('\nRode com --aplicar para corrigir (um backup é feito antes).');
  process.exit(0);
}
if (mudancas.length === 0) process.exit(0);

fs.mkdirSync(path.join(raiz, 'backups'), { recursive: true });
const destino = path.join(raiz, 'backups', `pre-reclassificacao-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
console.log(`\nBackup: ${destino}`);

db.exec('BEGIN');
for (const m of mudancas) db.prepare(`UPDATE ${m.tabela} SET topico = ? WHERE id = ?`).run(m.para, m.id);
db.exec('COMMIT');
console.log(`${mudancas.length} classificação(ões) corrigida(s).`);
