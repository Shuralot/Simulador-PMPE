import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildTemaMatcher } from './lib/temaMatcher.mjs';
import { normalizeText, computeTFVector, calculateCosineSimilarity, vetorDe, construirIdf, rankCandidates, hashEnunciado } from './lib/texto.mjs';
import { extractQuestionsFromExam, construirVocabulario } from './lib/parserProvas.mjs';
import { classificarTopico, TOPICOS_EDITAL } from './lib/taxonomia.mjs';
import { validarQuestao } from './lib/validacaoQuestao.mjs';
import { parseGabaritoTexto } from './lib/gabarito.mjs';
import { chunkLei } from './lib/leis.mjs';
import { hojeLocal, somarDiasLocal } from './lib/tempo.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Configurações do Express
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Inicialização do Banco de Dados SQLite em disco
const dbPath = process.env.DB_PATH || path.join(__dirname, 'simulador.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

console.log(`[SQLite] Banco de dados inicializado em: ${dbPath}`);

// Backup diário automático (VACUUM INTO) antes de qualquer migração; mantém os 10 mais recentes
function backupDiario() {
  try {
    const dir = process.env.DB_PATH ? path.join(path.dirname(dbPath), 'backups') : path.join(__dirname, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, `simulador-${hojeLocal()}.db`);
    if (!fs.existsSync(destino)) {
      db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
      console.log(`[Backup] Cópia do banco gravada em ${destino}`);
    }
    const antigos = fs.readdirSync(dir).filter((f) => /^simulador-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(10);
    for (const f of antigos) fs.unlinkSync(path.join(dir, f));
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
    referencia TEXT NOT NULL,
    texto TEXT NOT NULL,
    vetor_json TEXT,
    data_criacao TEXT NOT NULL,
    UNIQUE (fonte, referencia)
  );
  CREATE INDEX IF NOT EXISTS idx_base_disciplina ON base_conhecimento(disciplina);

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
`);

// Backfill idempotente de tópicos canônicos e hashes
function backfillTopicos() {
  const upd = (tabela, extraCols) => {
    const rows = db.prepare(`SELECT id, disciplina, assunto, enunciado ${extraCols} FROM ${tabela} WHERE topico IS NULL OR topico = ''`).all();
    if (rows.length === 0) return;
    const stmt = db.prepare(`UPDATE ${tabela} SET topico = ? WHERE id = ?`);
    db.exec('BEGIN');
    for (const r of rows) stmt.run(classificarTopico(r.disciplina, r.assunto || '', r.enunciado || ''), r.id);
    db.exec('COMMIT');
  };
  upd('questoes_respondidas', '');
  upd('banco_questoes', '');
  upd('caderno_erros', '');
  const semHash = db.prepare("SELECT id, enunciado FROM caderno_erros WHERE hash_enunciado IS NULL").all();
  const h = db.prepare('UPDATE caderno_erros SET hash_enunciado = ? WHERE id = ?');
  for (const r of semHash) h.run(hashEnunciado(r.enunciado), r.id);
}
backfillTopicos();

function aplicarGabaritosOficiais() {
  db.prepare(`
    UPDATE questoes_provas SET
      gabarito_oficial = (SELECT CASE WHEN g.anulada = 1 THEN NULL ELSE g.letra END FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero),
      anulada = COALESCE((SELECT g.anulada FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero), 0),
      gabarito_fonte = (SELECT g.fonte FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero)
    WHERE EXISTS (SELECT 1 FROM gabaritos_oficiais g WHERE g.prova_id = questoes_provas.prova_id AND g.numero = questoes_provas.numero)
  `).run();
}

// ==========================================
// BUSCA, PARSER E INDEXAÇÃO (lógica pura em lib/)
// ==========================================

let corpusIdf = null;
function invalidarCorpus() { corpusIdf = null; }

// IDF calculado sobre TODO o corpus (provas + banco + base legal), não apenas sobre os candidatos filtrados
function getCorpusIdf() {
  if (!corpusIdf) {
    const vetores = [];
    for (const r of db.prepare('SELECT vetor_json FROM questoes_provas WHERE vetor_json IS NOT NULL').all()) vetores.push(vetorDe(r));
    for (const r of db.prepare('SELECT enunciado FROM banco_questoes').all()) vetores.push(computeTFVector(r.enunciado));
    for (const r of db.prepare('SELECT vetor_json FROM base_conhecimento').all()) vetores.push(vetorDe(r));
    corpusIdf = construirIdf(vetores);
  }
  return corpusIdf;
}

function rankCandidatesWithBM25AndMMR(queryText, candidates, maxItems = 6) {
  return rankCandidates(queryText, candidates, maxItems, getCorpusIdf());
}

function extractAndVectorizeExam(provaId, rawText, provaNome) {
  try {
    const vocab = construirVocabulario(db.prepare('SELECT texto FROM provas').all().map((r) => r.texto));
    const questoes = extractQuestionsFromExam(rawText, provaNome, { vocab });
    if (questoes.length === 0) return 0;

    const insertStmt = db.prepare(`
      INSERT INTO questoes_provas (
        prova_id, numero, disciplina, assunto, topico, enunciado, alternativas_json, vetor_json, data_criacao,
        texto_base, depende_de_texto, depende_de_figura
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const agora = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const q of questoes) {
        insertStmt.run(
          provaId, q.numero, q.disciplina, q.topico, q.topico, q.enunciado,
          JSON.stringify(q.alternativas), q.vetor_json, agora, q.texto_base,
          q.depende_de_texto, q.depende_de_figura
        );
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    aplicarGabaritosOficiais();
    invalidarCorpus();
    return questoes.length;
  } catch (err) {
    console.error(`[Item Parser] Erro ao extrair questões de ${provaNome}:`, err.message);
    return 0;
  }
}

const PARSER_VERSAO = '4';

function seedExamQuestions() {
  try {
    const contaminated = db.prepare(`
      SELECT COUNT(*) as count FROM questoes_provas
      WHERE enunciado LIKE '%Folha de Respostas%' OR enunciado LIKE '%Choose the correct%'
    `).get().count;

    const count = db.prepare('SELECT COUNT(*) as count FROM questoes_provas').get().count;
    const versaoParser = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'parser_versao'").get()?.valor;
    if (count === 0 || contaminated > 0 || versaoParser !== PARSER_VERSAO) {
      console.log('[Item Parser] Saneando e re-indexando questões das provas no SQLite...');
      db.prepare('DELETE FROM questoes_provas').run();
      const provas = db.prepare('SELECT id, nome, texto FROM provas').all();
      let total = 0;
      for (const p of provas) {
        const extraidas = extractAndVectorizeExam(p.id, p.texto, p.nome);
        console.log(`[Item Parser] ${extraidas} questões limpas e classificadas de ${p.nome}`);
        total += extraidas;
      }
      console.log(`[Item Parser] Total de ${total} questões reais saneadas no SQLite!`);
      db.prepare("INSERT INTO configuracoes (chave, valor) VALUES ('parser_versao', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(PARSER_VERSAO);
      aplicarGabaritosOficiais();
    }

    db.prepare(`
      UPDATE banco_questoes SET disciplina = 'Direitos Humanos e Legislação Extravagante'
      WHERE disciplina = 'Legislação Extravagante'
    `).run();
    db.prepare(`
      UPDATE banco_questoes SET disciplina = 'Raciocínio Lógico-Matemático'
      WHERE disciplina = 'Raciocínio Lógico'
    `).run();
  } catch (err) {
    console.error('[Item Parser] Erro na rotina de seed/saneamento:', err.message);
  }
}

const computeStatementHash = hashEnunciado;

function normalizeAlternativasArray(rawAlts) {
  let parsed = rawAlts;
  if (typeof rawAlts === 'string') {
    try { parsed = JSON.parse(rawAlts); } catch { parsed = []; }
  }
  if (Array.isArray(parsed)) {
    return parsed.map(item => ({
      letra: String(item.letra || 'A').trim().toUpperCase(),
      texto: String(item.texto || '').trim()
    }));
  }
  if (parsed && typeof parsed === 'object') {
    return ['A', 'B', 'C', 'D', 'E']
      .filter(k => parsed[k] !== undefined)
      .map(k => ({ letra: k, texto: String(parsed[k]).trim() }));
  }
  return [];
}

function normalizeExplicacaoObject(rawExp, gabarito) {
  let parsed = rawExp;
  if (typeof rawExp === 'string') {
    try { parsed = JSON.parse(rawExp); } catch { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};
  const correta = parsed.correta || parsed.por_que_correta || 'Alternativa em consonância com a legislação e jurisprudência da banca.';
  const rawDistratores = parsed.distratores || {};
  const distratores = {};
  for (const [letra, motivo] of Object.entries(rawDistratores)) {
    const up = letra.trim().toUpperCase();
    if (up !== String(gabarito || '').trim().toUpperCase() && motivo) {
      distratores[up] = motivo;
    }
  }
  return { correta, distratores };
}

// Popular banco inicial de questões se estiver vazio
function seedInitialQuestionBank() {
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM banco_questoes').get().count;
    if (count === 0) {
      const qPath = path.join(__dirname, 'src', 'data', 'initialQuestions.json');
      if (fs.existsSync(qPath)) {
        console.log('[SQLite] Populando Banco de Questões Permanente com questões de referência...');
        const questoes = JSON.parse(fs.readFileSync(qPath, 'utf8'));
        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO banco_questoes (
            hash_enunciado, disciplina, assunto, sub_topico, banca, tipo, dificuldade,
            enunciado, alternativas_json, gabarito, dica, explicacao_json,
            palavras_chave, data_criacao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const q of questoes) {
          const hash = computeStatementHash(q.enunciado);
          insertStmt.run(
            hash,
            q.disciplina || 'Língua Portuguesa',
            q.assunto || 'Geral',
            q.sub_topico || '',
            q.banca || 'Instituto AOCP',
            q.tipo || 'inedita',
            q.dificuldade || 'Média',
            q.enunciado,
            typeof q.alternativas === 'string' ? q.alternativas : JSON.stringify(q.alternativas),
            q.gabarito || q.resposta_correta || 'A',
            q.dica || '',
            typeof q.explicacao === 'string' ? q.explicacao : JSON.stringify(q.explicacao),
            q.palavras_chave || '',
            new Date().toISOString()
          );
        }
        console.log(`[SQLite] ${questoes.length} Questões iniciais salvas com sucesso em banco_questoes!`);
      }
    }
  } catch (err) {
    console.error('[SQLite] Erro ao popular banco de questões:', err.message);
  }
}

seedInitialQuestionBank();

// Função para popular provas iniciais caso a tabela esteja vazia
function seedInitialExams() {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM provas');
  const result = countStmt.get();
  
  if (result.count === 0) {
    const jsonPath = path.join(__dirname, 'src', 'data', 'initialExams.json');
    if (fs.existsSync(jsonPath)) {
      console.log('[SQLite] Populando tabela de provas com dados de referência...');
      const exams = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      
      const insertStmt = db.prepare(`
        INSERT INTO provas (id, nome, banca, ano, orgao, cargo, total_paginas, tamanho_caracteres, texto, ativo, is_padrao, data_adicionado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
      `);

      for (const ex of exams) {
        let orgao = 'PMPE';
        let cargo = 'Soldado';
        if (ex.id.includes('pmdf')) { orgao = 'PMDF'; cargo = 'Soldado'; }
        else if (ex.id.includes('pcgo')) { orgao = 'PC-GO'; cargo = 'Agente'; }

        insertStmt.run(
          ex.id,
          ex.nome,
          ex.banca || 'Instituto AOCP',
          ex.ano || 2024,
          orgao,
          cargo,
          ex.totalPaginas || 20,
          ex.tamanhoCaracteres || ex.texto.length,
          ex.texto,
          new Date().toISOString()
        );
      }
      console.log('[SQLite] 3 Provas oficiais iniciais gravadas com sucesso no SQLite!');
    }
  }
}

seedInitialExams();
seedExamQuestions();
backfillTopicos();

// ==========================================
// SANEAMENTO ÚNICO DO BANCO DE QUESTÕES (v1)
// - normaliza explicações antigas (por_que_correta -> correta)
// - remove do banco as questões que são cópia de questões das provas reais (evita aparecer duas vezes)
// - põe em quarentena as que não passam na validação ou têm erro de conteúdo comprovado
// ==========================================
const REVISAO_MANUAL_BANCO = [
  { prefixo: 'No contexto da restauração pernambucana e da resistência armada', motivo: 'Conteúdo histórico incorreto: a explicação atribui a Salvador Correia de Sá o governo de Pernambuco e descreve a Convenção de Beberibe de forma imprecisa; enunciado da alternativa D com erro de redação.' },
  { prefixo: 'No âmbito das medidas de proteção e socioeducativas aplicadas a adolescentes', motivo: 'Duas alternativas incorretas (C e E): o ECA admite internação por descumprimento reiterado e injustificável de medida anterior (art. 122, III), então a E também é falsa.' },
  { prefixo: 'A Lei nº 11.343/2006 institui o Sistema Nacional de Políticas Públicas on', motivo: 'Texto com erro de digitação, explicação contradiz o gabarito (diz que a IV está correta) e assertivas II/III baseadas em entendimento não pacificado.' }
];

function sanearBanco() {
  try {
    const feito = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'banco_saneado'").get()?.valor;
    if (feito === '1') return;

    const agora = new Date().toISOString();
    const quarentenaStmt = db.prepare('INSERT INTO quarentena_questoes (motivo, disciplina, enunciado, payload_json, data_criacao) VALUES (?, ?, ?, ?, ?)');
    const del = db.prepare('DELETE FROM banco_questoes WHERE id = ?');
    const updExp = db.prepare('UPDATE banco_questoes SET explicacao_json = ? WHERE id = ?');

    const relatorio = { normalizadas: 0, duplicadasDeProvas: 0, quarentena: 0 };
    const provasVec = db.prepare('SELECT enunciado FROM questoes_provas').all().map((p) => computeTFVector(p.enunciado));

    db.exec('BEGIN');
    try {
      for (const q of db.prepare('SELECT * FROM banco_questoes').all()) {
        // 1. explicação no formato novo
        let exp = {};
        try { exp = JSON.parse(q.explicacao_json || '{}'); } catch { exp = {}; }
        const normExp = normalizeExplicacaoObject(exp, q.gabarito);
        if (exp.correta === undefined || exp.por_que_correta !== undefined) {
          updExp.run(JSON.stringify(normExp), q.id);
          relatorio.normalizadas++;
        }

        // 2. cópia de questão de prova real
        const vec = computeTFVector(q.enunciado);
        const copia = provasVec.some((pv) => calculateCosineSimilarity(vec, pv) >= 0.85);
        if (copia) {
          del.run(q.id);
          relatorio.duplicadasDeProvas++;
          continue;
        }

        // 3. validação estrutural + revisão manual de conteúdo
        const manual = REVISAO_MANUAL_BANCO.find((r) => q.enunciado.startsWith(r.prefixo));
        const v = validarQuestao({ enunciado: q.enunciado, alternativas: normalizeAlternativasArray(q.alternativas_json), gabarito: q.gabarito, explicacao: normExp, textoBase: q.texto_base });
        const motivo = manual ? manual.motivo : (!v.ok ? v.erros.join(' ') : null);
        if (motivo) {
          quarentenaStmt.run(motivo, q.disciplina, q.enunciado, JSON.stringify(q), agora);
          del.run(q.id);
          relatorio.quarentena++;
        }
      }
      db.prepare("INSERT INTO configuracoes (chave, valor) VALUES ('banco_saneado', '1') ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    invalidarCorpus();
    console.log('[Saneamento] Banco de questões:', JSON.stringify(relatorio));
  } catch (err) {
    console.error('[Saneamento] Falha:', err.message);
  }
}
sanearBanco();

// Auditoria sob demanda: valida todo o banco e as provas
app.get('/api/banco/auditoria', (req, res) => {
  try {
    const problemas = [];
    for (const q of db.prepare('SELECT * FROM banco_questoes').all()) {
      const v = validarQuestao({ enunciado: q.enunciado, alternativas: normalizeAlternativasArray(q.alternativas_json), gabarito: q.gabarito, explicacao: normalizeExplicacaoObject(q.explicacao_json, q.gabarito) });
      if (!v.ok) problemas.push({ origem: 'banco', id: q.id, erros: v.erros });
    }
    const total = db.prepare('SELECT COUNT(*) c FROM banco_questoes').get().c;
    const quarentena = db.prepare('SELECT COUNT(*) c FROM quarentena_questoes').get().c;
    res.json({ totalBanco: total, emQuarentena: quarentena, problemas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

db.prepare("UPDATE banco_questoes SET tipo = 'REAL' WHERE tipo NOT IN ('INÉDITA','REAL') AND tipo LIKE '%real%'").run();
db.prepare("UPDATE banco_questoes SET tipo = 'INÉDITA' WHERE tipo NOT IN ('INÉDITA','REAL')").run();
aplicarGabaritosOficiais();

// ==========================================
// ROTAS DA API: PROVAS E BANCO DE DADOS
// ==========================================

// Listar todas as provas com contagem de questões reais extraídas
app.get('/api/provas', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT p.id, p.nome, p.banca, p.ano, p.orgao, p.cargo, p.total_paginas, p.tamanho_caracteres, p.ativo, p.is_padrao, p.data_adicionado,
             (SELECT COUNT(*) FROM questoes_provas qp WHERE qp.prova_id = p.id) as total_questoes,
             (SELECT COUNT(*) FROM questoes_provas qp WHERE qp.prova_id = p.id AND (qp.gabarito_oficial IS NOT NULL OR qp.anulada = 1)) as total_gabaritadas
      FROM provas p
      ORDER BY p.is_padrao DESC, p.ano DESC
    `);
    const rows = stmt.all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Adicionar nova prova (fatia e vetoriza automaticamente via Similaridade de Cosseno)
app.post('/api/provas', (req, res) => {
  try {
    const { id, nome, banca, ano, orgao, cargo, total_paginas, tamanho_caracteres, texto } = req.body;
    const examId = id || 'prova_' + Date.now();
    const examNome = nome || 'Nova Prova';

    const stmt = db.prepare(`
      INSERT INTO provas (id, nome, banca, ano, orgao, cargo, total_paginas, tamanho_caracteres, texto, ativo, is_padrao, data_adicionado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
    `);

    stmt.run(
      examId,
      examNome,
      banca || 'Instituto AOCP',
      ano || new Date().getFullYear(),
      orgao || 'Segurança Pública',
      cargo || 'Soldado / Agente',
      total_paginas || 1,
      tamanho_caracteres || (texto ? texto.length : 0),
      texto || '',
      new Date().toISOString()
    );

    // Fatiamento semântico e vetorização por Cosseno imediata
    let extraidas = 0;
    if (texto && texto.length > 500) {
      extraidas = extractAndVectorizeExam(examId, texto, examNome);
    }

    res.json({ 
      success: true, 
      message: `Prova gravada e ${extraidas} questões atômicas vetorizadas com sucesso no SQLite!`,
      totalQuestoes: extraidas
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alternar status ativo/inativo
app.patch('/api/provas/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('UPDATE provas SET ativo = CASE WHEN ativo = 1 THEN 0 ELSE 1 END WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar prova e suas questões associadas
app.delete('/api/provas/:id', (req, res) => {
  try {
    const { id } = req.params;
    const checkStmt = db.prepare('SELECT is_padrao FROM provas WHERE id = ?');
    const prova = checkStmt.get(id);
    if (prova && prova.is_padrao) {
      return res.status(400).json({ error: 'Provas oficiais de referência não podem ser excluídas.' });
    }
    db.prepare('DELETE FROM questoes_provas WHERE prova_id = ?').run(id);
    db.prepare('DELETE FROM gabaritos_oficiais WHERE prova_id = ?').run(id);
    db.prepare('DELETE FROM provas WHERE id = ?').run(id);
    invalidarCorpus();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Busca Semântica em Tempo Real por Similaridade de Cosseno + BM25/MMR (Zero IA / Offline)
app.post('/api/provas/busca-cosseno', (req, res) => {
  try {
    const { query = '', disciplina, limite = 6 } = req.body;
    if (!query.trim()) {
      return res.json({ questoes: [] });
    }

    let sql = `
      SELECT qp.*, p.nome as prova_nome, p.banca, p.ano
      FROM questoes_provas qp
      JOIN provas p ON p.id = qp.prova_id
      WHERE p.ativo = 1 AND qp.disciplina != 'Fora do Edital PMPE'
        AND COALESCE(qp.anulada, 0) = 0
        AND NOT (COALESCE(qp.depende_de_texto, 0) = 1 AND qp.texto_base IS NULL)
        AND COALESCE(qp.depende_de_figura, 0) = 0
    `;
    const params = [];
    if (disciplina) {
      sql += " AND (qp.disciplina = ? OR qp.disciplina = 'Conhecimentos Gerais')";
      params.push(disciplina);
    }

    const candidates = db.prepare(sql).all(...params);
    const ranked = rankCandidatesWithBM25AndMMR(query, candidates, Number(limite) || 6);

    const formatted = ranked.map(({ q, cosseno }) => ({
      id: q.id,
      numero: q.numero,
      disciplina: q.disciplina,
      prova_nome: q.prova_nome,
      banca: q.banca,
      ano: q.ano,
      enunciado: q.enunciado,
      alternativas: typeof q.alternativas_json === 'string' ? JSON.parse(q.alternativas_json) : q.alternativas_json,
      cosseno
    }));

    res.json({ questoes: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Importa/atualiza o gabarito oficial de uma prova a partir de texto colado (ex: "1-A 2-B ... 40-X") ou JSON
app.post('/api/provas/:id/gabarito', (req, res) => {
  try {
    const { id } = req.params;
    const { texto, fonte } = req.body || {};
    const prova = db.prepare('SELECT id FROM provas WHERE id = ?').get(id);
    if (!prova) return res.status(404).json({ error: 'Prova não encontrada.' });

    const mapa = parseGabaritoTexto(texto);
    const numeros = Object.keys(mapa).map(Number);
    if (numeros.length === 0) return res.status(400).json({ error: 'Nenhum item de gabarito reconhecido. Use o formato "1-A 2-B 3-C ..." (X = anulada).' });

    const ins = db.prepare('INSERT OR REPLACE INTO gabaritos_oficiais (prova_id, numero, letra, anulada, fonte, data_importacao) VALUES (?,?,?,?,?,?)');
    const agora = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const n of numeros) ins.run(id, n, mapa[n], mapa[n] === 'X' ? 1 : 0, fonte || 'Importado manualmente', agora);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    aplicarGabaritosOficiais();

    const totalQ = db.prepare('SELECT COUNT(*) c FROM questoes_provas WHERE prova_id = ?').get(id).c;
    const semMatch = db.prepare('SELECT COUNT(*) c FROM questoes_provas WHERE prova_id = ? AND gabarito_oficial IS NULL AND anulada = 0').get(id).c;
    res.json({ success: true, itensLidos: numeros.length, totalQuestoes: totalQ, questoesSemGabarito: semMatch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Relatório de qualidade da extração das provas (gabarito, texto-base, contaminação)
app.get('/api/provas/qualidade', (req, res) => {
  try {
    const provas = db.prepare('SELECT id, nome FROM provas ORDER BY id').all();
    const out = provas.map((p) => {
      const q = db.prepare('SELECT * FROM questoes_provas WHERE prova_id = ?').all(p.id);
      return {
        prova_id: p.id,
        nome: p.nome,
        total: q.length,
        com_gabarito: q.filter((x) => x.gabarito_oficial || x.anulada === 1).length,
        anuladas: q.filter((x) => x.anulada === 1).length,
        com_texto_base: q.filter((x) => x.texto_base).length,
        dependem_de_texto_sem_base: q.filter((x) => x.depende_de_texto === 1 && !x.texto_base).length,
        dependem_de_figura: q.filter((x) => x.depende_de_figura === 1).length,
        sem_gabarito: q.filter((x) => !x.gabarito_oficial && x.anulada !== 1).length,
        fora_do_edital: q.filter((x) => x.disciplina === 'Fora do Edital PMPE').length,
        por_topico: Object.fromEntries(Object.entries(q.reduce((acc, x) => { const k = x.topico || 'Sem tópico'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1])),
        alternativa_e_maior_400: q.filter((x) => { try { return (JSON.parse(x.alternativas_json).E || '').length > 400; } catch { return true; } }).length
      };
    });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contexto para a IA: itens reais da banca (estilo), trechos de legislação (fonte primária) e memória anti-repetição
app.get('/api/provas/contexto', (req, res) => {
  try {
    const { disciplina = '', disciplinas = '', assunto = '', limite = 6 } = req.query;
    const listaDisciplinas = (disciplinas || disciplina).split(',').map(d => d.trim()).filter(Boolean);

    // Consulta enriquecida: assunto + tópicos do edital que casam com o assunto
    const topicosRelacionados = listaDisciplinas.map((d) => classificarTopico(d, assunto, '')).filter((t) => t !== 'Outros');
    const searchPhrase = [...listaDisciplinas, assunto, assunto, ...topicosRelacionados].join(' ').trim();

    let sql = `
      SELECT qp.*, p.nome as prova_nome, p.banca, p.ano
      FROM questoes_provas qp
      JOIN provas p ON p.id = qp.prova_id
      WHERE p.ativo = 1 AND qp.disciplina != 'Fora do Edital PMPE'
        AND COALESCE(qp.anulada, 0) = 0
        AND NOT (COALESCE(qp.depende_de_texto, 0) = 1 AND qp.texto_base IS NULL)
        AND COALESCE(qp.depende_de_figura, 0) = 0
    `;
    const params = [];
    if (listaDisciplinas.length > 0) {
      sql += ` AND qp.disciplina IN (${listaDisciplinas.map(() => '?').join(',')})`;
      params.push(...listaDisciplinas);
    }
    const candidateQuestions = db.prepare(sql).all(...params);

    // Anti-repetição: questões do banco relacionadas ao tema (por similaridade) + as mais recentes da disciplina
    let sqlBanco = 'SELECT id, assunto, enunciado FROM banco_questoes WHERE 1=1';
    const paramsBanco = [];
    if (listaDisciplinas.length > 0) {
      sqlBanco += ` AND disciplina IN (${listaDisciplinas.map(() => '?').join(',')})`;
      paramsBanco.push(...listaDisciplinas);
    }
    const doBanco = db.prepare(sqlBanco).all(...paramsBanco);
    const relacionadas = rankCandidatesWithBM25AndMMR(searchPhrase, doBanco, 10).map((r) => r.q);
    const recentes = [...doBanco].sort((a, b) => b.id - a.id).slice(0, 8);
    const vistos = new Set();
    const evitar = [];
    for (const r of [...relacionadas, ...recentes]) {
      if (vistos.has(r.id)) continue;
      vistos.add(r.id);
      evitar.push(r);
    }
    // Também evita o que o aluno respondeu há pouco tempo
    let sqlResp = 'SELECT assunto, enunciado FROM questoes_respondidas WHERE 1=1';
    if (listaDisciplinas.length > 0) sqlResp += ` AND disciplina IN (${listaDisciplinas.map(() => '?').join(',')})`;
    sqlResp += ' ORDER BY id DESC LIMIT 12';
    for (const r of db.prepare(sqlResp).all(...(listaDisciplinas.length > 0 ? listaDisciplinas : []))) {
      evitar.push({ id: 'r' + evitar.length, assunto: r.assunto, enunciado: r.enunciado });
    }

    // Rodízio de tópicos: sugere os menos praticados (respondidas + já no banco) para a IA não girar sempre em torno dos mesmos
    const topicosSugeridos = {};
    for (const d of (listaDisciplinas.length > 0 ? listaDisciplinas : Object.keys(TOPICOS_EDITAL))) {
      if (!TOPICOS_EDITAL[d]) continue;
      const contagem = {};
      for (const r of db.prepare("SELECT topico, COUNT(*) n FROM questoes_respondidas WHERE disciplina = ? GROUP BY topico").all(d)) contagem[r.topico] = (contagem[r.topico] || 0) + r.n;
      for (const r of db.prepare("SELECT topico, COUNT(*) n FROM banco_questoes WHERE disciplina = ? GROUP BY topico").all(d)) contagem[r.topico] = (contagem[r.topico] || 0) + r.n;
      topicosSugeridos[d] = TOPICOS_EDITAL[d]
        .map((t) => ({ topico: t.topico, n: contagem[t.topico] || 0, r: Math.random() }))
        .sort((a, b) => a.n - b.n || a.r - b.r)
        .slice(0, 8)
        .map((t) => t.topico);
    }

    const evitarRepeticao = evitar.map((r, i) => `${i + 1}. [${r.assunto}] ${String(r.enunciado).slice(0, 160)}...`).join('\n');

    // Base legal: trechos de lei mais relevantes ao assunto
    let sqlLei = 'SELECT id, fonte, referencia, texto, vetor_json, disciplina FROM base_conhecimento';
    const paramsLei = [];
    if (listaDisciplinas.length > 0) {
      sqlLei += ` WHERE disciplina IS NULL OR disciplina IN (${listaDisciplinas.map(() => '?').join(',')})`;
      paramsLei.push(...listaDisciplinas);
    }
    const candLei = db.prepare(sqlLei).all(...paramsLei);
    let baseLegal = '';
    let trechosLegais = [];
    if (candLei.length > 0 && assunto) {
      const topLei = rankCandidatesWithBM25AndMMR(searchPhrase, candLei, 6).filter((t) => t.cosseno > 0.05);
      trechosLegais = topLei.map((t) => ({ fonte: t.q.fonte, referencia: t.q.referencia }));
      baseLegal = topLei
        .map((t) => `[${t.q.fonte} — ${t.q.referencia}]\n${String(t.q.texto).slice(0, 1500)}`)
        .join('\n\n');
    }

    if (candidateQuestions.length === 0) {
      return res.json({ snippets: '', evitarRepeticao, baseLegal, trechosLegais, topicosSugeridos, topScores: [] });
    }

    const maxItems = Math.max(3, Math.min(12, Number(limite) || 6));
    const topItems = rankCandidatesWithBM25AndMMR(searchPhrase, candidateQuestions, maxItems);

    // Cada item é montado inteiro para o cliente poder truncar apenas em fronteiras de item
    const itens = topItems.map((item) => {
      const q = item.q;
      const alts = typeof q.alternativas_json === 'string' ? JSON.parse(q.alternativas_json) : q.alternativas_json;
      return `[ITEM REAL DA BANCA ${q.banca.toUpperCase()} (PROVA: ${q.prova_nome} - QUESTÃO ${q.numero} - TÓPICO: ${q.topico || q.disciplina} - RELEVÂNCIA: ${item.cosseno.toFixed(2)})]
Disciplina: ${q.disciplina}
${q.texto_base ? `Texto-base: ${q.texto_base.slice(0, 1200)}\n` : ''}Enunciado Oficial: ${q.enunciado}
Alternativas da Banca:
(A) ${alts.A || ''}
(B) ${alts.B || ''}
(C) ${alts.C || ''}
(D) ${alts.D || ''}
(E) ${alts.E || ''}
Gabarito Oficial: ${q.gabarito_oficial || 'não disponível'}`;
    });

    res.json({
      snippets: itens.join('\n\n'),
      itens,
      evitarRepeticao,
      baseLegal,
      trechosLegais,
      topicosSugeridos,
      topScores: topItems.map(t => ({ questao: t.q.numero, cosseno: t.cosseno }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ingestão de legislação/edital na base de conhecimento (fatiada por artigo/súmula)
app.post('/api/base/ingerir', (req, res) => {
  try {
    const { fonte, disciplina = null, texto } = req.body || {};
    if (!fonte || !String(fonte).trim()) return res.status(400).json({ error: 'Informe a fonte (ex: "Constituição Federal de 1988").' });
    if (!texto || String(texto).trim().length < 50) return res.status(400).json({ error: 'Texto vazio ou curto demais.' });

    const chunks = chunkLei(texto);
    const ins = db.prepare(`
      INSERT INTO base_conhecimento (fonte, disciplina, referencia, texto, vetor_json, data_criacao)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fonte, referencia) DO UPDATE SET texto = excluded.texto, vetor_json = excluded.vetor_json, disciplina = excluded.disciplina
    `);
    const agora = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const c of chunks) {
        ins.run(String(fonte).trim(), disciplina, c.referencia, c.texto, JSON.stringify(computeTFVector(`${c.referencia} ${c.texto}`)), agora);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    invalidarCorpus();
    res.json({ success: true, trechos: chunks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/base/stats', (req, res) => {
  try {
    res.json(db.prepare('SELECT fonte, disciplina, COUNT(*) as trechos FROM base_conhecimento GROUP BY fonte, disciplina ORDER BY fonte').all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/base/:fonte', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM base_conhecimento WHERE fonte = ?').run(req.params.fonte);
    invalidarCorpus();
    res.json({ success: true, removidos: r.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DA API: SIMULADOS E CADERNO DE ERROS
// ==========================================

// Salvar resultado do simulado completo
app.post('/api/simulados', (req, res) => {
  try {
    const { 
      disciplina, 
      assunto, 
      modo, 
      total_questoes, 
      acertos, 
      erros, 
      tempo_segundos, 
      questoes 
    } = req.body;

    const taxa = total_questoes > 0 ? (acertos / total_questoes) * 100 : 0;
    const tempoMedio = total_questoes > 0 ? tempo_segundos / total_questoes : 0;
    const dataHora = new Date().toISOString();

    // 1. Insere o simulado
    const insertSimulado = db.prepare(`
      INSERT INTO simulados (data_hora, disciplina, assunto, modo, total_questoes, acertos, erros, taxa_acerto, tempo_segundos, tempo_medio_questao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertSimulado.run(
      dataHora,
      disciplina || 'Geral',
      assunto || 'Tópicos variados',
      modo || 'estudo',
      total_questoes,
      acertos,
      erros,
      taxa,
      tempo_segundos,
      tempoMedio
    );

    // Recupera o ID do simulado inserido
    const lastIdStmt = db.prepare('SELECT last_insert_rowid() as id');
    const simuladoId = lastIdStmt.get().id;

    // 2. Insere cada questão respondida
    const insertQuestao = db.prepare(`
      INSERT INTO questoes_respondidas (
        simulado_id, questao_numero, disciplina, assunto, topico, dificuldade, origem, fonte,
        tipo_cognitivo, enunciado, texto_base, alternativas_json, gabarito,
        resposta_usuario, acertou, marcou_duvida, dica, explicacao_json, tempo_segundos, data_hora
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 3. Caderno de Erros (Leitner). Erro => Caixa 1 (+1 dia). Acerto marcado como dúvida => Caixa 2 (+3 dias), sem punir.
    const insertErro = db.prepare(`
      INSERT INTO caderno_erros (
        questao_id, disciplina, assunto, topico, enunciado, hash_enunciado, alternativas_json, gabarito,
        explicacao_json, caixa_leitner, total_tentativas, total_acertos, data_ultimo_erro,
        data_proxima_revisao, status, origem_erro
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'PENDENTE', ?)
    `);
    const checkErroExistente = db.prepare(`
      SELECT id, caixa_leitner FROM caderno_erros WHERE hash_enunciado = ? OR enunciado = ? LIMIT 1
    `);
    const resetErroExistente = db.prepare(`
      UPDATE caderno_erros
      SET caixa_leitner = 1,
          total_tentativas = total_tentativas + 1,
          data_ultimo_erro = ?,
          data_proxima_revisao = ?,
          status = 'PENDENTE',
          origem_erro = 'ERRO'
      WHERE id = ?
    `);
    const amanha = somarDiasLocal(1);
    const em3Dias = somarDiasLocal(3);

    db.exec('BEGIN');
    try {
      for (let i = 0; i < questoes.length; i++) {
        const q = questoes[i];
        const acertou = q.respostaUsuario === q.gabarito ? 1 : 0;
        const duvida = q.marcouDuvida ? 1 : 0;
        const normAlts = normalizeAlternativasArray(q.alternativas);
        const normExp = normalizeExplicacaoObject(q.explicacao, q.gabarito);
        const discQ = q.disciplina || disciplina || 'Geral';
        const topicoQ = q.topico || classificarTopico(discQ, q.assunto || assunto || '', q.enunciado || '');
        const tempoQuestao = typeof q.tempoSegundos === 'number' && q.tempoSegundos > 0
          ? Math.round(q.tempoSegundos)
          : Math.round(tempoMedio);

        const resQ = insertQuestao.run(
          simuladoId,
          i + 1,
          discQ,
          q.assunto || assunto || 'Geral',
          topicoQ,
          q.dificuldade || 'Média',
          (q.origem || q.tipo || 'INÉDITA').toUpperCase().includes('REAL') ? 'REAL' : 'INÉDITA',
          q.fonte || 'Banca Instituto AOCP',
          q.tipoCognitivo || 'SITUACAO_PROBLEMA',
          q.enunciado || '',
          q.textoBase || q.texto_base || null,
          JSON.stringify(normAlts),
          q.gabarito || '',
          q.respostaUsuario || null,
          acertou,
          duvida,
          q.dica || null,
          JSON.stringify(normExp),
          tempoQuestao,
          dataHora
        );

        if ((!acertou || duvida) && q.enunciado) {
          const hash = hashEnunciado(q.enunciado);
          const existente = checkErroExistente.get(hash, q.enunciado);
          if (existente) {
            // Só um erro de fato derruba o cartão para a Caixa 1; dúvida acertada não mexe no progresso
            if (!acertou) resetErroExistente.run(dataHora, amanha, existente.id);
          } else {
            insertErro.run(
              Number(resQ.lastInsertRowid),
              discQ,
              q.assunto || assunto || 'Geral',
              topicoQ,
              q.enunciado || '',
              hash,
              JSON.stringify(normAlts),
              q.gabarito || '',
              JSON.stringify(normExp),
              acertou ? 2 : 1,
              acertou ? 1 : 0,
              dataHora,
              acertou ? em3Dias : amanha,
              acertou ? 'DUVIDA' : 'ERRO'
            );
          }
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ success: true, simuladoId, taxaAcerto: Math.round(taxa) });
  } catch (err) {
    console.error('Erro ao salvar simulado:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar todos os simulados registrados
app.get('/api/simulados', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, data_hora, disciplina, assunto, modo, total_questoes, acertos, erros, taxa_acerto, tempo_segundos, tempo_medio_questao
      FROM simulados
      ORDER BY id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir um simulado específico e limpar suas métricas
app.delete('/api/simulados/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // O caderno de erros (Leitner) é independente do histórico: apagar o simulado só desvincula os cartões
    db.prepare('UPDATE caderno_erros SET questao_id = NULL WHERE questao_id IN (SELECT id FROM questoes_respondidas WHERE simulado_id = ?)').run(id);
    db.prepare('DELETE FROM questoes_respondidas WHERE simulado_id = ?').run(id);
    const resDel = db.prepare('DELETE FROM simulados WHERE id = ?').run(id);

    res.json({ success: true, deleted: resDel.changes });
  } catch (err) {
    console.error('Erro ao excluir simulado:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excluir todos os simulados (zerar histórico de testes)
app.delete('/api/simulados', (req, res) => {
  try {
    db.exec(`
      DELETE FROM caderno_erros;
      DELETE FROM questoes_respondidas;
      DELETE FROM simulados;
    `);
    res.json({ success: true, message: 'Todos os simulados foram excluídos com sucesso.' });
  } catch (err) {
    console.error('Erro ao limpar simulados:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar questões do Caderno de Erros (Repetição Espaçada)
app.get('/api/caderno-erros', (req, res) => {
  try {
    const hoje = hojeLocal();
    const { apenasHoje } = req.query;

    let query = "SELECT * FROM caderno_erros WHERE status = 'PENDENTE'";
    const params = [];
    if (apenasHoje === 'true') {
      query += ' AND data_proxima_revisao <= ?';
      params.push(hoje);
    }
    query += ' ORDER BY caixa_leitner ASC, data_proxima_revisao ASC';

    const rows = db.prepare(query).all(...params);
    const parsed = rows.map(r => ({
      ...r,
      alternativas: normalizeAlternativasArray(r.alternativas_json),
      explicacao: normalizeExplicacaoObject(r.explicacao_json, r.gabarito)
    }));

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Responder questão no Caderno de Erros (Atualiza Caixa Leitner)
app.post('/api/caderno-erros/:id/revisar', (req, res) => {
  try {
    const { id } = req.params;
    const { acertou } = req.body;

    const row = db.prepare('SELECT * FROM caderno_erros WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Questão não encontrada no caderno de erros.' });

    let novaCaixa = row.caixa_leitner;
    let novoStatus = 'PENDENTE';
    let diasProximaRevisao = 1;

    if (acertou) {
      novaCaixa += 1;
      // Intervalos da Curva do Esquecimento (Leitner)
      if (novaCaixa === 2) diasProximaRevisao = 3;      // 3 dias
      else if (novaCaixa === 3) diasProximaRevisao = 7; // 7 dias
      else if (novaCaixa === 4) diasProximaRevisao = 15; // 15 dias
      else if (novaCaixa >= 5) {
        novoStatus = 'DOMINADA';
        diasProximaRevisao = 30;
      }
    } else {
      // Se errou na revisão, volta para a Caixa 1 (Revisar em 1 dia)
      novaCaixa = 1;
      diasProximaRevisao = 1;
    }

    const proximaStr = somarDiasLocal(diasProximaRevisao);

    const updateStmt = db.prepare(`
      UPDATE caderno_erros 
      SET caixa_leitner = ?, 
          total_tentativas = total_tentativas + 1,
          total_acertos = total_acertos + ?,
          data_proxima_revisao = ?,
          status = ?
      WHERE id = ?
    `);

    updateStmt.run(
      novaCaixa,
      acertou ? 1 : 0,
      proximaStr,
      novoStatus,
      id
    );

    res.json({ 
      success: true, 
      novaCaixa, 
      status: novoStatus, 
      proximaRevisao: proximaStr 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DA API: ANALYTICS & KPIS DE ESTUDO
// ==========================================

app.get('/api/desempenho', (req, res) => {
  try {
    const simuladosCount = db.prepare('SELECT COUNT(*) as count FROM simulados').get().count;
    const globalStats = db.prepare(`
      SELECT
        COUNT(id) as total_questoes,
        SUM(CASE WHEN acertou = 1 THEN 1 ELSE 0 END) as total_acertos,
        ROUND((SUM(CASE WHEN acertou = 1 THEN 1.0 ELSE 0.0 END) / MAX(1, COUNT(id))) * 100, 1) as taxa_real,
        AVG(tempo_segundos) as tempo_medio_questao,
        SUM(CASE WHEN acertou = 0 AND tempo_segundos < 30 THEN 1 ELSE 0 END) as erros_impulsividade,
        SUM(CASE WHEN tempo_segundos > 210 THEN 1 ELSE 0 END) as questoes_lentas,
        SUM(CASE WHEN marcou_duvida = 1 THEN 1 ELSE 0 END) as total_duvidas,
        SUM(CASE WHEN marcou_duvida = 1 AND acertou = 1 THEN 1 ELSE 0 END) as acertos_com_duvida,
        SUM(CASE WHEN COALESCE(marcou_duvida, 0) = 0 AND acertou = 0 THEN 1 ELSE 0 END) as erros_com_confianca
      FROM questoes_respondidas
    `).get();

    const disciplinaStats = db.prepare(`
      SELECT
        disciplina,
        COUNT(id) as total,
        SUM(CASE WHEN acertou = 1 THEN 1 ELSE 0 END) as acertos,
        ROUND((SUM(CASE WHEN acertou = 1 THEN 1.0 ELSE 0.0 END) / COUNT(id)) * 100, 1) as taxa,
        ROUND(AVG(tempo_segundos), 0) as tempo_medio
      FROM questoes_respondidas
      GROUP BY disciplina
      ORDER BY taxa ASC
    `).all();

    // Tendência: últimas 20 respostas da disciplina vs. as 20 anteriores
    const respostas = db.prepare('SELECT disciplina, acertou FROM questoes_respondidas ORDER BY id DESC LIMIT 3000').all();
    const porDisc = {};
    for (const r of respostas) (porDisc[r.disciplina] ||= []).push(r.acertou);
    const taxaDe = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 10 : null);
    for (const d of disciplinaStats) {
      const arr = porDisc[d.disciplina] || [];
      const recente = arr.slice(0, 20);
      const anterior = arr.slice(20, 40);
      d.taxa_recente = taxaDe(recente);
      d.tendencia = recente.length >= 10 && anterior.length >= 10 ? Math.round((taxaDe(recente) - taxaDe(anterior)) * 10) / 10 : null;
    }

    // Tópicos canônicos do edital (em vez do texto livre que a IA inventa em "assunto")
    const assuntoStats = db.prepare(`
      SELECT
        disciplina,
        COALESCE(NULLIF(topico, ''), assunto) as assunto,
        COUNT(id) as total,
        SUM(CASE WHEN acertou = 1 THEN 1 ELSE 0 END) as acertos,
        SUM(CASE WHEN acertou = 0 THEN 1 ELSE 0 END) as erros,
        ROUND((SUM(CASE WHEN acertou = 1 THEN 1.0 ELSE 0.0 END) / COUNT(id)) * 100, 1) as taxa,
        ROUND(AVG(tempo_segundos), 0) as tempo_medio
      FROM questoes_respondidas
      WHERE COALESCE(NULLIF(topico, ''), assunto) IS NOT NULL
      GROUP BY disciplina, COALESCE(NULLIF(topico, ''), assunto)
      HAVING total >= 2
      ORDER BY taxa ASC
    `).all();

    const pontosFortes = assuntoStats.filter(a => a.taxa >= 75);
    const emAlerta = assuntoStats.filter(a => a.taxa >= 60 && a.taxa < 75);
    const zonasCriticas = assuntoStats.filter(a => a.taxa < 60 || a.erros >= 3);

    const origemStats = db.prepare(`
      SELECT
        UPPER(COALESCE(origem, 'INÉDITA')) as origem,
        COUNT(id) as total,
        SUM(CASE WHEN acertou = 1 THEN 1 ELSE 0 END) as acertos,
        ROUND((SUM(CASE WHEN acertou = 1 THEN 1.0 ELSE 0.0 END) / COUNT(id)) * 100, 1) as taxa
      FROM questoes_respondidas
      GROUP BY UPPER(COALESCE(origem, 'INÉDITA'))
    `).all();

    const limiteEvolucao = Math.max(5, Math.min(200, Number(req.query.limite) || 30));
    const evolucao = db.prepare(`
      SELECT id, data_hora, disciplina, assunto, modo, total_questoes, acertos,
             ROUND(taxa_acerto, 1) as taxa_acerto, tempo_segundos, ROUND(tempo_medio_questao, 0) as tempo_medio_questao
      FROM simulados ORDER BY id DESC LIMIT ?
    `).all(limiteEvolucao).reverse();

    const hoje = hojeLocal();
    const leitnerStats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'PENDENTE' AND data_proxima_revisao <= ? THEN 1 END) as pendentes_hoje,
        COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as total_pendentes,
        COUNT(CASE WHEN status = 'DOMINADA' THEN 1 END) as total_dominadas,
        COUNT(CASE WHEN status = 'PENDENTE' AND caixa_leitner = 1 THEN 1 END) as caixa_1,
        COUNT(CASE WHEN status = 'PENDENTE' AND caixa_leitner = 2 THEN 1 END) as caixa_2,
        COUNT(CASE WHEN status = 'PENDENTE' AND caixa_leitner = 3 THEN 1 END) as caixa_3,
        COUNT(CASE WHEN status = 'PENDENTE' AND caixa_leitner = 4 THEN 1 END) as caixa_4
      FROM caderno_erros
    `).get(hoje);

    const ultimosErros = db.prepare(`
      SELECT disciplina, COALESCE(NULLIF(topico, ''), assunto) as assunto, tipo_cognitivo, resposta_usuario, gabarito, tempo_segundos
      FROM questoes_respondidas WHERE acertou = 0 ORDER BY id DESC LIMIT 10
    `).all();

    // Nota projetada PMPE (60 questões = 10 por matéria): taxa suavizada por prior bayesiano + intervalo de Wilson (90%)
    const DISCS = ['Língua Portuguesa', 'História de Pernambuco', 'Raciocínio Lógico-Matemático', 'Informática', 'Direito Constitucional', 'Direitos Humanos e Legislação Extravagante'];
    const mapa = Object.fromEntries(disciplinaStats.map(d => [d.disciplina, d]));
    const totalResp = globalStats.total_questoes || 0;
    const p0 = totalResp > 0 ? (globalStats.total_acertos || 0) / totalResp : 0.5;
    const PRIOR = 8;
    const Z = 1.645;
    const porDisciplinaNota = DISCS.map((disc) => {
      const d = mapa[disc];
      const n = d ? d.total : 0;
      const k = d ? d.acertos : 0;
      const pHat = (k + PRIOR * p0) / (n + PRIOR);
      let min = 0, max = 1;
      if (n > 0) {
        const p = k / n;
        const den = 1 + (Z * Z) / n;
        const centro = (p + (Z * Z) / (2 * n)) / den;
        const marg = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / den;
        min = Math.max(0, centro - marg);
        max = Math.min(1, centro + marg);
      }
      return { disciplina: disc, n, nota: Number((pHat * 10).toFixed(1)), min: Number((min * 10).toFixed(1)), max: Number((max * 10).toFixed(1)), semDados: n === 0 };
    });
    const soma = (campo, ids) => Number(ids.reduce((acc, i) => acc + porDisciplinaNota[i][campo], 0).toFixed(1));
    const bloco1 = soma('nota', [0, 1]);
    const bloco2 = soma('nota', [2, 3]);
    const bloco3 = soma('nota', [4, 5]);
    const notaTotal60 = Number((bloco1 + bloco2 + bloco3).toFixed(1));
    const notaMin60 = soma('min', [0, 1, 2, 3, 4, 5]);
    const notaMax60 = soma('max', [0, 1, 2, 3, 4, 5]);
    const menorN = Math.min(...porDisciplinaNota.map(d => d.n));
    const confianca = totalResp >= 120 && menorN >= 15 ? 'alta' : totalResp >= 60 && menorN >= 6 ? 'media' : 'baixa';

    // Cobertura do edital pela taxonomia canônica (resolvidas pelo aluno x disponíveis nos acervos)
    const resolvidasPorTopico = db.prepare(`
      SELECT disciplina, topico, COUNT(*) as n FROM questoes_respondidas WHERE topico IS NOT NULL AND topico != '' GROUP BY disciplina, topico
    `).all();
    const dispBanco = db.prepare('SELECT disciplina, topico, COUNT(*) as n FROM banco_questoes WHERE topico IS NOT NULL GROUP BY disciplina, topico').all();
    const dispProvas = db.prepare("SELECT disciplina, topico, COUNT(*) as n FROM questoes_provas WHERE topico IS NOT NULL AND disciplina != 'Fora do Edital PMPE' GROUP BY disciplina, topico").all();
    const idx = (rows) => Object.fromEntries(rows.map(r => [`${r.disciplina}|${r.topico}`, r.n]));
    const iRes = idx(resolvidasPorTopico), iBan = idx(dispBanco), iPro = idx(dispProvas);

    const coberturaEdital = [];
    let topicosCobertosCount = 0;
    let totalTopicosEdital = 0;
    for (const disciplina of DISCS) {
      const topicos = TOPICOS_EDITAL[disciplina].map(({ topico }) => {
        totalTopicosEdital++;
        const resolvidas = iRes[`${disciplina}|${topico}`] || 0;
        if (resolvidas > 0) topicosCobertosCount++;
        return { topico, resolvidas, estudado: resolvidas > 0, disponiveis: (iBan[`${disciplina}|${topico}`] || 0) + (iPro[`${disciplina}|${topico}`] || 0) };
      });
      coberturaEdital.push({ disciplina, topicos });
    }

    res.json({
      global: {
        totalSimulados: simuladosCount || 0,
        totalQuestoes: totalResp,
        totalAcertos: globalStats.total_acertos || 0,
        taxaGeral: Math.round(globalStats.taxa_real || 0),
        tempoMedioPorQuestao: Math.round(globalStats.tempo_medio_questao || 0),
        errosImpulsividade: globalStats.erros_impulsividade || 0,
        questoesLentas: globalStats.questoes_lentas || 0,
        notaProjetada60: notaTotal60,
        notaProjetadaMin60: notaMin60,
        notaProjetadaMax60: notaMax60,
        confiancaProjecao: confianca,
        bloco1,
        bloco2,
        bloco3,
        percentualCoberturaEdital: totalTopicosEdital > 0 ? Math.round((topicosCobertosCount / totalTopicosEdital) * 100) : 0,
        calibracao: {
          totalDuvidas: globalStats.total_duvidas || 0,
          acertosComDuvida: globalStats.acertos_com_duvida || 0,
          errosComConfianca: globalStats.erros_com_confianca || 0
        }
      },
      notaPorDisciplina: porDisciplinaNota,
      disciplinas: disciplinaStats,
      pontosFortes,
      emAlerta,
      zonasCriticas,
      origens: origemStats,
      evolucao,
      cadernoErros: leitnerStats,
      ultimosErros,
      coberturaEdital
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DA API: CONFIGURAÇÕES E CHAVE
// ==========================================

// Obter chave da API salva no SQLite
app.get('/api/config/key', (req, res) => {
  try {
    const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'gemini_api_key'").get();
    res.json({ key: row ? row.valor : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Salvar chave da API permanentemente no SQLite
app.post('/api/config/key', (req, res) => {
  try {
    const { key } = req.body;
    const stmt = db.prepare(`
      INSERT INTO configuracoes (chave, valor) VALUES ('gemini_api_key', ?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
    `);
    stmt.run(key ? key.trim() : '');
    res.json({ success: true, message: 'Chave gravada com sucesso no SQLite!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DA API: BANCO DE QUESTÕES OFFLINE (ZERO IA)
// ==========================================

// Estatísticas do banco de questões permanente
app.get('/api/banco/stats', (req, res) => {
  try {
    const totalStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN total_vezes_usada = 0 THEN 1 END) as ineditas
      FROM banco_questoes
    `).get();

    const disciplinas = db.prepare(`
      SELECT 
        disciplina, 
        COUNT(*) as total, 
        COUNT(CASE WHEN total_vezes_usada = 0 THEN 1 END) as ineditas
      FROM banco_questoes
      GROUP BY disciplina
      ORDER BY total DESC
    `).all();

    const assuntos = db.prepare(`
      SELECT assunto, disciplina, COUNT(*) as total
      FROM banco_questoes
      GROUP BY assunto, disciplina
      ORDER BY total DESC
      LIMIT 30
    `).all();

    res.json({
      total: totalStats.total || 0,
      ineditas: totalStats.ineditas || 0,
      disciplinas,
      assuntos
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contagem em tempo real de questões por disciplina, tema e chips
app.post('/api/banco/contagem', (req, res) => {
  try {
    const { disciplinas = [], tema = '', chips = [] } = req.body;
    const listaDisciplinas = Array.isArray(disciplinas) ? disciplinas : [disciplinas].filter(Boolean);

    // 1. Contagem geral por disciplina
    let sqlBanco = 'SELECT disciplina, COUNT(*) as total, COUNT(CASE WHEN total_vezes_usada = 0 THEN 1 END) as ineditas FROM banco_questoes WHERE 1=1';
    let sqlProvas = "SELECT disciplina, COUNT(*) as total FROM questoes_provas qp WHERE " + SQL_PROVAS_UTEIS;
    const paramsBanco = [];
    const paramsProvas = [];

    if (listaDisciplinas.length > 0) {
      const ph = listaDisciplinas.map(() => '?').join(',');
      sqlBanco += ` AND disciplina IN (${ph})`;
      sqlProvas += ` AND disciplina IN (${ph})`;
      paramsBanco.push(...listaDisciplinas);
      paramsProvas.push(...listaDisciplinas);
    }
    sqlBanco += ' GROUP BY disciplina';
    sqlProvas += ' GROUP BY disciplina';

    const rowsBanco = db.prepare(sqlBanco).all(...paramsBanco);
    const rowsProvas = db.prepare(sqlProvas).all(...paramsProvas);

    const contagemPorDisciplina = {};
    for (const d of listaDisciplinas) {
      contagemPorDisciplina[d] = { local: 0, ineditas: 0, provas: 0, total: 0 };
    }
    for (const r of rowsBanco) {
      if (contagemPorDisciplina[r.disciplina]) {
        contagemPorDisciplina[r.disciplina].local = r.total;
        contagemPorDisciplina[r.disciplina].ineditas = r.ineditas;
      }
    }
    for (const r of rowsProvas) {
      if (contagemPorDisciplina[r.disciplina]) {
        contagemPorDisciplina[r.disciplina].provas = r.total;
      }
    }
    for (const d of Object.keys(contagemPorDisciplina)) {
      contagemPorDisciplina[d].total = contagemPorDisciplina[d].local + contagemPorDisciplina[d].provas;
    }

    // 2. Contagem filtrada pelo tema digitado
    let focoTemaLocal = 0;
    let focoTemaProvas = 0;
    const temaLimpo = normalizeText(tema);

    // Carrega questões das matérias selecionadas
    let sqlFocoLocal = 'SELECT assunto, topico, sub_topico, palavras_chave, enunciado FROM banco_questoes WHERE 1=1';
    let sqlFocoProvas = "SELECT enunciado, alternativas_json, topico, disciplina FROM questoes_provas qp WHERE " + SQL_PROVAS_UTEIS;
    const paramsCand = [];
    if (listaDisciplinas.length > 0) {
      const ph = listaDisciplinas.map(() => '?').join(',');
      sqlFocoLocal += ` AND disciplina IN (${ph})`;
      sqlFocoProvas += ` AND disciplina IN (${ph})`;
      paramsCand.push(...listaDisciplinas);
    }

    const candLocal = db.prepare(sqlFocoLocal).all(...paramsCand);
    const candProvas = db.prepare(sqlFocoProvas).all(...paramsCand);

    const topicoDe = (nome) => Object.values(TOPICOS_EDITAL).flat().find(t => normalizeText(t.topico) === normalizeText(nome))?.topico || null;
    const contarTema = (nome) => {
      const topico = topicoDe(nome);
      const m = buildTemaMatcher(nome);
      if (m.vazio) return { local: 0, provas: 0 };
      // nome de tópico canônico conta pela classificação; texto livre conta por busca no conteúdo (igual ao sorteio)
      const local = candLocal.filter(q => (topico && q.topico === topico) || m.match(`${q.assunto} ${q.sub_topico} ${q.palavras_chave} ${q.enunciado}`)).length;
      const provas = candProvas.filter(q => (topico && q.topico === topico) || m.match(`${q.enunciado} ${q.alternativas_json}`)).length;
      return { local, provas };
    };
    const matcherTema = buildTemaMatcher(tema);
    if (!matcherTema.vazio) {
      const c = contarTema(tema);
      focoTemaLocal = c.local;
      focoTemaProvas = c.provas;
    }

    // Tópicos do edital com questões disponíveis nas disciplinas selecionadas (alimenta os chips da tela)
    const porTopico = {};
    for (const q of candLocal) if (q.topico && q.topico !== 'Outros') { const k = q.topico; porTopico[k] = (porTopico[k] || 0) + 1; }
    for (const q of candProvas) if (q.topico && q.topico !== 'Outros') { const k = q.topico; porTopico[k] = (porTopico[k] || 0) + 1; }
    const topicos = Object.entries(porTopico).map(([topico, total]) => ({ topico, total })).sort((a, b) => b.total - a.total);

    // 3. Contagem para cada chip sugerido
    const chipsCount = {};
    if (Array.isArray(chips)) {
      for (const chip of chips) {
        const c = contarTema(chip);
        chipsCount[chip] = { local: c.local, provas: c.provas, total: c.local + c.provas };
      }
    }

    const totalLocalGeral = Object.values(contagemPorDisciplina).reduce((acc, c) => acc + c.local, 0);
    const totalIneditasGeral = Object.values(contagemPorDisciplina).reduce((acc, c) => acc + c.ineditas, 0);
    const totalProvasGeral = Object.values(contagemPorDisciplina).reduce((acc, c) => acc + c.provas, 0);

    res.json({
      contagemPorDisciplina,
      totalLocalGeral,
      totalIneditasGeral,
      totalProvasGeral,
      tema: tema.trim(),
      temFoco: !matcherTema.vazio,
      focoTemaLocal,
      focoTemaProvas,
      focoTemaTotal: focoTemaLocal + focoTemaProvas,
      chipsCount,
      topicos
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Triagem de questões geradas: validação estrutural + detecção de quase-duplicatas contra o banco, as provas reais e o próprio lote
const LIMIAR_DUPLICATA = 0.85;

function triarQuestoes(questoes) {
  const existentes = [];
  for (const r of db.prepare('SELECT id, enunciado FROM banco_questoes').all()) {
    existentes.push({ vec: computeTFVector(r.enunciado), ref: `banco #${r.id}` });
  }
  for (const r of db.prepare('SELECT prova_id, numero, vetor_json, enunciado FROM questoes_provas').all()) {
    existentes.push({ vec: vetorDe(r), ref: `${r.prova_id} Q${r.numero}` });
  }

  const resultado = [];
  const aceitas = [];
  questoes.forEach((q, indice) => {
    const normAlts = normalizeAlternativasArray(q.alternativas);
    const v = validarQuestao({ ...q, alternativas: normAlts, gabarito: q.gabarito || q.resposta_correta });
    if (!v.ok) {
      resultado.push({ indice, status: 'INVALIDA', motivo: v.erros.join(' ') });
      return;
    }
    const vec = computeTFVector(q.enunciado + ' ' + normAlts.map(a => a.texto).join(' '));
    const vecEnun = computeTFVector(q.enunciado);
    let melhor = { sim: 0, ref: null };
    for (const e of [...existentes, ...aceitas]) {
      const sim = Math.max(calculateCosineSimilarity(vecEnun, e.vec), calculateCosineSimilarity(vec, e.vec));
      if (sim > melhor.sim) melhor = { sim, ref: e.ref };
    }
    if (melhor.sim >= LIMIAR_DUPLICATA) {
      resultado.push({ indice, status: 'DUPLICADA', motivo: `Muito parecida com ${melhor.ref}`, similaridade: Number(melhor.sim.toFixed(2)) });
      return;
    }
    aceitas.push({ vec: vecEnun, ref: `lote #${indice + 1}` });
    resultado.push({ indice, status: 'OK', similaridade: Number(melhor.sim.toFixed(2)), avisos: v.avisos });
  });
  return resultado;
}

app.post('/api/banco/triagem', (req, res) => {
  try {
    const { questoes } = req.body || {};
    if (!Array.isArray(questoes)) return res.status(400).json({ error: 'Envie "questoes" como array.' });
    res.json({ resultados: triarQuestoes(questoes) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Salvar lote gerado por IA: só entra no banco o que passa na triagem. Inválidas vão para quarentena; duplicatas são descartadas.
app.post('/api/banco/salvar', (req, res) => {
  try {
    const { questoes } = req.body;
    if (!Array.isArray(questoes) || questoes.length === 0) {
      return res.status(400).json({ error: 'Nenhuma questão fornecida.' });
    }

    const triagem = triarQuestoes(questoes);
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO banco_questoes (
        hash_enunciado, disciplina, assunto, topico, sub_topico, banca, tipo, dificuldade,
        enunciado, texto_base, alternativas_json, gabarito, dica, explicacao_json,
        palavras_chave, verificada, total_vezes_usada, ultima_data_resolucao, data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const quarentenaStmt = db.prepare(`
      INSERT INTO quarentena_questoes (motivo, disciplina, enunciado, payload_json, data_criacao) VALUES (?, ?, ?, ?, ?)
    `);

    let inseridas = 0;
    let emQuarentena = 0;
    const ids = {};
    const rejeitadas = [];
    const agora = new Date().toISOString();

    db.exec('BEGIN');
    try {
      questoes.forEach((q, i) => {
        const t = triagem[i];
        const divergente = q.verificacao === 'DIVERGENTE';
        if (t.status === 'DUPLICADA') {
          rejeitadas.push({ indice: i, motivo: t.motivo });
          return;
        }
        if (t.status === 'INVALIDA' || divergente) {
          const motivo = divergente ? 'Resolução independente da IA divergiu do gabarito.' : t.motivo;
          quarentenaStmt.run(motivo, q.disciplina || null, q.enunciado || null, JSON.stringify(q), agora);
          emQuarentena++;
          rejeitadas.push({ indice: i, motivo });
          return;
        }

        const normAlts = normalizeAlternativasArray(q.alternativas);
        const gabarito = String(q.gabarito || q.resposta_correta).trim().toUpperCase();
        const normExp = normalizeExplicacaoObject(q.explicacao, gabarito);
        const disciplina = q.disciplina || 'Língua Portuguesa';
        const topico = classificarTopico(disciplina, q.assunto || '', q.enunciado);

        const r = insertStmt.run(
          computeStatementHash(q.enunciado),
          disciplina,
          q.assunto || 'Geral',
          topico,
          q.sub_topico || q.tipoCognitivo || '',
          q.banca || 'Instituto AOCP',
          'INÉDITA', // o que a IA gera é sempre inédito; questões reais vêm somente das provas importadas
          q.dificuldade || 'Média',
          q.enunciado,
          q.textoBase || q.texto_base || null,
          JSON.stringify(normAlts),
          gabarito,
          q.dica || '',
          JSON.stringify(normExp),
          q.palavras_chave || `${disciplina} ${q.assunto || ''} ${topico}`,
          q.verificacao === 'OK' ? 1 : 0,
          agora,
          agora
        );
        const idBanco = db.prepare('SELECT id FROM banco_questoes WHERE hash_enunciado = ?').get(computeStatementHash(q.enunciado))?.id;
        if (idBanco) ids[i] = idBanco;
        if (r.changes > 0) inseridas++;
        else rejeitadas.push({ indice: i, motivo: 'Enunciado idêntico já existe no banco.' });
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    invalidarCorpus();
    const totalTotal = db.prepare('SELECT COUNT(*) as count FROM banco_questoes').get().count;
    res.json({ success: true, inseridas, emQuarentena, rejeitadas, ids, totalBanco: totalTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function dificuldadeEmpirica(acertos, erros, declarada) {
  const n = (acertos || 0) + (erros || 0);
  if (n < 5) return declarada || 'Média';
  const taxa = acertos / n;
  if (taxa >= 0.75) return 'Fácil';
  if (taxa >= 0.45) return 'Média';
  return 'Difícil';
}

function embaralhar(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const SQL_PROVAS_UTEIS = `
  qp.anulada = 0 AND qp.gabarito_oficial IS NOT NULL AND qp.disciplina != 'Fora do Edital PMPE'
  AND COALESCE(qp.depende_de_figura, 0) = 0
  AND NOT (COALESCE(qp.depende_de_texto, 0) = 1 AND qp.texto_base IS NULL)
`;

// Buscar e sortear questões offline (banco inédito + provas reais), priorizando o que o aluno menos viu
app.post('/api/banco/buscar', (req, res) => {
  try {
    const { disciplinas = [], tema = '', quantidade = 10, apenasIneditas = false, somenteReais = false, somenteIneditas = false } = req.body;
    const qtd = Math.max(1, Math.min(60, Number(quantidade) || 10));
    const listaDisc = Array.isArray(disciplinas) ? disciplinas : [];

    let sql = 'SELECT * FROM banco_questoes WHERE 1=1';
    const params = [];
    let sqlProvas = `
      SELECT qp.id, qp.prova_id, qp.numero, qp.disciplina, qp.assunto, qp.topico, qp.enunciado, qp.alternativas_json,
             qp.gabarito_oficial, qp.texto_base, p.nome as prova_nome, p.ano,
             COALESCE(u.vezes, 0) as vezes, u.ultima_data as ultima_data, COALESCE(u.acertos, 0) as u_acertos, COALESCE(u.erros, 0) as u_erros
      FROM questoes_provas qp
      JOIN provas p ON p.id = qp.prova_id AND p.ativo = 1
      LEFT JOIN uso_questoes_provas u ON u.prova_id = qp.prova_id AND u.numero = qp.numero
      WHERE ${SQL_PROVAS_UTEIS}
    `;
    const paramsProvas = [];

    if (listaDisc.length > 0) {
      const ph = listaDisc.map(() => '?').join(',');
      sql += ` AND disciplina IN (${ph})`;
      sqlProvas += ` AND qp.disciplina IN (${ph})`;
      params.push(...listaDisc);
      paramsProvas.push(...listaDisc);
    }
    if (apenasIneditas) sql += ' AND total_vezes_usada = 0';

    const candidatesBanco = somenteReais ? [] : db.prepare(sql).all(...params);
    const candidatesProvas = somenteIneditas ? [] : db.prepare(sqlProvas).all(...paramsProvas).map(p => ({
      id: `prova_${p.id}`,
      bancoId: null,
      provaRef: { prova_id: p.prova_id, numero: p.numero },
      isRealProva: true,
      disciplina: p.disciplina,
      assunto: p.assunto || 'Prova Oficial',
      topico: p.topico,
      sub_topico: 'Questão Real AOCP',
      tipo: 'REAL',
      fonte: `${p.prova_nome} (${p.ano}) • Questão ${p.numero}`,
      dificuldade: dificuldadeEmpirica(p.u_acertos, p.u_erros, 'Média'),
      enunciado: p.enunciado,
      texto_base: p.texto_base,
      alternativas_json: p.alternativas_json,
      gabarito: p.gabarito_oficial,
      dica: 'Atenção às pegadinhas e à literalidade da banca Instituto AOCP.',
      explicacao_json: JSON.stringify({
        correta: `Gabarito oficial definitivo da banca Instituto AOCP: Letra (${p.gabarito_oficial}).`,
        distratores: {}
      }),
      total_vezes_usada: p.vezes,
      ultima_data_resolucao: p.ultima_data,
      palavras_chave: `${p.disciplina} ${p.assunto || ''} ${p.prova_nome}`
    }));

    // Embaralha antes de ordenar por uso (sort estável) para não repetir sempre a mesma ordem
    const candidates = embaralhar([...candidatesBanco, ...candidatesProvas]);
    // Frescor: menos usadas primeiro; entre iguais, a vista há mais tempo (nunca vista = primeiro); empate = ordem aleatória
    const porFrescor = (a, b) => (a.total_vezes_usada || 0) - (b.total_vezes_usada || 0)
      || String(a.ultima_data_resolucao || '').localeCompare(String(b.ultima_data_resolucao || ''));
    candidates.sort(porFrescor);

    if (candidates.length === 0) {
      return res.json({
        questoes: [],
        totalEncontradas: 0,
        aviso: 'Nenhuma questão cadastrada para os filtros selecionados no banco local.'
      });
    }

    let selecionadas = [];
    let aviso = null;

    const matcherTema = buildTemaMatcher(tema);
    const temaNorm = normalizeText(tema);
    const topicoExato = Object.values(TOPICOS_EDITAL).flat().find(t => normalizeText(t.topico) === temaNorm)?.topico || null;

    if (!matcherTema.vazio) {
      const scored = candidates.map(q => {
        let score = 0;
        if (topicoExato && q.topico === topicoExato) score += 20;
        if (matcherTema.match(q.assunto)) score += 14;
        if (matcherTema.match(q.sub_topico)) score += 10;
        if (matcherTema.match(q.palavras_chave)) score += 8;
        if (matcherTema.match(q.enunciado)) score += 4;
        return { q, score };
      });
      const matched = scored.filter(item => item.score > 0);

      if (matched.length === 0) {
        return res.json({
          questoes: [],
          totalEncontradas: 0,
          aviso: `Nenhuma questão encontrada no Banco Local com foco em '${tema}'. Como ainda não há itens salvos sobre este assunto, utilize o botão 'Gerar Inéditas com IA' para criar seu primeiro lote!`
        });
      }

      // Duas faixas de relevância (forte x fraca); dentro de cada faixa vale o frescor, para o tema rodar entre as questões
      const faixa = (m) => (m.score >= 14 ? 2 : 1);
      matched.sort((a, b) => faixa(b) - faixa(a) || porFrescor(a.q, b.q));

      selecionadas = matched.map(m => m.q).slice(0, qtd);

      if (selecionadas.length < qtd) {
        aviso = `Encontramos ${selecionadas.length} questão(ões) no banco com foco em '${tema}'. O restante (${qtd - selecionadas.length}) foi completado com outros temas da disciplina.`;
        const idsUsados = new Set(selecionadas.map(s => s.id));
        for (const cand of candidates) {
          if (selecionadas.length >= qtd) break;
          if (!idsUsados.has(cand.id)) { selecionadas.push(cand); idsUsados.add(cand.id); }
        }
      }
    } else {
      selecionadas = candidates.slice(0, qtd);
    }

    // Acervo esgotado: tudo o que saiu já foi resolvido antes, então as questões voltam por rodízio
    if (selecionadas.length > 0 && selecionadas.every(q => (q.total_vezes_usada || 0) >= 1)) {
      const extra = `Você já viu todas as ${candidates.length} questões desta seleção; elas voltam em rodízio. Use "Gerar com IA" ou importe mais provas para ampliar o acervo.`;
      aviso = aviso ? `${aviso} ${extra}` : extra;
    }

    // Registra o uso para priorizar as menos vistas no próximo sorteio (banco e provas reais)
    const updBanco = db.prepare('UPDATE banco_questoes SET total_vezes_usada = total_vezes_usada + 1, ultima_data_resolucao = ? WHERE id = ?');
    const updProva = db.prepare(`
      INSERT INTO uso_questoes_provas (prova_id, numero, vezes, ultima_data) VALUES (?, ?, 1, ?)
      ON CONFLICT(prova_id, numero) DO UPDATE SET vezes = vezes + 1, ultima_data = excluded.ultima_data
    `);
    const agora = new Date().toISOString();
    const formatted = selecionadas.map(q => {
      if (q.provaRef) updProva.run(q.provaRef.prova_id, q.provaRef.numero, agora);
      else updBanco.run(agora, q.id);

      const origemNorm = String(q.tipo || 'INÉDITA').toUpperCase().includes('REAL') ? 'REAL' : 'INÉDITA';
      return {
        id: q.id,
        bancoId: q.provaRef ? null : q.id,
        provaRef: q.provaRef || null,
        disciplina: q.disciplina,
        assunto: q.assunto,
        topico: q.topico,
        sub_topico: q.sub_topico,
        tipoCognitivo: q.sub_topico || 'SITUACAO_PROBLEMA',
        banca: q.banca || 'Instituto AOCP',
        tipo: origemNorm,
        origem: origemNorm,
        fonte: q.provaRef ? q.fonte : (origemNorm === 'REAL' ? 'Prova Oficial Instituto AOCP' : 'Acervo Local • Padrão AOCP'),
        dificuldade: q.provaRef ? q.dificuldade : dificuldadeEmpirica(q.total_acertos, q.total_erros, q.dificuldade),
        enunciado: q.enunciado,
        textoBase: q.texto_base || '',
        texto_base: q.texto_base || '',
        alternativas: normalizeAlternativasArray(q.alternativas_json),
        resposta_correta: q.gabarito,
        gabarito: q.gabarito,
        dica: q.dica,
        explicacao: normalizeExplicacaoObject(q.explicacao_json, q.gabarito),
        palavras_chave: q.palavras_chave,
        total_vezes_usada: (q.total_vezes_usada || 0) + 1
      };
    });

    res.json({ questoes: formatted, totalEncontradas: formatted.length, aviso });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar acertos e erros no banco permanente e no histórico de uso das questões reais
app.post('/api/banco/resultado', (req, res) => {
  try {
    const { resultados } = req.body;
    if (!Array.isArray(resultados)) return res.json({ success: true });

    const updateAcerto = db.prepare('UPDATE banco_questoes SET total_acertos = total_acertos + 1 WHERE id = ?');
    const updateErro = db.prepare('UPDATE banco_questoes SET total_erros = total_erros + 1 WHERE id = ?');
    const upsertProva = db.prepare(`
      INSERT INTO uso_questoes_provas (prova_id, numero, vezes, acertos, erros, ultima_data) VALUES (?, ?, 0, ?, ?, ?)
      ON CONFLICT(prova_id, numero) DO UPDATE SET acertos = acertos + excluded.acertos, erros = erros + excluded.erros
    `);
    const agora = new Date().toISOString();

    for (const item of resultados) {
      if (item.provaRef?.prova_id) {
        upsertProva.run(item.provaRef.prova_id, item.provaRef.numero, item.acertou ? 1 : 0, item.acertou ? 0 : 1, agora);
      } else if (item.bancoId) {
        if (item.acertou) updateAcerto.run(item.bancoId);
        else updateErro.run(item.bancoId);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Servidor escutando
app.listen(PORT, () => {
  console.log(`[Servidor SQLite Backend] Rodando em http://localhost:${PORT}`);
});
 // reload
