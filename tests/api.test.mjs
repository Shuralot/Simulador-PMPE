import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3977;
const base = `http://localhost:${PORT}/api`;
let proc;
let tmp;

const post = (rota, corpo) => fetch(base + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (rota) => fetch(base + rota).then((r) => r.json());

const questao = (sufixo, extra = {}) => ({
  disciplina: 'Direito Constitucional',
  assunto: 'Segurança Pública',
  enunciado: `Em relação à organização dos órgãos de segurança pública previstos no art. 144 da Constituição, caso ${sufixo}, assinale a alternativa correta.`,
  alternativas: ['A', 'B', 'C', 'D', 'E'].map((l) => ({ letra: l, texto: `Afirmação ${l} específica do caso ${sufixo}` })),
  gabarito: 'B',
  explicacao: { correta: 'A alternativa B reflete a literalidade do art. 144 da CF/88.', distratores: { A: 'a', C: 'c', D: 'd', E: 'e' } },
  ...extra
});

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpmpe-'));
  // VACUUM INTO gera uma cópia consistente mesmo com o servidor em uso (copiar só o .db perderia o conteúdo do WAL)
  const origem = new DatabaseSync(path.join(raiz, 'simulador.db'));
  origem.exec("VACUUM INTO '" + path.join(tmp, 'simulador.db').replace(/'/g, "''") + "'");
  origem.close();
  proc = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: raiz, env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmp, 'simulador.db') } });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('servidor não iniciou')), 20000);
    proc.stdout.on('data', (d) => { if (String(d).includes('Rodando')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => reject(new Error('servidor saiu ' + c)));
  });
});

after(() => {
  proc?.kill();
});

test('triagem: rejeita inválida e duplicada, aceita nova', async () => {
  const q1 = questao('alfa');
  const invalida = { ...questao('beta'), alternativas: questao('beta').alternativas.slice(0, 4) };
  const { body } = await post('/banco/triagem', { questoes: [q1, invalida, q1] });
  assert.equal(body.resultados[0].status, 'OK');
  assert.equal(body.resultados[1].status, 'INVALIDA');
  assert.equal(body.resultados[2].status, 'DUPLICADA'); // igual à primeira do mesmo lote
});

test('salvar: grava só o que passa, quarentena divergentes e devolve ids', async () => {
  const boa = questao('gama', { verificacao: 'OK' });
  const divergente = questao('delta rua distinta', { verificacao: 'DIVERGENTE', enunciado: 'Sobre competências legislativas concorrentes entre União, Estados e Municípios, assinale a alternativa que NÃO apresenta correção técnica.' });
  const semGabarito = { ...questao('epsilon'), gabarito: '' };
  const { body } = await post('/banco/salvar', { questoes: [boa, divergente, semGabarito] });
  assert.equal(body.inseridas, 1);
  assert.equal(body.emQuarentena, 2);
  assert.ok(body.ids[0] > 0);

  const stats = await get('/banco/stats');
  assert.ok(stats.total >= 20);
  const { body: dup } = await post('/banco/salvar', { questoes: [boa] });
  assert.equal(dup.inseridas, 0, 'não reinsere a mesma questão');
});

test('gabarito: importa texto para uma prova', async () => {
  const provas = await get('/provas');
  const pmpe = provas.find((p) => p.id === 'pmpe-2024');
  const { status, body } = await post(`/provas/${pmpe.id}/gabarito`, { texto: '1-A 2-B 3-C' });
  assert.equal(status, 200);
  assert.equal(body.itensLidos, 3);
  const { status: ruim } = await post(`/provas/${pmpe.id}/gabarito`, { texto: 'sem nada útil' });
  assert.equal(ruim, 400);
});

test('base legal: ingere, fatia por artigo e aparece no contexto da IA', async () => {
  const texto = 'Art. 144. A segurança pública, dever do Estado, direito e responsabilidade de todos, é exercida para a preservação da ordem pública e da incolumidade das pessoas e do patrimônio, através dos seguintes órgãos: polícia federal, polícia militar.\nArt. 145. A União, os Estados, o Distrito Federal e os Municípios poderão instituir os seguintes tributos: impostos, taxas e contribuição de melhoria.';
  const { body } = await post('/base/ingerir', { fonte: 'CF/88 teste', disciplina: 'Direito Constitucional', texto });
  assert.equal(body.trechos, 2);
  const ctx = await get('/provas/contexto?disciplinas=' + encodeURIComponent('Direito Constitucional') + '&assunto=' + encodeURIComponent('segurança pública polícia militar'));
  assert.match(ctx.baseLegal, /Art\. 144/);
  assert.ok(Array.isArray(ctx.itens) && ctx.itens.length > 0);
});

test('buscar reais: devolve provaRef, registra uso e evita repetir as mesmas', async () => {
  const { body: a } = await post('/banco/buscar', { disciplinas: ['Língua Portuguesa'], quantidade: 5, somenteReais: true });
  assert.equal(a.questoes.length, 5);
  assert.ok(a.questoes.every((q) => q.provaRef && q.origem === 'REAL' && /^[A-E]$/.test(q.gabarito)));

  const { body: b } = await post('/banco/buscar', { disciplinas: ['Língua Portuguesa'], quantidade: 5, somenteReais: true });
  const chaves = new Set(a.questoes.map((q) => `${q.provaRef.prova_id}#${q.provaRef.numero}`));
  assert.ok(b.questoes.every((q) => !chaves.has(`${q.provaRef.prova_id}#${q.provaRef.numero}`)), 'segundo sorteio prioriza as não vistas');

  await post('/banco/resultado', { resultados: [{ provaRef: a.questoes[0].provaRef, acertou: false }] });
});

