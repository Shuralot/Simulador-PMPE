import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGabaritoTexto } from '../lib/gabarito.mjs';
import { validarQuestao } from '../lib/validacaoQuestao.mjs';
import { chunkLei } from '../lib/leis.mjs';
import { somarDiasLocal, dataLocalISO } from '../lib/tempo.mjs';
import { classificarTopico } from '../lib/taxonomia.mjs';
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
