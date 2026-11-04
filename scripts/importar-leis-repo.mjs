// Constrói e atualiza 100% da Base de Conhecimento exclusiva para SOLDADO PMPE 2026 (Cargo 201 — Praça QPMG — Anexo II).
// - Zero matérias de Oficial (remove Desarmamento e itens alheios ao QPMG).
// - CF/88 completa nos capítulos cobrados para Soldado (Arts. 1–144, com separação automática de Remédios Constitucionais).
// - Lei Estadual PE nº 6.783/1974 (Estatuto dos Policiais Militares de PE — texto consolidado atualizado da ALEPE, salvo em cache local).
// - Lei nº 9.605/1998 (Crimes Ambientais — Item 11 do Edital).
// - ECA e Estatuto da Pessoa Idosa filtrados cirurgicamente para os artigos de atuação policial, ato infracional, Conselho Tutelar e crimes.
// - Súmulas STF/STJ e Fichas Técnicas de História de PE, Informática e Direitos Humanos.
// - Reconstrói o índice nativo SQLite FTS5 (BM25) ao final.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkLei } from '../lib/leis.mjs';
import { normalizeText, tokenizar, computeTFVector } from '../lib/texto.mjs';
import { FICHAS_SOLDADO_PMPE } from '../lib/fichasSoldado.mjs';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(process.env.DB_PATH || path.join(raiz, 'simulador.db'));
const pastaLeisCache = path.join(raiz, 'docs', 'leis');
fs.mkdirSync(pastaLeisCache, { recursive: true });

try { db.exec('ALTER TABLE base_conhecimento ADD COLUMN topico TEXT'); } catch {}
db.exec('CREATE INDEX IF NOT EXISTS idx_base_disciplina ON base_conhecimento(disciplina)');
db.exec('CREATE INDEX IF NOT EXISTS idx_base_topico ON base_conhecimento(topico)');
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS base_conhecimento_fts USING fts5(
    chunk_id UNINDEXED,
    fonte,
    disciplina,
    topico,
    referencia,
    texto_norm
  );
`);

const BASE_URL = 'https://raw.githubusercontent.com/ctresb/leis/main';

// Extrai apenas o enunciado normativo puro de súmulas do STF e STJ (descartando JSON bruto do CNJ e dezenas de páginas de acórdãos)
function extrairEnunciadoSumula(rawText, fonte) {
  const semFront = String(rawText || '').replace(/\r/g, '').replace(/^---[\s\S]*?---\n+/, '');
  // Formato STF (CNJ): ## Questão ... ## Tese
  const mStf = semFront.match(/##\s*Quest[aã]o\s+([\s\S]*?)(?=\n##\s*Tese|\n##\s*Situa|\n```|$)/i);
  if (mStf && mStf[1].trim().length > 20) {
    return mStf[1].replace(/\s+/g, ' ').trim();
  }
  // Formato STJ: Enunciado ... Órgão Julgador
  const mStj = semFront.match(/Enunciado\s*\n([\s\S]*?)(?=\n[ÓO]rg[aã]o\s+Julgador|\nData\s+da\s+Decis|\nRefer[êe]ncias\s+Legislativas|$)/i);
  if (mStj && mStj[1].trim().length > 20) {
    return mStj[1].replace(/\s+/g, ' ').trim();
  }
  return semFront.split(/##\s*Registro original|Excerto dos Precedentes/i)[0].replace(/\s+/g, ' ').trim().slice(0, 600);
}

// Extrai o texto atualizado consolidado da Lei Estadual PE nº 6.783/1974 direto do portal Alepe Legis (com cache local)
async function obterEstatutoPmpe6783() {
  const arqCache = path.join(pastaLeisCache, 'lei-estadual-pe-6783-1974.md');
  if (fs.existsSync(arqCache)) {
    const salvo = fs.readFileSync(arqCache, 'utf8');
    if (salvo.length > 20000) return salvo;
  }
  const urlAlepe = 'https://legis.alepe.pe.gov.br/texto.aspx?id=1032&tipo=TEXTOATUALIZADO';
  const res = await fetch(urlAlepe);
  if (!res.ok) throw new Error(`ALEPE HTTP ${res.status}`);
  const html = await res.text();
  let texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(strike|del|s)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<span[^>]*line-through[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ordm;/gi, 'º')
    .replace(/&ordf;/gi, 'ª')
    .replace(/&sect;/gi, '§')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  const ini = texto.search(/Art\.\s*1º\s*O\s+presente\s+Estatuto/i);
  const fim = texto.indexOf('Este texto não substitui o publicado no Diário Oficial');
  if (ini !== -1) texto = texto.slice(ini, fim !== -1 ? fim : undefined).trim();
  fs.writeFileSync(arqCache, texto, 'utf8');
  return texto;
}

