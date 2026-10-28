// Serviço de integração com a API do Google Gemini (Geração 3.x)
import { validarQuestao } from '../../lib/validacaoQuestao.mjs';
import { triagemQuestoes } from './api';

const STORAGE_KEY_API = 'gemini_api_key';
const STORAGE_KEY_MODEL = 'gemini_model_choice';

export const DEFAULT_MODEL = 'gemini-3.8-flash';

// Família oficial de modelos 3.x suportados
export const OFFICIAL_3X_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview'
];

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_API) || '';
}

export function saveApiKey(key) {
  localStorage.setItem(STORAGE_KEY_API, key.trim());
}

export function removeApiKey() {
  localStorage.removeItem(STORAGE_KEY_API);
}

export function getSelectedModel() {
  return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
}

export function saveSelectedModel(model) {
  localStorage.setItem(STORAGE_KEY_MODEL, model);
}

// Consulta a lista oficial de modelos disponíveis na conta do usuário (ModelService.ListModels)
export async function getAvailableModelsFromGoogle(key) {
  if (!key || !key.trim()) return [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro ${res.status} ao consultar modelos da sua chave.`);
  }

  const data = await res.json();
  const models = (data.models || [])
    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => m.name.replace('models/', ''));

  return models;
}

// Testa e valida a chave no Gemini 3.8 Flash (com alternativas 3.6/3.5 se necessário)
export async function testApiKey(key, preferredModel = DEFAULT_MODEL) {
  if (!key || !key.trim()) {
    throw new Error('Chave de API não informada.');
  }

  // Modelos para tentar estritamente na família 3.x
  const modelsToTry = [
    preferredModel,
    ...OFFICIAL_3X_MODELS.filter(m => m !== preferredModel)
  ];

  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key.trim()}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responda apenas: CONEXAO_OK' }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          return {
            success: true,
            usedModel: currentModel,
            isAdapted: currentModel !== preferredModel,
            requestedModel: preferredModel
          };
        }
      }

      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData.error?.message || `Erro ${response.status}`;
      
      // Se for sobrecarga ou modelo temporariamente ocupado, tenta o próximo modelo 3.x
      const isTemporary = 
        response.status === 503 || 
        response.status === 429 || 
        errMsg.toLowerCase().includes('high demand') ||
        errMsg.toLowerCase().includes('not found');

      if (isTemporary) {
        console.warn(`[Gemini API] Modelo '${currentModel}' em alta demanda temporária. Tentando alternativa 3.x...`);
        lastError = new Error(errMsg);
        continue;
      }

      throw new Error(errMsg);
    } catch (err) {
      if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('not valid')) {
        throw new Error('Chave de API inválida. Verifique se copiou a chave corretamente do Google AI Studio.');
      }
      lastError = err;
    }
  }

  throw lastError || new Error(`Não foi possível conectar ao ${preferredModel}.`);
}

// Normaliza qualquer questão gerada pela IA ou vinda do banco para o contrato único da UI.
// Não inventa gabarito nem explicação: o que faltar é pego pela validação (validarQuestao).
export function normalizeQuestion(q, index = 0) {
  const gabarito = String(q.gabarito || q.resposta_correta || '').trim().toUpperCase();

  let alternativas = [];
  if (Array.isArray(q.alternativas)) {
    alternativas = q.alternativas.map(a => ({
      letra: String(a.letra || '').trim().toUpperCase(),
      texto: String(a.texto || '').trim()
    }));
  } else if (q.alternativas && typeof q.alternativas === 'object') {
    alternativas = ['A', 'B', 'C', 'D', 'E']
      .filter(k => q.alternativas[k] !== undefined)
      .map(k => ({ letra: k, texto: String(q.alternativas[k]).trim() }));
  }

  const rawExp = q.explicacao || {};
  const correta = String(rawExp.correta || rawExp.por_que_correta || '').trim();
  const distratores = {};
  if (rawExp.distratores && typeof rawExp.distratores === 'object') {
    for (const [letra, motivo] of Object.entries(rawExp.distratores)) {
      const up = letra.trim().toUpperCase();
      if (up !== gabarito && motivo) {
        distratores[up] = String(motivo).trim();
      }
    }
  }

  const origemStr = String(q.origem || q.tipo || 'INÉDITA').toUpperCase();
  const origem = origemStr.includes('REAL') ? 'REAL' : 'INÉDITA';

  return {
    ...q,
    numero: index + 1,
    disciplina: q.disciplina || 'Geral',
    assunto: q.assunto || 'Tópicos do Edital',
    dificuldade: q.dificuldade || 'Média',
    origem,
    tipoCognitivo: q.tipoCognitivo || q.sub_topico || 'SITUACAO_PROBLEMA',
    fonte: q.fonte || (origem === 'REAL' ? 'Banca Instituto AOCP' : 'Inédita • Padrão AOCP'),
    textoBase: q.textoBase || q.texto_base || '',
    enunciado: String(q.enunciado || '').trim(),
    dica: String(q.dica || '').trim(),
    alternativas,
    gabarito,
    explicacao: {
      correta,
      distratores
    }
  };
}

// Divide a quantidade pedida entre questões reais (servidas do banco de provas) e inéditas (geradas pela IA)
export function dividirProporcao(quantidade, proporcao = '3:1') {
  let reais;
  if (proporcao === '1:1') reais = Math.round(quantidade / 2);
  else if (proporcao === '100:0') reais = 0;
  else if (proporcao === '0:100') reais = quantidade;
  else reais = Math.max(1, Math.round(quantidade / 4));
  reais = Math.min(quantidade, reais);
  return { reais, ineditas: quantidade - reais };
}

const FORMATOS_COGNITIVOS_AOCP = [
  {
    tipo: 'SITUACAO_PROBLEMA',
    instrucao: 'Situação-problema operacional contextualizada na PMPE (Recife, Olinda, Caruaru ou Petrolina), exigindo aplicação prática da norma ou conceito. Comando: "Assinale a alternativa correta."'
  },
  {
    tipo: 'EXCETO_INCORRETA',
    instrucao: 'Comando de inversão clássico da AOCP: use "Assinale a alternativa INCORRETA." ou termine com "..., EXCETO." (em caixa alta). 4 alternativas verdadeiras e 1 falsa com inversão sutil de prazo, competência ou regra.'
  },
  {
    tipo: 'ASSERTIVAS_ROMANAS',
    instrucao: 'Julgamento de itens I, II, III e IV seguido de: "Analise as assertivas a seguir e assinale a alternativa que aponta a(s) correta(s)."'
  },
  {
    tipo: 'VERDADEIRO_FALSO',
    instrucao: 'Comando AOCP: "Informe se é verdadeiro (V) ou falso (F) o que se afirma a seguir e assinale a alternativa com a sequência correta." com 4 afirmativas iniciadas por ( ).'
  },
  {
    tipo: 'LEI_SECA_LITERAL',
    instrucao: 'Cobrança direta e rigorosa da literalidade normativa, gramatical ou algébrica, testando pegadinhas de troca de termos ("exclusivamente", "sempre", prazos ou quóruns).'
  }
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function ehTemporario(status, msg) {
  const m = String(msg || '').toLowerCase();
  return status === 503 || status === 429 || status === 500 || status === 404 || m.includes('high demand') || m.includes('overloaded');
}

// Chamada ao Gemini com retry/backoff por modelo e queda para o próximo modelo da cadeia.
// Devolve { text, finishReason, model } e registra no console cada falha para não engolir erros em silêncio.
async function chamarGemini({ apiKey, modelsToTry, body, tentativasPorModelo = 2 }) {
  let lastError = null;
  for (const model of modelsToTry) {
    for (let tentativa = 1; tentativa <= tentativasPorModelo; tentativa++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData.error?.message || `Erro da API Gemini (${response.status})`;
          if (ehTemporario(response.status, msg)) {
            console.warn(`[Gemini] ${model} indisponível (${response.status}) tentativa ${tentativa}: ${msg}`);
            lastError = new Error(msg);
            if (response.status === 404) break; // modelo inexistente: vai direto para o próximo
            if (tentativa < tentativasPorModelo) await esperar(1000 * tentativa * tentativa);
            continue;
          }
          throw new Error(msg);
        }

        const result = await response.json();
        const cand = result.candidates?.[0];
        const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (!text) {
          lastError = new Error(`A IA (${model}) não retornou conteúdo${cand?.finishReason ? ` [${cand.finishReason}]` : ''}.`);
          console.warn('[Gemini]', lastError.message);
          continue;
        }
        return { text, finishReason: cand?.finishReason || 'STOP', model };
      } catch (err) {
        // Erros não temporários (chave inválida, requisição malformada) não adiantam tentar de novo
        if (!(err instanceof TypeError)) throw err;
        console.warn(`[Gemini] Falha de rede em ${model}:`, err.message);
        lastError = err;
        if (tentativa < tentativasPorModelo) await esperar(1000 * tentativa);
      }
    }
  }
  throw lastError || new Error('Falha ao comunicar com a API Gemini.');
}

function parseJsonSeguro(rawText) {
  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

// Monta o bloco de exemplos reais sem cortar item no meio
function montarExemplosReais(itensProvas, snippetsProvas, limite = 7000) {
  if (Array.isArray(itensProvas) && itensProvas.length > 0) {
    const escolhidos = [];
    let total = 0;
    for (const item of itensProvas) {
      if (total + item.length > limite && escolhidos.length > 0) break;
      escolhidos.push(item);
      total += item.length + 2;
    }
    return escolhidos.join('\n\n');
  }
  if (snippetsProvas) {
    const partes = snippetsProvas.split(/\n\n(?=\[ITEM REAL)/);
    return montarExemplosReais(partes, '', limite);
  }
  return '';
}

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    required: [
      'numero', 'disciplina', 'assunto', 'dificuldade', 'origem',
      'tipoCognitivo', 'fonte', 'enunciado', 'dica', 'alternativas',
      'explicacao', 'gabarito'
    ],
    properties: {
      numero: { type: 'INTEGER' },
      disciplina: { type: 'STRING' },
      assunto: { type: 'STRING' },
      dificuldade: { type: 'STRING' },
      origem: { type: 'STRING' },
      tipoCognitivo: { type: 'STRING' },
      fonte: { type: 'STRING' },
      fonteLegal: { type: 'STRING' },
      textoBase: { type: 'STRING' },
      enunciado: { type: 'STRING' },
      dica: { type: 'STRING' },
      alternativas: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          required: ['letra', 'texto'],
          properties: { letra: { type: 'STRING' }, texto: { type: 'STRING' } }
        }
      },
      // "explicacao" vem ANTES de "gabarito": força a resolução lógica antes de cravar a letra
      explicacao: {
        type: 'OBJECT',
        required: ['correta', 'distratores'],
        properties: {
          correta: { type: 'STRING' },
          distratores: {
            type: 'OBJECT',
            properties: { A: { type: 'STRING' }, B: { type: 'STRING' }, C: { type: 'STRING' }, D: { type: 'STRING' }, E: { type: 'STRING' } }
          }
        }
      },
      gabarito: { type: 'STRING' }
    }
  }
};

// Gera um lote de questões INÉDITAS. Reais nunca são pedidas ao modelo (vêm das provas, com gabarito oficial).
async function generateBatchWithGemini({
  apiKey,
  modelsToTry,
  activeDisciplinas,
  assunto,
  quantidade,
  startIndex = 0,
  itensProvas = [],
  snippetsProvas = '',
  baseLegal = '',
  evitarRepeticao = '',
  topicosSugeridos = {},
  preferences = {}
}) {
  const temp = typeof preferences.temperatura === 'number' ? preferences.temperatura : 0.35;
  const dif = preferences.dificuldade || 'mista';
  const letrasGabarito = ['A', 'B', 'C', 'D', 'E'];

  const blueprintLinhas = [];
  for (let i = 0; i < quantidade; i++) {
    const numGlobal = startIndex + i + 1;
    const discAlvo = activeDisciplinas[(startIndex + i) % activeDisciplinas.length];
    const letraSugerida = letrasGabarito[(startIndex + i * 2) % 5];
    const formato = FORMATOS_COGNITIVOS_AOCP[(startIndex + i) % FORMATOS_COGNITIVOS_AOCP.length];
    // Sem assunto definido, cada questão recebe um tópico diferente (rodízio dos menos praticados)
    const lista = topicosSugeridos[discAlvo] || [];
    const topicoAlvo = !assunto && lista.length > 0 ? lista[Math.floor((startIndex + i) / activeDisciplinas.length) % lista.length] : null;
    blueprintLinhas.push(
      `- Questão ${numGlobal}: Disciplina="${discAlvo}"${topicoAlvo ? ` | Tópico obrigatório="${topicoAlvo}"` : ''} | Origem="INÉDITA" | TipoCognitivo="${formato.tipo}" | Gabarito Alvo="${letraSugerida}" | Formato obrigatório: ${formato.instrucao}`
    );
  }

  const exemplos = montarExemplosReais(itensProvas, snippetsProvas);

  const systemInstruction = `Você é um elaborador de questões sênior do INSTITUTO AOCP, especialista no concurso de Soldado da Polícia Militar de Pernambuco (PMPE).
Sua tarefa é executar estritamente o BLUEPRINT DE ENGENHARIA DE ITENS solicitado pelo usuário, gerando exatamente ${quantidade} questões INÉDITAS no padrão AOCP.

REGRAS PSICOMÉTRICAS INEGOCIÁVEIS:
1. Cada questão DEVE conter exatamente 5 alternativas (A, B, C, D, E) com tamanhos homogêneos e apenas 1 correta.
2. NUNCA utilize "Todas as anteriores" ou "Nenhuma das alternativas".
3. Em Língua Portuguesa, preencha SEMPRE o campo "textoBase" com um texto realista (180 a 320 palavras, parágrafos numerados) quando a questão cobrar interpretação, coesão ou reescrita.
4. No objeto "explicacao.distratores", explique o erro APENAS das 4 alternativas incorretas (NÃO inclua a letra do gabarito dentro de distratores).
5. Nível de dificuldade do lote: ${dif === 'dificil' ? 'Difícil (pegadinhas sutis de prazos, exceções e quóruns)' : dif === 'media' ? 'Médio (padrão oficial Soldado PMPE)' : 'Equilibrado (Fácil, Média e Difícil)'}.
6. Todas as questões são INÉDITAS: nunca copie ou reconstrua uma questão das provas de referência; use-as apenas como modelo de estilo e nível de dificuldade.
7. Para conteúdo normativo, cite artigo, inciso, prazo ou número de lei SOMENTE se constar nos "TRECHOS DE LEGISLAÇÃO" fornecidos ou se tiver certeza absoluta. Na dúvida, formule a questão sem numeração e deixe "fonteLegal" vazio. Preencha "fonteLegal" com a referência normativa efetivamente usada (ex.: "CF/88, art. 144, §5º").
8. Resolva a questão no campo "explicacao.correta" antes de definir o "gabarito"; o gabarito DEVE ser a letra da alternativa que você justificou.`;

  const userPrompt = `Gere exatamente ${quantidade} questões sobre o foco temático: "${assunto || 'Tópicos de maior incidência no edital Soldado PMPE'}".

BLUEPRINT OBRIGATÓRIO ITEM A ITEM:
${blueprintLinhas.join('\n')}

${baseLegal ? `TRECHOS DE LEGISLAÇÃO (FONTE PRIMÁRIA — fundamente as questões normativas nestes textos):\n${baseLegal.slice(0, 6000)}\n` : ''}
${evitarRepeticao ? `MEMÓRIA ANTI-REPETIÇÃO (NÃO repita os mesmos enunciados, cenários ou exemplos abaixo, já existentes no banco do aluno):\n${evitarRepeticao}\n` : ''}
${exemplos ? `QUESTÕES REAIS DE REFERÊNCIA (apenas para calibrar estilo e dificuldade — NÃO copiar):\n${exemplos}\n` : ''}

Retorne APENAS um array JSON válido contendo exatamente ${quantidade} objetos no schema especificado.`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: temp,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA
    }
  };

  const { text, finishReason } = await chamarGemini({ apiKey, modelsToTry, body });

  // Resposta cortada por limite de tokens: divide o lote ao meio e tenta de novo, em vez de aceitar JSON truncado
  const cortada = finishReason === 'MAX_TOKENS';
  let arr;
  try {
    const parsed = parseJsonSeguro(text);
    arr = Array.isArray(parsed) ? parsed : (parsed.questoes || [parsed]);
  } catch (err) {
    if (quantidade > 1) {
      console.warn(`[Gemini] JSON inválido${cortada ? ' (truncado)' : ''}; dividindo o lote de ${quantidade}.`);
      const metade = Math.ceil(quantidade / 2);
      const a = await generateBatchWithGemini({ apiKey, modelsToTry, activeDisciplinas, assunto, quantidade: metade, startIndex, itensProvas, snippetsProvas, baseLegal, evitarRepeticao, topicosSugeridos, preferences });
      const b = await generateBatchWithGemini({ apiKey, modelsToTry, activeDisciplinas, assunto, quantidade: quantidade - metade, startIndex: startIndex + metade, itensProvas, snippetsProvas, baseLegal, evitarRepeticao, topicosSugeridos, preferences });
      return [...a, ...b];
    }
    throw new Error(`A IA devolveu uma resposta ilegível: ${err.message}`);
  }

  return arr.map((q, idx) => {
    const n = normalizeQuestion(q, startIndex + idx);
    // Tudo que a IA gera é inédito, independentemente do que ela declarar
    return { ...n, origem: 'INÉDITA', tipo: 'INÉDITA', fonte: 'Inédita • Padrão AOCP' };
  });
}

// Segunda passada: o modelo resolve cada questão SEM ver o gabarito. Divergência => gabarito suspeito.
export async function verificarQuestoesComIA({ apiKey, modelsToTry, questoes }) {
  if (!questoes.length) return questoes;
  const prompt = `Resolva cada questão de concurso abaixo de forma independente e cuidadosa. Responda apenas com a letra da alternativa que considera correta.

${questoes.map((q, i) => `### QUESTÃO ${i + 1}\n${q.textoBase ? `Texto-base: ${q.textoBase}\n` : ''}${q.enunciado}\n${q.alternativas.map(a => `(${a.letra}) ${a.texto}`).join('\n')}`).join('\n\n')}

Retorne APENAS um array JSON no formato [{"numero": 1, "resposta": "A", "confianca": "alta|media|baixa"}] com ${questoes.length} itens.`;

  try {
    const { text } = await chamarGemini({
      apiKey,
      modelsToTry,
      tentativasPorModelo: 1,
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['numero', 'resposta'],
              properties: { numero: { type: 'INTEGER' }, resposta: { type: 'STRING' }, confianca: { type: 'STRING' } }
            }
          }
        }
      }
    });
    const respostas = parseJsonSeguro(text);
    const mapa = new Map(respostas.map(r => [Number(r.numero), String(r.resposta || '').trim().toUpperCase()]));
    return questoes.map((q, i) => {
      const resp = mapa.get(i + 1);
      if (!resp) return { ...q, verificacao: 'NAO_VERIFICADA' };
      return { ...q, verificacao: resp === q.gabarito ? 'OK' : 'DIVERGENTE', respostaVerificacao: resp };
    });
  } catch (err) {
    console.warn('[Gemini] Verificação independente falhou; questões seguem sem verificação:', err.message);
    return questoes.map(q => ({ ...q, verificacao: 'NAO_VERIFICADA' }));
  }
}

// Gera questões inéditas com pipeline completo: geração -> validação -> triagem (duplicatas) -> verificação independente.
// Repete até 3 rodadas para completar a quantidade pedida. Devolve { questoes, descartadas }.
export async function generateQuestionsWithGemini({
  apiKey,
  model = DEFAULT_MODEL,
  disciplina,
  disciplinas,
  assunto,
  quantidade = 4,
  itensProvas = [],
  snippetsProvas = '',
  baseLegal = '',
  evitarRepeticao = '',
  topicosSugeridos = {},
  preferences = {}
}) {
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada. Por favor, acerte sua chave na aba Opções.');
  }

  const activeDisciplinas = Array.isArray(disciplinas) && disciplinas.length > 0
    ? disciplinas
    : String(disciplina || 'Geral').split(',').map(d => d.trim()).filter(Boolean);

  const modelsToTry = [
    model || DEFAULT_MODEL,
    ...OFFICIAL_3X_MODELS.filter(m => m !== (model || DEFAULT_MODEL))
  ];

  const MAX_BATCH = 8;
  const aprovadas = [];
  const descartadas = [];
  let ultimoErro = null;

  for (let rodada = 0; rodada < 3 && aprovadas.length < quantidade; rodada++) {
    const faltam = quantidade - aprovadas.length;
    // Pede uma pequena margem nas rodadas seguintes, já esperando perdas na validação
    const pedir = rodada === 0 ? faltam : faltam + 1;

    let brutas = [];
    try {
      let restante = pedir;
      let inicio = aprovadas.length;
      while (restante > 0) {
        const tam = Math.min(MAX_BATCH, restante);
        const lote = await generateBatchWithGemini({
          apiKey, modelsToTry, activeDisciplinas, assunto, quantidade: tam, startIndex: inicio,
          itensProvas, snippetsProvas, baseLegal, evitarRepeticao, topicosSugeridos, preferences
        });
        brutas.push(...lote);
        inicio += tam;
        restante -= tam;
      }
    } catch (err) {
      ultimoErro = err;
      if (aprovadas.length === 0 && rodada === 0) throw err;
      break;
    }

    // 1) validação estrutural local
    const validas = [];
    for (const q of brutas) {
      const v = validarQuestao(q);
      if (v.ok) validas.push(q);
      else descartadas.push({ questao: q, motivo: v.erros.join(' '), tipo: 'INVALIDA' });
    }

    // 2) triagem no servidor: duplicatas contra o banco, as provas reais e o próprio lote
    let triadas = validas;
    try {
      const { resultados } = await triagemQuestoes(validas);
      triadas = [];
      resultados.forEach((r) => {
        const q = validas[r.indice];
        if (r.status === 'OK') triadas.push(q);
        else descartadas.push({ questao: q, motivo: r.motivo, tipo: r.status });
      });
    } catch (err) {
      console.warn('[Triagem] Servidor indisponível; seguindo sem detecção de duplicatas:', err.message);
    }

    // 3) verificação independente (resolve sem gabarito)
    const verificadas = await verificarQuestoesComIA({ apiKey, modelsToTry, questoes: triadas });
    for (const q of verificadas) {
      if (q.verificacao === 'DIVERGENTE') {
        descartadas.push({ questao: q, motivo: `Gabarito (${q.gabarito}) divergiu da resolução independente (${q.respostaVerificacao}).`, tipo: 'DIVERGENTE' });
      } else {
        aprovadas.push(q);
      }
    }
  }

  if (aprovadas.length === 0 && ultimoErro) throw ultimoErro;
  if (aprovadas.length === 0) {
    throw new Error('Nenhuma questão passou na validação de qualidade. Tente novamente ou reduza a quantidade.');
  }

  const questoes = aprovadas.slice(0, quantidade).map((q, i) => ({ ...q, numero: i + 1 }));
  return { questoes, descartadas };
}
