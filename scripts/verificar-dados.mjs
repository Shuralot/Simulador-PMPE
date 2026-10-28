import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTemaMatcher } from '../lib/temaMatcher.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new DatabaseSync(path.join(__dirname, '..', 'simulador.db'));

let falhas = 0;
function check(nome, condicao, detalhe = '') {
  if (condicao) {
    console.log(`✅ [PASS] ${nome}${detalhe ? ` (${detalhe})` : ''}`);
  } else {
    falhas++;
    console.error(`❌ [FAIL] ${nome}${detalhe ? ` -> ${detalhe}` : ''}`);
  }
}

// 1. Verificar total de questões e gabaritos das 3 provas
const provasStats = db.prepare(`
  SELECT
    prova_id,
    COUNT(*) as total,
    SUM(CASE WHEN gabarito_oficial IS NOT NULL OR anulada = 1 THEN 1 ELSE 0 END) as gabaritadas,
    SUM(CASE WHEN disciplina = 'Conhecimentos Gerais' THEN 1 ELSE 0 END) as genericas,
    SUM(CASE WHEN LENGTH(alternativas_json) > 2600 THEN 1 ELSE 0 END) as cauda_suja
  FROM questoes_provas
  GROUP BY prova_id
`).all();

const mapProvas = Object.fromEntries(provasStats.map(r => [r.prova_id, r]));

check('PMPE 2024 possui 60 questões 100% gabaritadas',
  mapProvas['pmpe-2024']?.total === 60 && mapProvas['pmpe-2024']?.gabaritadas === 60,
  JSON.stringify(mapProvas['pmpe-2024']));

check('PMDF 2023 possui 80 questões 100% gabaritadas',
  mapProvas['pmdf-2023']?.total === 80 && mapProvas['pmdf-2023']?.gabaritadas === 80,
  JSON.stringify(mapProvas['pmdf-2023']));

check('PC-GO 2022 possui 80 questões 100% gabaritadas',
  mapProvas['pcgo-2022']?.total === 80 && mapProvas['pcgo-2022']?.gabaritadas === 80,
  JSON.stringify(mapProvas['pcgo-2022']));

// 2. Verificar zero questões em 'Conhecimentos Gerais' e zero cauda suja (>2600 chars)
const totalGenericas = provasStats.reduce((acc, r) => acc + (r.genericas || 0), 0);
const totalCaudaSuja = provasStats.reduce((acc, r) => acc + (r.cauda_suja || 0), 0);

check('Zero questões órfãs em Conhecimentos Gerais', totalGenericas === 0, `encontradas: ${totalGenericas}`);
check('Zero alternativas E contaminadas com cabeçalhos/redação', totalCaudaSuja === 0, `encontradas: ${totalCaudaSuja}`);

// 3. Verificar texto_base extraído para Português PMPE 2024 (Q1-Q10), PMDF 2023 (Q1-Q8) e PC-GO 2022 (Q1-Q10)
const comTextoBase = db.prepare(`
  SELECT COUNT(*) as c FROM questoes_provas WHERE texto_base IS NOT NULL AND LENGTH(texto_base) >= 120
`).get().c;
check('Texto-base associado às questões de interpretação (mín. 28 questões)', comTextoBase >= 28, `associadas: ${comTextoBase}`);

// 4. Verificar normalização de banco_questoes.tipo
const tiposInvalidos = db.prepare(`
  SELECT COUNT(*) as c FROM banco_questoes WHERE tipo IS NULL OR tipo NOT IN ('INÉDITA', 'REAL')
`).get().c;
check('Coluna tipo em banco_questoes 100% normalizada', tiposInvalidos === 0, `inválidos: ${tiposInvalidos}`);

// 5. Verificar SQL com aspas simples (caderno_erros e configuracoes)
try {
  db.prepare("SELECT * FROM caderno_erros WHERE status = 'PENDENTE'").all();
  db.prepare("SELECT valor FROM configuracoes WHERE chave = 'gemini_api_key'").get();
  check('Queries SQL de caderno_erros e configuracoes executam sem erro', true);
} catch (err) {
  check('Queries SQL de caderno_erros e configuracoes executam sem erro', false, err.message);
}

// 6. Verificar filtro de temas ("Artigo 1 a 5 da CF" não dá falso positivo em Art. 144)
const mArt1a5 = buildTemaMatcher('Artigo 1 a 5 da CF');
const matchArt5 = mArt1a5.matches({
  disciplina: 'Direito Constitucional',
  assunto: 'Direitos e Garantias Fundamentais (Art. 5º)',
  enunciado: 'Nos termos do art. 5º da Constituição Federal...'
});
const matchArt144 = mArt1a5.matches({
  disciplina: 'Direito Constitucional',
  assunto: 'Segurança Pública (Art. 144, § 5º da CF/88)',
  enunciado: 'Às polícias militares cabem a polícia ostensiva e a preservação da ordem pública (art. 144).'
});
check('Matcher de tema aceita Art. 5º e rejeita Art. 144 na busca "Artigo 1 a 5 da CF"',
  matchArt5 === true && matchArt144 === false,
  `matchArt5=${matchArt5}, matchArt144=${matchArt144}`);

console.log('\n========================================');
if (falhas === 0) {
  console.log('RESULTADO: TUDO OK');
  process.exit(0);
} else {
  console.error(`RESULTADO: ${falhas} FALHA(S) ENCONTRADA(S)`);
  process.exit(1);
}