// Lista 100% alinhada ao Anexo II — Cargo 201: SOLDADO (Praça da Polícia Militar QPMG) — Edital 001/2026
const LEIS_SOLDADO_2026 = [
  // ==========================================
  // 1. CONSTITUIÇÃO FEDERAL DE 1988 (Itens 1 a 5 de Direito Constitucional)
  // ==========================================
  {
    fonte: 'Constituição Federal de 1988',
    disciplina: 'Direito Constitucional',
    url: `${BASE_URL}/constituicao.md`,
    filtroArtigos: (num) => num >= 1 && num <= 144,
    topicoPorArtigo: (num, textoChunk) => {
      if (num >= 1 && num <= 4) return 'Princípios Fundamentais';
      if (num === 5) {
        if (/habeas\s+corpus|mandado\s+de\s+seguran[cç]a|mandado\s+de\s+injun[cç][aã]o|habeas\s+data|a[cç][aã]o\s+popular/i.test(textoChunk)) {
          return 'Remédios Constitucionais';
        }
        return 'Direitos e Garantias Fundamentais';
      }
      if (num >= 6 && num <= 17) return 'Direitos Sociais, Nacionalidade e Políticos';
      if (num >= 18 && num <= 36) return 'Organização do Estado';
      if (num >= 37 && num <= 43) return 'Administração Pública e Servidores';
      if (num >= 44 && num <= 135) return 'Poderes da República e Funções Essenciais';
      if (num >= 136 && num <= 143) return 'Defesa do Estado e Forças Armadas';
      if (num === 144) return 'Segurança Pública';
      return 'Direitos e Garantias Fundamentais';
    }
  },

  // ==========================================
  // 2. DIREITOS HUMANOS E LEGISLAÇÃO EXTRAVAGANTE (Itens 4 a 17 de Soldado QPMG)
  // ==========================================
  {
    fonte: 'Declaração Universal dos Direitos Humanos (ONU - 1948)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Direitos Humanos e Tratados Internacionais',
    url: `${BASE_URL}/tratados/direitos-humanos/direitos.md`
  },
  {
    fonte: 'Convenção Americana sobre Direitos Humanos (Pacto de San José - Dec. 678/1992)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Direitos Humanos e Tratados Internacionais',
    url: `${BASE_URL}/tratados/direitos-humanos/sanjose.md`
  },
  {
    fonte: 'Lei nº 8.069/1990 (ECA — Escopo Policial Soldado PMPE)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'ECA (Atuação Policial e Ato Infracional)',
    url: `${BASE_URL}/federal/leis-ordinarias/1990/lei-8069-1990-07-13.md`,
    // Item 6 Edital: direitos fundamentais, prevenção policial, ato infracional, direitos individuais/apreensão, Conselho Tutelar, crimes e infrações
    filtroArtigos: (num) =>
      (num >= 1 && num <= 18) ||
      (num >= 70 && num <= 85) ||
      (num >= 103 && num <= 128) ||
      (num >= 131 && num <= 140) ||
      (num >= 171 && num <= 190) ||
      (num >= 225 && num <= 258)
  },
  {
    fonte: 'Lei nº 13.869/2019 (Abuso de Autoridade)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Abuso de Autoridade',
    url: `${BASE_URL}/federal/leis-ordinarias/2019/lei-13869-2019-09-05.md`
  },
  {
    fonte: 'Lei nº 9.455/1997 (Lei de Tortura)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Tortura',
    url: `${BASE_URL}/federal/leis-ordinarias/1997/lei-9455-1997-04-07.md`
  },
  {
    fonte: 'Lei nº 11.340/2006 (Lei Maria da Penha)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei Maria da Penha',
    url: `${BASE_URL}/federal/leis-ordinarias/2006/lei-11340-2006-08-07.md`
  },
  {
    fonte: 'Lei nº 7.716/1989 (Crimes de Preconceito de Raça ou de Cor)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Crimes de Preconceito de Raça ou de Cor',
    url: `${BASE_URL}/federal/leis-ordinarias/1989/lei-7716-1989-01-05.md`
  },
  {
    fonte: 'Lei nº 9.605/1998 (Lei dos Crimes Ambientais)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Crimes Ambientais',
    url: `${BASE_URL}/federal/leis-ordinarias/1998/lei-9605-1998-02-12.md`
  },
  {
    fonte: 'Lei nº 8.072/1990 (Lei dos Crimes Hediondos)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Crimes Hediondos',
    url: `${BASE_URL}/federal/leis-ordinarias/1990/lei-8072-1990-07-25.md`
  },
  {
    fonte: 'Lei nº 11.343/2006 (Lei de Drogas)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei de Drogas',
    url: `${BASE_URL}/federal/leis-ordinarias/2006/lei-11343-2006-08-23.md`
  },
  {
    fonte: 'Lei Estadual PE nº 6.783/1974 (Estatuto dos Policiais Militares de PE)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Estatuto dos Policiais Militares de PE',
    loaderCustom: obterEstatutoPmpe6783
  },
  {
    fonte: 'Lei nº 10.741/2003 (Estatuto da Pessoa Idosa — Atuação Policial e Crimes)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Estatuto da Pessoa Idosa',
    url: `${BASE_URL}/federal/leis-ordinarias/2003/lei-10741-2003-10-01.md`,
    // Item 15 Edital: disposições pertinentes à atuação policial e crimes em espécie
    filtroArtigos: (num) =>
      (num >= 1 && num <= 10) ||
      num === 19 ||
      (num >= 43 && num <= 45) ||
      (num >= 52 && num <= 55) ||
      (num >= 93 && num <= 114)
  },
  {
    fonte: 'Lei nº 12.852/2013 (Estatuto da Juventude)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Estatuto da Juventude',
    url: `${BASE_URL}/federal/leis-ordinarias/2013/lei-12852-2013-08-05.md`
  },

  // ==========================================
  // 3. SÚMULAS DOS TRIBUNAIS SUPERIORES (STF & STJ)
  // ==========================================
  {
    fonte: 'Súmula Vinculante nº 11 STF (Uso de Algemas)',
    disciplina: 'Direito Constitucional',
    topico: 'Segurança Pública',
    url: `${BASE_URL}/jurisprudencia/stf/sumulas-vinculantes/sumula-vinculante-11.md`
  },
  {
    fonte: 'Súmula Vinculante nº 13 STF (Vedação ao Nepotismo)',
    disciplina: 'Direito Constitucional',
    topico: 'Administração Pública e Servidores',
    url: `${BASE_URL}/jurisprudencia/stf/sumulas-vinculantes/sumula-vinculante-13.md`
  },
  {
    fonte: 'Súmula Vinculante nº 14 STF (Acesso do Defensor ao Inquérito)',
    disciplina: 'Direito Constitucional',
    topico: 'Direitos e Garantias Fundamentais',
    url: `${BASE_URL}/jurisprudencia/stf/sumulas-vinculantes/sumula-vinculante-14.md`
  },
  {
    fonte: 'Súmula Vinculante nº 26 STF (Individualização da Pena em Hediondos)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Crimes Hediondos',
    url: `${BASE_URL}/jurisprudencia/stf/sumulas-vinculantes/sumula-vinculante-26.md`
  },
  {
    fonte: 'Súmula nº 536 STJ (Maria da Penha — Inaplicabilidade da Lei 9.099/95)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei Maria da Penha',
    url: `${BASE_URL}/jurisprudencia/stj/sumulas/sumula-536.md`
  },
  {
    fonte: 'Súmula nº 542 STJ (Maria da Penha — Ação Pública Incondicionada na Lesão Corporal)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei Maria da Penha',
    url: `${BASE_URL}/jurisprudencia/stj/sumulas/sumula-542.md`
  },
  {
    fonte: 'Súmula nº 588 STJ (Maria da Penha — Vedação de Restritiva de Direitos)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei Maria da Penha',
    url: `${BASE_URL}/jurisprudencia/stj/sumulas/sumula-588.md`
  },
  {
    fonte: 'Súmula nº 589 STJ (Maria da Penha — Inaplicabilidade do Princípio da Insignificância)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei Maria da Penha',
    url: `${BASE_URL}/jurisprudencia/stj/sumulas/sumula-589.md`
  },
  {
    fonte: 'Súmula nº 600 STJ (Maria da Penha — Coabitação Desnecessária)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei Maria da Penha',
    url: `${BASE_URL}/jurisprudencia/stj/sumulas/sumula-600.md`
  },
  {
    fonte: 'Súmula nº 607 STJ (Lei de Drogas — Majorante da Interestadualidade)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'Lei de Drogas',
    url: `${BASE_URL}/jurisprudencia/stj/sumulas/sumula-607.md`
  },
  {
    fonte: 'Súmula nº 342 STJ (ECA — Oitiva Informal e Defesa Técnica)',
    disciplina: 'Direitos Humanos e Legislação Extravagante',
    topico: 'ECA (Atuação Policial e Ato Infracional)',
    url: `${BASE_URL}/jurisprudencia/stj/sumulas/sumula-342.md`
  }
];

