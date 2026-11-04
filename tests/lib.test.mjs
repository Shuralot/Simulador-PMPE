import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGabaritoTexto } from '../lib/gabarito.mjs';
import { validarQuestao } from '../lib/validacaoQuestao.mjs';
import { chunkLei } from '../lib/leis.mjs';
import { somarDiasLocal, dataLocalISO } from '../lib/tempo.mjs';
import { TOPICOS_EDITAL, classificarTopico } from '../lib/taxonomia.mjs';
import { extractQuestionsFromExam, removerCabecalhosRodapes, repararPalavrasPartidas, construirVocabulario } from '../lib/parserProvas.mjs';
import { linhasDaPagina } from '../src/utils/linhasPdf.js';
import { computeTFVector, calculateCosineSimilarity, rankCandidates } from '../lib/texto.mjs';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const questaoOk = () => ({
  enunciado: 'Segundo a Constituição Federal, assinale a alternativa correta sobre a segurança pública.',
  alternativas: [
    { letra: 'A', texto: 'Alternativa um' },
    { letra: 'B', texto: 'Alternativa dois' },
    { letra: 'C', texto: 'Alternativa três' },
    { letra: 'D', texto: 'Alternativa quatro' },
    { letra: 'E', texto: 'Alternativa cinco' }
  ],
  gabarito: 'C',
  explicacao: { correta: 'A alternativa C está correta conforme o art. 144 da CF/88.', distratores: { A: 'x', B: 'y', D: 'z', E: 'w' } }
});

test('gabarito: aceita vários formatos', () => {
  assert.deepEqual(parseGabaritoTexto('1-A 2-B 3-C'), { 1: 'A', 2: 'B', 3: 'C' });
  assert.deepEqual(parseGabaritoTexto('01) d\n02) E\n03: X'), { 1: 'D', 2: 'E', 3: 'X' });
  assert.deepEqual(parseGabaritoTexto('1 A 2 B 3 anulada'), { 1: 'A', 2: 'B', 3: 'X' });
  assert.deepEqual(parseGabaritoTexto('{"1":"A","2":"e"}'), { 1: 'A', 2: 'E' });
  assert.deepEqual(parseGabaritoTexto(''), {});
});

test('validação: aceita questão correta e rejeita defeitos', () => {
  assert.equal(validarQuestao(questaoOk()).ok, true);

  const quatro = questaoOk();
  quatro.alternativas.pop();
  assert.equal(validarQuestao(quatro).ok, false);

  const semGabarito = { ...questaoOk(), gabarito: '' };
  assert.equal(validarQuestao(semGabarito).ok, false);

  const todas = questaoOk();
  todas.alternativas[4].texto = 'Todas as anteriores estão corretas';
  assert.equal(validarQuestao(todas).ok, false);

  const repetida = questaoOk();
  repetida.alternativas[1].texto = repetida.alternativas[0].texto;
  assert.equal(validarQuestao(repetida).ok, false);

  const semExplicacao = { ...questaoOk(), explicacao: { correta: '', distratores: {} } };
  assert.equal(validarQuestao(semExplicacao).ok, false);
});

test('leis: fatia por artigo', () => {
  const chunks = chunkLei('Art. 1º A República Federativa do Brasil, formada pela união indissolúvel...\nParágrafo único. Todo o poder emana do povo.\nArt. 2º São Poderes da União, independentes e harmônicos entre si, o Legislativo, o Executivo e o Judiciário.\nArt. 3º Constituem objetivos fundamentais da República Federativa do Brasil construir uma sociedade livre.');
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].referencia, 'Art. 1º');
  assert.match(chunks[0].texto, /Todo o poder emana do povo/);
});

test('tempo: usa o dia local e não UTC', () => {
  // 23:30 local do dia 28 => amanhã é dia 29, independentemente do fuso
  const tarde = new Date(2026, 9, 28, 23, 30);
  assert.equal(dataLocalISO(tarde), '2026-10-28');
  assert.equal(somarDiasLocal(1, tarde), '2026-10-29');
  assert.equal(somarDiasLocal(3, tarde), '2026-10-31');
});

test('taxonomia: classifica tópicos canônicos', () => {
  assert.equal(classificarTopico('Direito Constitucional', 'Habeas Corpus', ''), 'Remédios Constitucionais');
  assert.equal(classificarTopico('Língua Portuguesa', 'Uso da crase', ''), 'Crase');
  assert.equal(classificarTopico('Informática', '', 'Um malware do tipo ransomware criptografa os arquivos'), 'Segurança da Informação');
  assert.equal(classificarTopico('Disciplina Inexistente', 'x', 'y'), 'Outros');
});

test('busca: IDF global e MMR priorizam o item relevante', () => {
  const cands = [
    { id: 1, enunciado: 'O habeas corpus protege a liberdade de locomoção' },
    { id: 2, enunciado: 'A crase ocorre antes de palavras femininas' },
    { id: 3, enunciado: 'O mandado de segurança protege direito líquido e certo' }
  ];
  const r = rankCandidates('habeas corpus liberdade', cands, 2);
  assert.equal(r[0].q.id, 1);
  assert.ok(calculateCosineSimilarity(computeTFVector('direitos humanos'), computeTFVector('direito humano')) > 0.9, 'stemming de plural');
});

