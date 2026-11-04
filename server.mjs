import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTemaMatcher, parseTemaQuery } from './lib/temaMatcher.mjs';
import { normalizeText, tokenizar, computeTFVector, calculateCosineSimilarity, vetorDe, construirIdf, rankCandidates, hashEnunciado } from './lib/texto.mjs';
import { extractQuestionsFromExam, construirVocabulario } from './lib/parserProvas.mjs';
import { classificarTopico, TOPICOS_EDITAL } from './lib/taxonomia.mjs';
import { validarQuestao } from './lib/validacaoQuestao.mjs';
import { parseGabaritoTexto } from './lib/gabarito.mjs';
import { chunkLei } from './lib/leis.mjs';
import { hojeLocal, somarDiasLocal } from './lib/tempo.mjs';
import { registrarRotasEstudo } from './routes/estudo.mjs';
import { buscarQuestoesParecidas } from './lib/buscaProvas.mjs';
import { registrarRotasPainel } from './routes/painel.mjs';
import { registrarRotasVade } from './routes/vade.mjs';
import { registrarRotasConfig } from './routes/config.mjs';
import { abrirBanco } from './db/conexao.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Configurações do Express: o servidor é de uso pessoal, então só aceita origens locais
const ORIGENS_LOCAIS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use(cors({ origin: (origin, cb) => cb(null, !origin || ORIGENS_LOCAIS.test(origin)) }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Banco de Dados SQLite em disco (esquema e migrações em db/conexao.mjs)
const { db } = abrirBanco(__dirname);

// Sincroniza o índice full-text BM25 nativo (SQLite FTS5) da base de conhecimento
function sincronizarBaseFts(forcar = false) {
  try {
    const totalBase = db.prepare('SELECT COUNT(*) as n FROM base_conhecimento').get().n;
    const totalFts = db.prepare('SELECT COUNT(*) as n FROM base_conhecimento_fts').get().n;
    if (!forcar && totalBase === totalFts) return;
    db.exec('BEGIN');
    db.exec('DELETE FROM base_conhecimento_fts');
    const insFts = db.prepare('INSERT INTO base_conhecimento_fts (chunk_id, fonte, disciplina, topico, referencia, texto_norm) VALUES (?, ?, ?, ?, ?, ?)');
    for (const r of db.prepare('SELECT id, fonte, disciplina, topico, referencia, texto FROM base_conhecimento').all()) {
      insFts.run(
        String(r.id),
        normalizeText(r.fonte),
        normalizeText(r.disciplina || ''),
        normalizeText(r.topico || ''),
        normalizeText(r.referencia),
        tokenizar(`${r.referencia} ${r.texto}`).join(' ')
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.warn('[FTS5] Aviso ao sincronizar base_conhecimento_fts:', err.message);
  }
}
sincronizarBaseFts();

// Backfill idempotente de tópicos canônicos (incluindo migração automática para a taxonomia Soldado PMPE 2026) e hashes
function backfillTopicos() {
  const topicosValidosPorDisc = new Map(
    Object.entries(TOPICOS_EDITAL).map(([d, arr]) => [d, new Set(arr.map((t) => t.topico))])
  );
  const precisaReclassificar = (disciplina, topicoAtual) => {
    if (!topicoAtual) return true;
    const validos = topicosValidosPorDisc.get(disciplina);
    if (!validos) return false;
    return !validos.has(topicoAtual);
  };

  const upd = (tabela, usarAlts = false) => {
    const cols = usarAlts ? 'id, disciplina, assunto, enunciado, alternativas_json, topico' : 'id, disciplina, assunto, enunciado, topico';
    const rows = db.prepare(`SELECT ${cols} FROM ${tabela}`).all();
    const pendentes = rows.filter((r) => precisaReclassificar(r.disciplina, r.topico));
    if (pendentes.length === 0) return;
    const stmt = db.prepare(`UPDATE ${tabela} SET topico = ? WHERE id = ?`);
    db.exec('BEGIN');
    for (const r of pendentes) {
      const textoExtra = usarAlts ? `${r.enunciado || ''} ${r.alternativas_json || ''}` : (r.enunciado || '');
      stmt.run(classificarTopico(r.disciplina, r.assunto || '', textoExtra), r.id);
    }
    db.exec('COMMIT');
  };
  upd('questoes_respondidas', false);
  upd('banco_questoes', false);
  upd('caderno_erros', false);
  upd('questoes_provas', true);
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

// Busca híbrida na base de conhecimento: Lookup exato de Artigo/Súmula + SQLite FTS5 BM25 + TF-IDF Cosseno + MMR
function buscarBaseConhecimento({ disciplinas = [], topicos = [], query = '', limite = 3, minScore = 0.10 }) {
  const normQuery = normalizeText(query);
  const mSumula = normQuery.match(/\b(?:sumula|sv)\s*(?:vinculante\s*)?(?:no?\s*)?(\d{1,4})\b/);
  const sumulaAlvo = mSumula ? mSumula[1] : null;

  let sql = 'SELECT id, fonte, referencia, texto, vetor_json, disciplina, topico FROM base_conhecimento WHERE 1=1';
  const params = [];
  if (disciplinas.length > 0) {
    sql += ` AND disciplina IN (${disciplinas.map(() => '?').join(',')})`;
    params.push(...disciplinas);
  }
  const todos = db.prepare(sql).all(...params);

  // Súmulas (ex.: SV 11 Algemas) são transversais entre Constitucional e DH/Legislação Extravagante
  if (sumulaAlvo) {
    const reSum = new RegExp(`S[úu]mula(?:\\s+Vinculante)?\\s*(?:n[º°.]?\\s*)?${sumulaAlvo}\\b`, 'i');
    if (!todos.some((c) => reSum.test(`${c.fonte} ${c.referencia}`))) {
      const extras = db.prepare("SELECT id, fonte, referencia, texto, vetor_json, disciplina, topico FROM base_conhecimento WHERE fonte LIKE '%Súmula%' OR referencia LIKE '%Súmula%'")
        .all()
        .filter((c) => reSum.test(`${c.fonte} ${c.referencia}`));
      todos.push(...extras);
    }
  }

  if (todos.length === 0) return [];

  // Filtra pelo(s) tópico(s) canônico(s) se houver, preservando também match literal na referência/fonte
  const topicosSet = new Set(topicos.filter((t) => t && t !== 'Outros'));
  let pool = todos;
  if (topicosSet.size > 0) {
    const filtrados = todos.filter((c) => {
      if (!c.topico || topicosSet.has(c.topico)) return true;
      if (sumulaAlvo && new RegExp(`\\b${sumulaAlvo}\\b`).test(`${c.fonte} ${c.referencia}`)) return true;
      const normRef = normalizeText(`${c.fonte} ${c.referencia}`);
      return normQuery && (normQuery.includes(normalizeText(c.referencia)) || normRef.includes(normQuery));
    });
    if (filtrados.length > 0) pool = filtrados;
  }

  // 1) Extração explícita de números de artigos e súmulas (ex.: "art 5", "arts 37 a 41", "sv 11", "sumula 542")
  const parsedTema = parseTemaQuery(query);
  const artigosAlvo = new Set();
  for (const g of parsedTema.groups) for (const a of g.articles) artigosAlvo.add(String(a));
  // Caso o usuário digite só "artigo 5" ou "5" com "art"
  for (const m of normQuery.matchAll(/\bart(?:igo)?s?\s*(\d{1,3})\b/g)) artigosAlvo.add(String(Number(m[1])));

  // 2) Pontuação FTS5 BM25 nativa do SQLite
  const ftsScores = new Map();
  const tokensBusca = tokenizar(query).filter((t) => t.length >= 2 || /^\d+$/.test(t));
  if (tokensBusca.length > 0) {
    try {
      const ftsExpr = tokensBusca.slice(0, 12).map((t) => `"${t.replace(/"/g, '')}"*`).join(' OR ');
      const ftsRows = db.prepare(`
        SELECT chunk_id, bm25(base_conhecimento_fts, 0.0, 1.5, 0.5, 2.0, 3.0, 1.2) as rank_bm25
        FROM base_conhecimento_fts
        WHERE base_conhecimento_fts MATCH ?
        LIMIT 40
      `).all(ftsExpr);
      if (ftsRows.length > 0) {
        // bm25() em SQLite retorna valores negativos (quanto mais negativo, mais relevante)
        const minBm25 = Math.min(...ftsRows.map((r) => r.rank_bm25));
        const span = Math.abs(minBm25) || 1;
        for (const r of ftsRows) {
          ftsScores.set(Number(r.chunk_id), Math.min(1, Math.abs(r.rank_bm25) / span));
        }
      }
    } catch {}
  }

  // 3) Pontuação TF-IDF Cosseno + Boost cirúrgico de artigo/súmula exata + MMR
  const idf = getCorpusIdf();
  const rankedCos = rankCandidates(query || [...topicosSet].join(' '), pool, Math.min(pool.length, Math.max(limite * 4, 16)), idf, false);
  const cosMap = new Map(rankedCos.map((r) => [r.q.id, r.cosseno]));

  const combinados = pool.map((c) => {
    let score = (cosMap.get(c.id) || 0) * 0.55 + (ftsScores.get(c.id) || 0) * 0.45;
    const mArtChunk = c.referencia.match(/^Art\.\s*(\d+)/i);
    if (artigosAlvo.size > 0) {
      if (mArtChunk && artigosAlvo.has(String(Number(mArtChunk[1])))) score += 0.65;
      else score *= 0.35; // penaliza outros artigos quando o aluno pediu um artigo explícito!
    }
    if (sumulaAlvo) {
      const mSumChunk = `${c.fonte} ${c.referencia}`.match(/S[úu]mula(?:\s+Vinculante)?\s*(?:n[º°.]?\s*)?(\d+)/i);
      if (mSumChunk && mSumChunk[1] === sumulaAlvo) score += 0.70;
      else score *= 0.35;
    }
    return { q: c, score };
  }).filter((x) => x.score >= minScore);

  combinados.sort((a, b) => b.score - a.score);

  // MMR leve para não devolver dois sub-trechos idênticos se houver variedade relevante
  const escolhidos = [];
  const candidatosTop = combinados.slice(0, 18);
  while (escolhidos.length < limite && candidatosTop.length > 0) {
    let bestIdx = 0;
    let bestMmr = -Infinity;
    for (let i = 0; i < candidatosTop.length; i++) {
      const cand = candidatosTop[i];
      let maxSim = 0;
      for (const sel of escolhidos) {
        const sim = calculateCosineSimilarity(vetorDe(cand.q), vetorDe(sel.q));
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = 0.78 * cand.score - 0.22 * maxSim;
      if (mmr > bestMmr) { bestMmr = mmr; bestIdx = i; }
    }
    escolhidos.push(candidatosTop.splice(bestIdx, 1)[0]);
  }

  return escolhidos.map((e) => ({ q: e.q, cosseno: Number(e.score.toFixed(4)) }));
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
    const achadas = buscarQuestoesParecidas(query, candidates, Number(limite) || 6);

    const formatted = achadas.map(({ q, alternativas, relevancia }) => ({
      id: q.id,
      numero: q.numero,
      disciplina: q.disciplina,
      prova_nome: q.prova_nome,
      banca: q.banca,
      ano: q.ano,
      enunciado: q.enunciado,
      alternativas,
      gabarito: q.gabarito_oficial || null,
      relevancia
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

    // Consulta enriquecida: assunto + tópicos do edital que casam de verdade com o assunto em TODAS as disciplinas selecionadas
    const topicosRelacionados = [];
    if (assunto && assunto.trim()) {
      for (const d of listaDisciplinas) {
        const t = classificarTopico(d, assunto, '');
        if (t && t !== 'Outros' && !(d === 'Língua Portuguesa' && t === 'Interpretação de Texto' && !/interpret|texto|inferenc|compreens/i.test(assunto))) {
          topicosRelacionados.push(t);
        }
      }
    }
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

    // Anti-repetição enxuta (máx 8 itens curtos para economizar tokens; o backend já faz deduplicação determinística 100% em triarQuestoes)
    let sqlBanco = 'SELECT id, assunto, enunciado FROM banco_questoes WHERE 1=1';
    const paramsBanco = [];
    if (listaDisciplinas.length > 0) {
      sqlBanco += ` AND disciplina IN (${listaDisciplinas.map(() => '?').join(',')})`;
      paramsBanco.push(...listaDisciplinas);
    }
    const doBanco = db.prepare(sqlBanco).all(...paramsBanco);
    const relacionadas = rankCandidatesWithBM25AndMMR(searchPhrase, doBanco, 5).map((r) => r.q);
    const recentes = [...doBanco].sort((a, b) => b.id - a.id).slice(0, 3);
    const vistos = new Set();
    const evitar = [];
    for (const r of [...relacionadas, ...recentes]) {
      if (vistos.has(r.id) || evitar.length >= 6) continue;
      vistos.add(r.id);
      evitar.push(r);
    }
    let sqlResp = 'SELECT assunto, enunciado FROM questoes_respondidas WHERE 1=1';
    if (listaDisciplinas.length > 0) sqlResp += ` AND disciplina IN (${listaDisciplinas.map(() => '?').join(',')})`;
    sqlResp += ' ORDER BY id DESC LIMIT 4';
    for (const r of db.prepare(sqlResp).all(...(listaDisciplinas.length > 0 ? listaDisciplinas : []))) {
      if (evitar.length >= 8) break;
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

    const evitarRepeticao = evitar.map((r, i) => `${i + 1}. [${r.assunto}] ${String(r.enunciado).slice(0, 110)}...`).join('\n');

    // Base de Conhecimento / Legislação (híbrida FTS5 + Cosseno + Artigo Exato, sem truncar frases no meio):
    // - Com assunto digitado: traz até 2 sub-trechos exatos de alta precisão.
    // - Sem assunto (simulado geral): monta `basePorTopico` (1 dispositivo sorteado por tópico sugerido) para ancorar cada questão no seu próprio tópico sem vazar leis alheias!
    let baseLegal = '';
    let trechosLegais = [];
    const basePorTopico = {};

    if (assunto && assunto.trim()) {
      const topLei = buscarBaseConhecimento({
        disciplinas: listaDisciplinas,
        topicos: topicosRelacionados,
        query: assunto,
        limite: 2,
        minScore: 0.10
      });
      trechosLegais = topLei.map((t) => ({ fonte: t.q.fonte, referencia: t.q.referencia, disciplina: t.q.disciplina, topico: t.q.topico }));
      baseLegal = topLei
        .map((t) => `[${t.q.fonte} — ${t.q.referencia}]\n${String(t.q.texto)}`)
        .join('\n\n');
    } else {
      const discsAlvo = listaDisciplinas.length > 0 ? listaDisciplinas : Object.keys(TOPICOS_EDITAL);
      const blocosFallback = [];
      for (const d of discsAlvo) {
        const sugeridos = topicosSugeridos[d] || [];
        for (const top of sugeridos.slice(0, 4)) {
          const rowsTop = db.prepare(
            'SELECT fonte, referencia, texto, disciplina, topico FROM base_conhecimento WHERE disciplina = ? AND topico = ?'
          ).all(d, top);
          if (rowsTop.length > 0) {
            const sorteado = rowsTop[Math.floor(Math.random() * rowsTop.length)];
            const formatado = `[${sorteado.fonte} — ${sorteado.referencia}]\n${sorteado.texto}`;
            basePorTopico[`${d}::${top}`] = formatado;
            if (blocosFallback.length < 3) {
              blocosFallback.push(formatado);
              trechosLegais.push({ fonte: sorteado.fonte, referencia: sorteado.referencia, disciplina: d, topico: top });
            }
          }
        }
      }
      baseLegal = blocosFallback.join('\n\n');
    }

    if (candidateQuestions.length === 0) {
      return res.json({ snippets: '', itens: [], evitarRepeticao, baseLegal, basePorTopico, trechosLegais, topicosSugeridos, topScores: [] });
    }

    const maxItems = Math.max(2, Math.min(6, Number(limite) || 4));
    const topItems = rankCandidatesWithBM25AndMMR(searchPhrase, candidateQuestions, maxItems);

    // Só envia texto_base longo como exemplo quando a questão for de Língua Portuguesa (economiza ~60% dos tokens de exemplo)
    const itens = topItems.map((item) => {
      const q = item.q;
      const alts = typeof q.alternativas_json === 'string' ? JSON.parse(q.alternativas_json) : q.alternativas_json;
      const incluirTextoBase = q.disciplina === 'Língua Portuguesa' && q.texto_base;
      return `[ITEM REAL ${q.banca.toUpperCase()} (${q.prova_nome} Q${q.numero} • ${q.topico || q.disciplina})]
Disciplina: ${q.disciplina}
${incluirTextoBase ? `Texto-base: ${q.texto_base.slice(0, 650)}\n` : ''}Enunciado: ${q.enunciado}
(A) ${alts.A || ''}
(B) ${alts.B || ''}
(C) ${alts.C || ''}
(D) ${alts.D || ''}
(E) ${alts.E || ''}
Gabarito: ${q.gabarito_oficial || 'N/D'}`;
    });

    res.json({
      snippets: itens.join('\n\n'),
      itens,
      evitarRepeticao,
      baseLegal,
      basePorTopico,
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
      INSERT INTO base_conhecimento (fonte, disciplina, topico, referencia, texto, vetor_json, data_criacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fonte, referencia) DO UPDATE SET texto = excluded.texto, vetor_json = excluded.vetor_json, disciplina = excluded.disciplina, topico = excluded.topico
    `);
    const agora = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const c of chunks) {
        const topicoChunk = req.body.topico || (disciplina ? classificarTopico(disciplina, `${c.referencia} ${c.texto.slice(0, 150)}`, '') : null);
        ins.run(String(fonte).trim(), disciplina || null, topicoChunk || null, c.referencia, c.texto, JSON.stringify(computeTFVector(`${c.referencia} ${c.texto}`)), agora);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    invalidarCorpus();
    sincronizarBaseFts(true);
    res.json({ success: true, trechos: chunks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Consulta instantânea offline na Base de Conhecimento ("Letra da Lei" / Fichas do Edital) sem consumir tokens de IA
app.get('/api/base/buscar', (req, res) => {
  try {
    const { q = '', disciplina = '', topico = '', limite = 5 } = req.query;
    const disciplinas = disciplina ? String(disciplina).split(',').map((d) => d.trim()).filter(Boolean) : [];
    const topicos = topico ? [String(topico).trim()] : [];
    const lim = Math.max(1, Math.min(20, Number(limite) || 5));

    if (!String(q).trim()) {
      let sql = 'SELECT id, fonte, disciplina, topico, referencia, texto FROM base_conhecimento WHERE 1=1';
      const params = [];
      if (disciplinas.length > 0) {
        sql += ` AND disciplina IN (${disciplinas.map(() => '?').join(',')})`;
        params.push(...disciplinas);
      }
      if (topicos.length > 0) {
        sql += ' AND topico = ?';
        params.push(topicos[0]);
      }
      sql += ' ORDER BY id ASC LIMIT ?';
      params.push(lim);
      return res.json({ resultados: db.prepare(sql).all(...params).map((r) => ({ ...r, score: 1 })) });
    }

    const hits = buscarBaseConhecimento({
      disciplinas,
      topicos,
      query: String(q),
      limite: lim,
      minScore: 0.05
    });
    res.json({
      resultados: hits.map((h) => ({
        id: h.q.id,
        fonte: h.q.fonte,
        disciplina: h.q.disciplina,
        topico: h.q.topico,
        referencia: h.q.referencia,
        texto: h.q.texto,
        score: h.cosseno
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/base/stats', (req, res) => {
  try {
    res.json(db.prepare('SELECT fonte, disciplina, topico, COUNT(*) as trechos FROM base_conhecimento GROUP BY fonte, disciplina, topico ORDER BY fonte').all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/base/:fonte', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM base_conhecimento WHERE fonte = ?').run(req.params.fonte);
    invalidarCorpus();
    sincronizarBaseFts(true);
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
        simulado_id, questao_numero, disciplina, assunto, topico, dificuldade, origem, fonte, fonte_legal,
        tipo_cognitivo, enunciado, texto_base, alternativas_json, gabarito,
        resposta_usuario, acertou, marcou_duvida, dica, explicacao_json, tempo_segundos, data_hora
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 3. Caderno de Erros (Leitner). Erro => Caixa 1 (+1 dia). Acerto marcado como dúvida => Caixa 2 (+3 dias), sem punir.
    const insertErro = db.prepare(`
      INSERT INTO caderno_erros (
        questao_id, disciplina, assunto, topico, fonte_legal, enunciado, hash_enunciado, alternativas_json, gabarito,
        explicacao_json, caixa_leitner, total_tentativas, total_acertos, data_ultimo_erro,
        data_proxima_revisao, status, origem_erro
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'PENDENTE', ?)
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
          q.fonteLegal || q.fonte_legal || null,
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
              q.fonteLegal || q.fonte_legal || null,
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
    const { disciplina, assunto, simuladoId, modo, limite } = req.query;

    const conds = [];
    const params = [];
    if (disciplina && disciplina !== 'TODAS') {
      conds.push('disciplina = ?');
      params.push(disciplina);
    }
    if (assunto && assunto !== 'TODOS') {
      conds.push('(assunto = ? OR topico = ?)');
      params.push(assunto, assunto);
    }
    if (simuladoId && simuladoId !== 'TODOS') {
      conds.push('simulado_id = ?');
      params.push(Number(simuladoId));
    }
    if (modo && modo !== 'TODOS') {
      conds.push('simulado_id IN (SELECT id FROM simulados WHERE modo = ?)');
      params.push(modo);
    }
    const whereSql = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';

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
      ${whereSql}
    `).get(...params);

    const disciplinaStats = db.prepare(`
      SELECT
        disciplina,
        COUNT(id) as total,
        SUM(CASE WHEN acertou = 1 THEN 1 ELSE 0 END) as acertos,
        ROUND((SUM(CASE WHEN acertou = 1 THEN 1.0 ELSE 0.0 END) / COUNT(id)) * 100, 1) as taxa,
        ROUND(AVG(tempo_segundos), 0) as tempo_medio
      FROM questoes_respondidas
      ${whereSql}
      GROUP BY disciplina
      ORDER BY taxa ASC
    `).all(...params);

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

    // Tópicos canônicos do edital
    const assuntoWhere = conds.length > 0 
      ? `WHERE ${conds.join(' AND ')} AND COALESCE(NULLIF(topico, ''), assunto) IS NOT NULL`
      : `WHERE COALESCE(NULLIF(topico, ''), assunto) IS NOT NULL`;
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
      ${assuntoWhere}
      GROUP BY disciplina, COALESCE(NULLIF(topico, ''), assunto)
      ORDER BY taxa ASC
    `).all(...params);

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
      ${whereSql}
      GROUP BY UPPER(COALESCE(origem, 'INÉDITA'))
    `).all(...params);

    const limiteEvolucao = Math.max(5, Math.min(200, Number(limite) || 30));
    const evolucao = db.prepare(`
      SELECT id, data_hora, disciplina, assunto, modo, total_questoes, acertos,
             ROUND(taxa_acerto, 1) as taxa_acerto, tempo_segundos, ROUND(tempo_medio_questao, 0) as tempo_medio_questao
      FROM simulados ORDER BY id DESC LIMIT ?
    `).all(limiteEvolucao).reverse();

    // Detalhes de teste individual (quando filtrado por simuladoId)
    let questoesDoSimulado = [];
    let simuladoDetalhes = null;
    if (simuladoId && simuladoId !== 'TODOS') {
      simuladoDetalhes = db.prepare('SELECT * FROM simulados WHERE id = ?').get(Number(simuladoId)) || null;
      questoesDoSimulado = db.prepare(`
        SELECT id, questao_numero, disciplina, COALESCE(NULLIF(topico, ''), assunto) as assunto,
               enunciado, gabarito, resposta_usuario, acertou, tempo_segundos, marcou_duvida, explicacao_json
        FROM questoes_respondidas
        WHERE simulado_id = ?
        ORDER BY questao_numero ASC, id ASC
      `).all(Number(simuladoId));
    }

    // Catálogo de filtros para o frontend
    const filtrosDisponiveis = {
      disciplinas: db.prepare('SELECT DISTINCT disciplina FROM questoes_respondidas ORDER BY disciplina ASC').all().map(r => r.disciplina),
      assuntos: db.prepare(`
        SELECT DISTINCT disciplina, COALESCE(NULLIF(topico, ''), assunto) as assunto, COUNT(id) as total
        FROM questoes_respondidas
        WHERE COALESCE(NULLIF(topico, ''), assunto) IS NOT NULL
        GROUP BY disciplina, COALESCE(NULLIF(topico, ''), assunto)
        ORDER BY assunto ASC
      `).all(),
      simulados: db.prepare(`
        SELECT id, data_hora, disciplina, assunto, modo, total_questoes, acertos, erros, taxa_acerto, tempo_segundos, tempo_medio_questao
        FROM simulados
        ORDER BY id DESC
      `).all()
    };

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
      coberturaEdital,
      filtroAtivo: {
        disciplina: (disciplina && disciplina !== 'TODAS') ? disciplina : null,
        assunto: (assunto && assunto !== 'TODOS') ? assunto : null,
        simuladoId: (simuladoId && simuladoId !== 'TODOS') ? Number(simuladoId) : null,
        modo: (modo && modo !== 'TODOS') ? modo : null
      },
      filtrosDisponiveis,
      simuladoDetalhes,
      questoesDoSimulado
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DA API: CONFIGURAÇÕES E CHAVE
// ==========================================

registrarRotasConfig(app, db);

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
        hash_enunciado, disciplina, assunto, topico, sub_topico, banca, tipo, fonte_legal, dificuldade,
        enunciado, texto_base, alternativas_json, gabarito, dica, explicacao_json,
        palavras_chave, verificada, total_vezes_usada, ultima_data_resolucao, data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
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
          q.fonteLegal || q.fonte_legal || null,
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
        fonteLegal: q.fonte_legal || null,
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
registrarRotasEstudo(app, db);
registrarRotasVade(app, db);
registrarRotasPainel(app, db);

// Em produção (npm start) o próprio Express serve o front-end compilado
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/,(req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Servidor SQLite Backend] Rodando em http://localhost:${PORT}`);
});
 // reload
