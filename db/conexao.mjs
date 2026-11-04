import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { hojeLocal } from '../lib/tempo.mjs';

// Abre o banco (criando-o a partir do seed na primeira execução), faz o backup diário e garante o esquema.
// `raiz` é a pasta do projeto, onde ficam simulador.db, seed/ e backups/.
export function abrirBanco(raiz) {
  // Inicialização do Banco de Dados SQLite em disco
  const dbPath = process.env.DB_PATH || path.join(raiz, 'simulador.db');
  // Primeira execução: cria o banco a partir do acervo base (sem histórico pessoal)
  const seedPath = path.join(raiz, 'seed', 'simulador.seed.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(seedPath)) {
    fs.copyFileSync(seedPath, dbPath);
    console.log('[SQLite] Banco criado a partir do acervo base (seed).');
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  console.log(`[SQLite] Banco de dados inicializado em: ${dbPath}`);

  // Backup diário automático (VACUUM INTO) antes de qualquer migração; mantém os 10 mais recentes
  function backupDiario() {
    try {
      const dir = process.env.DB_PATH ? path.join(path.dirname(dbPath), 'backups') : path.join(raiz, 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const destino = path.join(dir, `simulador-${hojeLocal()}.db`);
      if (!fs.existsSync(destino)) {
        db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
        console.log(`[Backup] Cópia do banco gravada em ${destino}`);
      }
      const antigos = fs.readdirSync(dir).filter((f) => /^simulador-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(10);
      for (const f of antigos) fs.unlinkSync(path.join(dir, f));
      // Cópia extra fora do projeto (ex.: pasta do OneDrive) via BACKUP_EXTRA_DIR
      if (process.env.BACKUP_EXTRA_DIR) {
        fs.mkdirSync(process.env.BACKUP_EXTRA_DIR, { recursive: true });
        const extra = path.join(process.env.BACKUP_EXTRA_DIR, path.basename(destino));
        if (!fs.existsSync(extra)) fs.copyFileSync(destino, extra);
      }
    } catch (err) {
      console.warn('[Backup] Falha ao gravar backup diário:', err.message);
    }
  }
  backupDiario();

  // Criação das Tabelas
  db.exec(`
    CREATE TABLE IF NOT EXISTS provas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      banca TEXT NOT NULL,
      ano INTEGER,
      orgao TEXT,
      cargo TEXT,
      total_paginas INTEGER,
      tamanho_caracteres INTEGER,
      texto TEXT,
      ativo INTEGER DEFAULT 1,
      is_padrao INTEGER DEFAULT 0,
      data_adicionado TEXT
    );

    CREATE TABLE IF NOT EXISTS simulados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_hora TEXT NOT NULL,
      disciplina TEXT NOT NULL,
      assunto TEXT,
      modo TEXT NOT NULL,
      total_questoes INTEGER NOT NULL,
      acertos INTEGER NOT NULL,
      erros INTEGER NOT NULL,
      taxa_acerto REAL NOT NULL,
      tempo_segundos INTEGER NOT NULL,
      tempo_medio_questao REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questoes_respondidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simulado_id INTEGER,
      questao_numero INTEGER,
      disciplina TEXT NOT NULL,
      assunto TEXT,
      dificuldade TEXT,
      origem TEXT,
      fonte TEXT,
      tipo_cognitivo TEXT DEFAULT 'SITUACAO_PROBLEMA',
      enunciado TEXT NOT NULL,
      texto_base TEXT,
      alternativas_json TEXT NOT NULL,
      gabarito TEXT NOT NULL,
      resposta_usuario TEXT,
      acertou INTEGER NOT NULL,
      dica TEXT,
      explicacao_json TEXT,
      tempo_segundos INTEGER,
      data_hora TEXT NOT NULL,
      FOREIGN KEY(simulado_id) REFERENCES simulados(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS caderno_erros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      questao_id INTEGER,
      disciplina TEXT NOT NULL,
      assunto TEXT,
      enunciado TEXT NOT NULL,
      alternativas_json TEXT NOT NULL,
      gabarito TEXT NOT NULL,
      explicacao_json TEXT,
      caixa_leitner INTEGER DEFAULT 1,
      total_tentativas INTEGER DEFAULT 1,
      total_acertos INTEGER DEFAULT 0,
      data_ultimo_erro TEXT NOT NULL,
      data_proxima_revisao TEXT NOT NULL,
      status TEXT DEFAULT 'PENDENTE',
      FOREIGN KEY(questao_id) REFERENCES questoes_respondidas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS banco_questoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash_enunciado TEXT UNIQUE,
      disciplina TEXT NOT NULL,
      assunto TEXT NOT NULL,
      sub_topico TEXT,
      banca TEXT DEFAULT 'Instituto AOCP',
      tipo TEXT DEFAULT 'inedita',
      dificuldade TEXT DEFAULT 'Média',
      enunciado TEXT NOT NULL,
      texto_base TEXT,
      alternativas_json TEXT NOT NULL,
      gabarito TEXT NOT NULL,
      dica TEXT,
      explicacao_json TEXT,
      palavras_chave TEXT,
      total_vezes_usada INTEGER DEFAULT 0,
      total_acertos INTEGER DEFAULT 0,
      total_erros INTEGER DEFAULT 0,
      ultima_data_resolucao TEXT,
      data_criacao TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_simulados_data ON simulados(data_hora);
    CREATE INDEX IF NOT EXISTS idx_questoes_disciplina ON questoes_respondidas(disciplina);
    CREATE INDEX IF NOT EXISTS idx_questoes_assunto ON questoes_respondidas(assunto);
    CREATE INDEX IF NOT EXISTS idx_leitner_revisao ON caderno_erros(data_proxima_revisao, status);
    CREATE INDEX IF NOT EXISTS idx_banco_disciplina ON banco_questoes(disciplina);
    CREATE INDEX IF NOT EXISTS idx_banco_assunto ON banco_questoes(assunto);
    CREATE INDEX IF NOT EXISTS idx_banco_uso ON banco_questoes(total_vezes_usada);

    CREATE TABLE IF NOT EXISTS questoes_provas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prova_id TEXT NOT NULL,
      numero INTEGER NOT NULL,
      disciplina TEXT NOT NULL,
      assunto TEXT,
      enunciado TEXT NOT NULL,
      alternativas_json TEXT NOT NULL,
      gabarito_oficial TEXT,
      vetor_json TEXT,
      data_criacao TEXT,
      FOREIGN KEY(prova_id) REFERENCES provas(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_qp_prova ON questoes_provas(prova_id);
    CREATE INDEX IF NOT EXISTS idx_qp_disciplina ON questoes_provas(disciplina);
  `);

  /* P0-PATCH-APLICADO */
  // Migrações idempotentes (rodam em todo start)
  function ensureColumn(table, column, ddl) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
  ensureColumn('questoes_provas', 'texto_base', 'TEXT');
  ensureColumn('questoes_provas', 'depende_de_texto', 'INTEGER DEFAULT 0');
  ensureColumn('questoes_provas', 'anulada', 'INTEGER DEFAULT 0');
  ensureColumn('questoes_provas', 'gabarito_fonte', 'TEXT');

  // Gabaritos oficiais ficam em tabela própria para sobreviver à reindexação das questões
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


  // ==========================================
  // MIGRAÇÕES v3: taxonomia, uso de questões reais, base legal, quarentena
  // ==========================================
  ensureColumn('questoes_provas', 'topico', 'TEXT');
  ensureColumn('questoes_provas', 'depende_de_figura', 'INTEGER DEFAULT 0');
  ensureColumn('questoes_respondidas', 'topico', 'TEXT');
  ensureColumn('banco_questoes', 'topico', 'TEXT');
  ensureColumn('banco_questoes', 'verificada', 'INTEGER DEFAULT 0');
  ensureColumn('caderno_erros', 'topico', 'TEXT');
  ensureColumn('caderno_erros', 'hash_enunciado', 'TEXT');
  ensureColumn('questoes_respondidas', 'marcou_duvida', 'INTEGER DEFAULT 0');
  ensureColumn('caderno_erros', 'origem_erro', "TEXT DEFAULT 'ERRO'");
  ensureColumn('base_conhecimento', 'topico', 'TEXT');
  ensureColumn('banco_questoes', 'fonte_legal', 'TEXT');
  ensureColumn('questoes_respondidas', 'fonte_legal', 'TEXT');
  ensureColumn('caderno_erros', 'fonte_legal', 'TEXT');
  ensureColumn('caderno_erros', 'anotacao', 'TEXT');
  ensureColumn('caderno_erros', 'tipo_armadilha', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS uso_questoes_provas (
      prova_id TEXT NOT NULL,
      numero INTEGER NOT NULL,
      vezes INTEGER DEFAULT 0,
      acertos INTEGER DEFAULT 0,
      erros INTEGER DEFAULT 0,
      ultima_data TEXT,
      PRIMARY KEY (prova_id, numero)
    );

    CREATE TABLE IF NOT EXISTS base_conhecimento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fonte TEXT NOT NULL,
      disciplina TEXT,
      topico TEXT,
      referencia TEXT NOT NULL,
      texto TEXT NOT NULL,
      vetor_json TEXT,
      data_criacao TEXT NOT NULL,
      UNIQUE (fonte, referencia)
    );
    CREATE INDEX IF NOT EXISTS idx_base_disciplina ON base_conhecimento(disciplina);
    CREATE INDEX IF NOT EXISTS idx_base_topico ON base_conhecimento(topico);

    CREATE TABLE IF NOT EXISTS quarentena_questoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      motivo TEXT NOT NULL,
      disciplina TEXT,
      enunciado TEXT,
      payload_json TEXT NOT NULL,
      data_criacao TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_caderno_hash ON caderno_erros(hash_enunciado);
    CREATE INDEX IF NOT EXISTS idx_qresp_topico ON questoes_respondidas(disciplina, topico);

    CREATE VIRTUAL TABLE IF NOT EXISTS base_conhecimento_fts USING fts5(
      chunk_id UNINDEXED,
      fonte,
      disciplina,
      topico,
      referencia,
      texto_norm
    );
  `);

  return { db, dbPath };
}