test('parser: texto sem quebras de linha ainda é fatiado', () => {
  const q = (n) => `QUESTÃO ${n} \n Qual é a capital do estado número ${n} na federação brasileira? \n (A) Opção um ${n} \n (B) Opção dois ${n} \n (C) Opção três ${n} \n (D) Opção quatro ${n} \n (E) Opção cinco ${n} \n`;
  const comQuebras = ['--- PÁGINA 1 ---', 'capa', '--- PÁGINA 2 ---', q(1), q(2), q(3)].join('\n');
  const semQuebras = comQuebras.replace(/\s*\n\s*/g, ' ');
  assert.equal(extractQuestionsFromExam(comQuebras, 'Prova Qualquer').length, 3);
  assert.equal(extractQuestionsFromExam(semQuebras, 'Prova Qualquer').length, 3);
});

test('parser: PDF real do PMPE vira 60 questões, também quando o nome da prova é desconhecido', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const arq = path.join(raiz, 'docs', 'instituto-aocp-2024-pm-pe-soldado-da-policia-militar-prova.pdf');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(arq)) }).promise;
  let texto = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    texto += `\n--- PÁGINA ${p} ---\n` + linhasDaPagina(tc.items);
  }
  const conhecida = extractQuestionsFromExam(texto, 'PMPE 2024');
  assert.equal(conhecida.length, 60);

  const desconhecida = extractQuestionsFromExam(texto, 'Prova Nova 2026');
  assert.equal(desconhecida.length, 60);
  const porDisc = {};
  for (const x of desconhecida) porDisc[x.disciplina] = (porDisc[x.disciplina] || 0) + 1;
  assert.equal(Object.keys(porDisc).length, 6);
  assert.ok(Object.values(porDisc).every((n) => n === 10), JSON.stringify(porDisc));
});

test('validação: alternativas de crase que só diferem pelo acento não são repetidas', () => {
  const q = questaoOk();
  q.alternativas = [
    { letra: 'A', texto: 'à – a – a' },
    { letra: 'B', texto: 'a – à – às' },
    { letra: 'C', texto: 'à – à – a' },
    { letra: 'D', texto: 'a – a – às' },
    { letra: 'E', texto: 'à – a – às' }
  ];
  assert.equal(validarQuestao(q).ok, true);
});

test('parser: remove rodapé repetido e conserta palavras partidas', () => {
  const nomes = ['', 'alfa', 'beta', 'gama', 'delta', 'epsilon'];
  const pag = (n) => `--- PÁGINA ${n} ---\nconteúdo exclusivo ${nomes[n]} com texto longo\nPolícia Civil do Estado AGENTE Tipo 01 – Página ${n}`;
  const limpo = removerCabecalhosRodapes(['', pag(1), pag(2), pag(3), pag(4), pag(5)].join('\n'));
  assert.ok(!/Tipo 01/.test(limpo));
  assert.match(limpo, /conteúdo exclusivo gama/);

  const vocab = construirVocabulario(['a revista científica publicou', 'uma revist a antiga']);
  assert.equal(repararPalavrasPartidas('uma revist a antiga e um estudo', vocab), 'uma revista antiga e um estudo');
  assert.equal(repararPalavrasPartidas('o policial viu a casa', vocab), 'o policial viu a casa');
});

test('tokenizador e stemmer: preserva números de artigos, siglas e alinha singular/plural', () => {
  const v5 = computeTFVector('Art. 5º CF');
  const v14 = computeTFVector('Art. 14º CF');
  assert.ok(v5['5'] > 0 && !v5['14'], 'preserva número 5');
  assert.ok(v14['14'] > 0 && !v14['5'], 'preserva número 14');
  assert.ok(calculateCosineSimilarity(v5, v14) < 0.85, 'Art. 5 e Art. 14 têm vetores distintos');

  assert.ok(calculateCosineSimilarity(computeTFVector('crime ambiental'), computeTFVector('crimes ambientais')) > 0.99);
  const vSiglas = computeTFVector('HC e SV na CF de PE');
  assert.ok(vSiglas.hc > 0 && vSiglas.sv > 0 && vSiglas.cf > 0 && vSiglas.pe > 0);
});