test('simulado: caderno com dúvida/erro, deduplicação e preservação ao excluir', async () => {
  const q = (n, resp) => ({ ...questao('sim' + n), respostaUsuario: resp, marcouDuvida: resp === 'B' && n === 2, tempoSegundos: 40 });
  const payload = { disciplina: 'Direito Constitucional', assunto: 'x', modo: 'estudo', total_questoes: 3, acertos: 1, erros: 2, tempo_segundos: 120, questoes: [q(1, 'A'), q(2, 'B'), q(3, 'C')] };
  const { body } = await post('/simulados', payload);
  assert.equal(body.success, true);

  let caderno = await get('/caderno-erros');
  const erro = caderno.find((c) => c.enunciado.includes('caso sim1'));
  const duvida = caderno.find((c) => c.enunciado.includes('caso sim2'));
  assert.equal(erro.caixa_leitner, 1);
  assert.equal(erro.origem_erro, 'ERRO');
  assert.equal(duvida.caixa_leitner, 2, 'acerto com dúvida entra na caixa 2');
  assert.equal(duvida.origem_erro, 'DUVIDA');

  // errar o mesmo enunciado de novo não duplica o cartão
  await post('/simulados', { ...payload, questoes: [q(1, 'A')], total_questoes: 1, acertos: 0, erros: 1 });
  caderno = await get('/caderno-erros');
  assert.equal(caderno.filter((c) => c.enunciado.includes('caso sim1')).length, 1);

  // excluir o simulado não apaga os cartões do caderno
  const sims = await get('/simulados');
  for (const s of sims) await fetch(`${base}/simulados/${s.id}`, { method: 'DELETE' });
  caderno = await get('/caderno-erros');
  assert.ok(caderno.some((c) => c.enunciado.includes('caso sim1')));
});

test('desempenho: nota com intervalo, tópicos canônicos e cobertura', async () => {
  const d = await get('/desempenho');
  assert.ok(d.global.notaProjetadaMin60 <= d.global.notaProjetada60 && d.global.notaProjetada60 <= d.global.notaProjetadaMax60);
  assert.ok(['baixa', 'media', 'alta'].includes(d.global.confiancaProjecao));
  assert.equal(d.notaPorDisciplina.length, 6);
  assert.ok(d.coberturaEdital.every((c) => c.topicos.length > 0));
});

test('qualidade das provas: sem questão órfã e com tópicos', async () => {
  const q = await get('/provas/qualidade');
  assert.equal(q.length, 3);
  for (const p of q) assert.ok(Object.keys(p.por_topico).length > 3);
});

test('rodízio: chamadas seguidas (com e sem tema) não repetem as mesmas questões', async () => {
  const ids = (qs) => qs.map((q) => (q.provaRef ? `${q.provaRef.prova_id}#${q.provaRef.numero}` : `b${q.bancoId}`));
  for (const tema of ['', 'Interpretação de Texto']) {
    const vistas = new Set();
    for (let rodada = 0; rodada < 3; rodada++) {
      const { body } = await post('/banco/buscar', { disciplinas: ['Língua Portuguesa'], tema, quantidade: 2 });
      assert.equal(body.questoes.length, 2);
      for (const id of ids(body.questoes)) assert.ok(!vistas.has(id), `repetiu ${id} na rodada ${rodada} (tema="${tema}")`);
      ids(body.questoes).forEach((id) => vistas.add(id));
    }
  }
});

test('contexto da IA sugere tópicos menos praticados', async () => {
  const ctx = await get('/provas/contexto?disciplinas=' + encodeURIComponent('Informática'));
  assert.ok(ctx.topicosSugeridos['Informática'].length >= 5);
});

test('chips: tópicos do edital com contagem coerente com o sorteio', async () => {
  const c = await post('/banco/contagem', { disciplinas: ['Direito Constitucional'], tema: '', chips: [] });
  const topicos = c.body.topicos;
  assert.ok(topicos.length >= 4, 'mais de um punhado de tópicos');
  const soma = topicos.reduce((a, t) => a + t.total, 0);
  assert.ok(soma <= c.body.totalLocalGeral + c.body.totalProvasGeral);

  const t = topicos[0];
  const foco = await post('/banco/contagem', { disciplinas: ['Direito Constitucional'], tema: t.topico, chips: [] });
  assert.ok(foco.body.focoTemaTotal >= t.total);
  const { body } = await post('/banco/buscar', { disciplinas: ['Direito Constitucional'], tema: t.topico, quantidade: Math.min(t.total, 20) });
  assert.equal(body.questoes.length, Math.min(t.total, 20));
});

test('auditoria: banco saneado, sem duplicatas de provas e sem problemas', async () => {
  const a = await get('/banco/auditoria');
  assert.deepEqual(a.problemas, []);
  const todas = await post('/banco/buscar', { disciplinas: [], tema: '', quantidade: 60, somenteIneditas: true });
  assert.ok(todas.body.questoes.every((q) => q.origem === 'INÉDITA'));
});