const ins = db.prepare(`
  INSERT INTO base_conhecimento (fonte, disciplina, topico, referencia, texto, vetor_json, data_criacao)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(fonte, referencia) DO UPDATE SET
    texto = excluded.texto,
    vetor_json = excluded.vetor_json,
    disciplina = excluded.disciplina,
    topico = excluded.topico
`);

async function executarImportacao() {
  console.log('=== RECONSTRUINDO BASE DE CONHECIMENTO EXCLUSIVA SOLDADO PMPE 2026 (QPMG) ===');
  const agora = new Date().toISOString();

  // Limpa base anterior para remover leis de Oficial (ex: Desarmamento) e chunks antigos de 3500 chars
  db.exec('DELETE FROM base_conhecimento');
  db.exec('DELETE FROM base_conhecimento_fts');

  let totalGravados = 0;

  for (const item of LEIS_SOLDADO_2026) {
    process.stdout.write(`Processando ${item.fonte}... `);
    try {
      let rawText = '';
      if (item.loaderCustom) {
        rawText = await item.loaderCustom();
      } else {
        const res = await fetch(item.url);
        if (!res.ok) {
          console.log(`[ERRO HTTP ${res.status}]`);
          continue;
        }
        rawText = await res.text();
      }

      const ehSumula = /S[úu]mula/i.test(item.fonte);
      const chunks = ehSumula
        ? [{
            referencia: (item.fonte.match(/S[úu]mula(?:\s+Vinculante)?\s*n[º°.]?\s*\d+\s*(?:STF|STJ)?/i) || [item.fonte])[0],
            texto: extrairEnunciadoSumula(rawText, item.fonte)
          }]
        : chunkLei(rawText);
      let gravadosItem = 0;

      db.exec('BEGIN');
      for (const c of chunks) {
        let numArt = null;
        const matchNum = c.referencia.match(/Art\.\s*(\d+)/i);
        if (matchNum) numArt = parseInt(matchNum[1], 10);

        if (item.filtroArtigos) {
          if (numArt === null || !item.filtroArtigos(numArt)) continue;
        }

        const topicoFinal = item.topicoPorArtigo
          ? item.topicoPorArtigo(numArt || 0, c.texto)
          : item.topico;

        const vec = computeTFVector(`${item.fonte} ${topicoFinal} ${c.referencia} ${c.texto}`);
        ins.run(item.fonte, item.disciplina, topicoFinal, c.referencia, c.texto, JSON.stringify(vec), agora);
        gravadosItem++;
        totalGravados++;
      }
      db.exec('COMMIT');
      console.log(`OK (${gravadosItem} dispositivos)`);
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      console.log(`[FALHA: ${err.message}]`);
    }
  }

  // Ingere fichas técnicas de História de PE, Informática, Teoria Geral de DH e Jurisprudência Policial
  process.stdout.write('Ingerindo Fichas Técnicas (História de PE, Informática, DH e Jurisprudência)... ');
  db.exec('BEGIN');
  for (const f of FICHAS_SOLDADO_PMPE) {
    const vec = computeTFVector(`${f.fonte} ${f.topico} ${f.referencia} ${f.texto}`);
    ins.run(f.fonte, f.disciplina, f.topico, f.referencia, f.texto, JSON.stringify(vec), agora);
    totalGravados++;
  }
  db.exec('COMMIT');
  console.log(`OK (${FICHAS_SOLDADO_PMPE.length} fichas)`);

  // Reconstrói índice FTS5 BM25
  process.stdout.write('Sincronizando índice nativo SQLite FTS5 (BM25)... ');
  db.exec('BEGIN');
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
  console.log('OK!');

  const resumo = db.prepare(`
    SELECT disciplina, topico, COUNT(*) as qtd
    FROM base_conhecimento
    GROUP BY disciplina, topico
    ORDER BY disciplina, qtd DESC
  `).all();

  console.log(`\n=== CONCLUÍDO: ${totalGravados} TRECHOS INDEXADOS PARA SOLDADO PMPE 2026 ===`);
  console.table(resumo);
  db.close();
}

executarImportacao();