test('leis: sub-fatiamento semântico preserva caput, rotula incisos e ignora revogados/frontmatter', () => {
  const incisos = Array.from({ length: 18 }, (_, i) => {
    const romanos = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII'];
    return `${romanos[i]} - garantia fundamental extensa detalhada número ${i + 1} assegurada a todos os cidadãos em território nacional mediante cláusula pétrea;`;
  }).join('\n');
  const raw = `---\ntitle: Lei Teste\n---\nArt. 5º Todos são iguais perante a lei, garantindo-se a inviolabilidade dos direitos:\n${incisos}\nArt. 6º (Revogado pela Lei nº 9.999, de 2020)\nArt. 7º São direitos sociais a educação e a segurança.`;

  const chunks = chunkLei(raw);
  assert.ok(chunks.length >= 3, 'artigo longo fatiado em múltiplos sub-blocos');
  assert.ok(!chunks.some((c) => c.referencia.startsWith('Art. 6')), 'ignora artigo puramente revogado');
  assert.ok(!chunks[0].texto.includes('title: Lei Teste'), 'remove frontmatter YAML');
  assert.match(chunks[0].referencia, /^Art\. 5º \(I/);
  assert.match(chunks[1].texto, /Todos são iguais perante a lei.*\[\.\.\.\]/, 'sub-bloco seguinte preserva contexto do caput');
});

test('taxonomia Soldado PMPE 2026: exclui tópicos de Oficial e cobre edital Praça QPMG', () => {
  const dh = TOPICOS_EDITAL['Direitos Humanos e Legislação Extravagante'].map((t) => t.topico);
  assert.ok(dh.includes('Estatuto dos Policiais Militares de PE'));
  assert.ok(dh.includes('Crimes Ambientais'));
  assert.ok(dh.includes('Estatuto da Juventude'));
  assert.ok(!dh.includes('Estatuto do Desarmamento'), 'Desarmamento é apenas Oficial');

  const rlm = TOPICOS_EDITAL['Raciocínio Lógico-Matemático'].map((t) => t.topico);
  assert.ok(!rlm.includes('Estatística'), 'Estatística é apenas Oficial');

  assert.equal(classificarTopico('Direitos Humanos e Legislação Extravagante', 'Lei 6.783/1974', 'hierarquia e disciplina PMPE'), 'Estatuto dos Policiais Militares de PE');
  assert.equal(classificarTopico('Informática', '', 'atalhos do Windows 11 e prompt cmd'), 'Windows 11 e Prompt de Comando');
});


test('plano: dias até a prova e sequência de estudo', async () => {
  const { diasAte, calcularSequencia } = await import('../routes/estudo.mjs');
  const hoje = new Date(2026, 10, 4);
  assert.equal(diasAte('2026-11-14', hoje), 10);
  assert.equal(diasAte('2026-11-04', hoje), 0);
  assert.equal(diasAte('2026-11-01', hoje), -3);
  assert.equal(diasAte('lixo', hoje), null);
  // estudou hoje, ontem e anteontem; falhou há 4 dias
  assert.equal(calcularSequencia(['2026-11-04', '2026-11-03', '2026-11-02', '2026-10-31'], hoje), 3);
  // ainda não estudou hoje: a sequência de ontem não se perde
  assert.equal(calcularSequencia(['2026-11-03', '2026-11-02'], hoje), 2);
  assert.equal(calcularSequencia([], hoje), 0);
});

test('painel: prioriza pontos fracos com dados suficientes e separa dominados e não praticados', async () => {
  const { montarPainel, estadoDoTopico, taxaSuavizada } = await import('../lib/painel.mjs');
  const dia = '2026-11-04T12:00:00.000Z';
  const r = (disciplina, topico, acertou) => ({ disciplina, topico, acertou: acertou ? 1 : 0, tempo_segundos: 30, data_hora: dia });
  const respostas = [
    // fraco: 1 acerto em 5
    ...[1, 0, 0, 0, 0].map((a) => r('Direito Constitucional', 'Remédios Constitucionais', a)),
    // dominado: 6 de 6
    ...Array(6).fill(1).map((a) => r('Língua Portuguesa', 'Crase', a)),
    // poucos dados: 1 erro em 1
    r('Informática', 'Segurança da Informação', 0)
  ];
  const caderno = [
    { disciplina: 'Direito Constitucional', topico: 'Remédios Constitucionais', status: 'PENDENTE', data_proxima_revisao: '2026-11-04', total_tentativas: 3, total_acertos: 0 },
    { disciplina: 'Direito Constitucional', topico: 'Remédios Constitucionais', status: 'PENDENTE', data_proxima_revisao: '2026-11-08', total_tentativas: 1, total_acertos: 0 }
  ];
  const p = montarPainel({ respostas, caderno, hoje: '2026-11-04' });

  assert.deepEqual(p.atacar.map((t) => t.topico), ['Remédios Constitucionais']);
  assert.deepEqual(p.dominados.map((t) => t.topico), ['Crase']);
  assert.ok(!p.atacar.some((t) => t.topico === 'Segurança da Informação'), '1 erro em 1 questão não é ponto fraco');
  assert.ok(p.naoPraticados.length > 40);
  assert.equal(p.revisar.vencidasHoje, 1);
  assert.equal(p.revisar.proximos7, 1);
  assert.equal(p.revisar.reincidentes, 1);
  assert.equal(p.resumo.respondidas, 12);
  assert.equal(p.dias.length, 14);
  assert.equal(p.dias.at(-1).total, 12);
  // disciplinas com pior taxa vêm primeiro e as sem dados por último
  assert.equal(p.disciplinas[0].disciplina, 'Informática');
  assert.equal(p.disciplinas.at(-1).total, 0);
  // suavização: 0/1 fica longe de 0
  assert.ok(taxaSuavizada(0, 1) > 0.4);
  assert.equal(estadoDoTopico({ acertos: 0, total: 0, recentes: [] }), 'nao-praticado');
});
