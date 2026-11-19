// Chamadas ao Gemini compartilhadas entre o app (navegador) e os scripts (Node): sem dependência de navegador.

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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function ehTemporario(status, msg) {
  const m = String(msg || '').toLowerCase();
  return status === 503 || status === 429 || status === 500 || status === 404 || m.includes('high demand') || m.includes('overloaded');
}

// Chamada ao Gemini com retry/backoff por modelo e queda para o próximo modelo da cadeia.
// Devolve { text, finishReason, model } e registra no console cada falha para não engolir erros em silêncio.
export async function chamarGemini({ apiKey, modelsToTry, body, tentativasPorModelo = 2, onLog = null, etapa = 'gemini' }) {
  const emitir = (nivel, mensagem, extra = {}) => {
    const entrada = { ts: new Date().toISOString(), etapa, nivel, mensagem, ...extra };
    if (nivel === 'error') console.error(`[Gemini:${etapa}]`, mensagem, extra);
    else if (nivel === 'warn') console.warn(`[Gemini:${etapa}]`, mensagem, extra);
    else console.info(`[Gemini:${etapa}]`, mensagem, extra);
    try { onLog?.(entrada); } catch { /* noop */ }
  };
  let lastError = null;
  for (const model of modelsToTry) {
    for (let tentativa = 1; tentativa <= tentativasPorModelo; tentativa++) {
      const t0 = Date.now();
      emitir('info', `Chamando ${model} (tentativa ${tentativa}/${tentativasPorModelo})`, { model, tentativa });
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
          const ms = Date.now() - t0;
          if (ehTemporario(response.status, msg)) {
            emitir('warn', `${model} indisponível (${response.status}) em ${ms}ms: ${msg}`, { model, status: response.status, ms, tentativa });
            lastError = new Error(msg);
            if (response.status === 404) break; // modelo inexistente: vai direto para o próximo
            if (tentativa < tentativasPorModelo) await esperar(1000 * tentativa * tentativa);
            continue;
          }
          emitir('error', `${model} falhou (${response.status}) em ${ms}ms: ${msg}`, { model, status: response.status, ms });
          throw new Error(msg);
        }

        const result = await response.json();
        const cand = result.candidates?.[0];
        const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
        const ms = Date.now() - t0;
        const finishReason = cand?.finishReason || 'STOP';
        const usage = result.usageMetadata ? { entrada: result.usageMetadata.promptTokenCount || 0, saida: result.usageMetadata.candidatesTokenCount || 0, total: result.usageMetadata.totalTokenCount || 0 } : null;
        if (!text) {
          lastError = new Error(`A IA (${model}) não retornou conteúdo${cand?.finishReason ? ` [${cand.finishReason}]` : ''}.`);
          emitir('warn', lastError.message, { model, finishReason, usage, ms });
          continue;
        }
        emitir(finishReason === 'MAX_TOKENS' ? 'warn' : 'info', finishReason === 'MAX_TOKENS' ? `${model} cortou a resposta por limite de tokens (MAX_TOKENS) em ${ms}ms` : `${model} respondeu (${finishReason}) em ${ms}ms`, { model, finishReason, usage, ms });
        return { text, finishReason, model, usage };
      } catch (err) {
        // Erros não temporários (chave inválida, requisição malformada) não adiantam tentar de novo
        if (!(err instanceof TypeError)) throw err;
        emitir('warn', `Falha de rede em ${model}: ${err.message}`, { model, ms: Date.now() - t0 });
        lastError = err;
        if (tentativa < tentativasPorModelo) await esperar(1000 * tentativa);
      }
    }
  }
  throw lastError || new Error('Falha ao comunicar com a API Gemini.');
}

export function parseJsonSeguro(rawText) {
  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

// Segunda passada: um modelo DIFERENTE do gerador resolve cada questão SEM ver o gabarito nem a explicação.
// Cada questão chega com o próprio dispositivo de lei (antes o lote inteiro dividia um único contexto) e o modelo
// escreve a resolução passo a passo antes de dar a letra (reduz erro de conta e de pegadinha).
export async function verificarQuestoesComIA({ apiKey, modelsToTry, questoes, baseLegal = '', onLog = null }) {
  if (!questoes.length) return questoes;
  // context fallback checked per-batch
  const todasTemTrecho = questoes.every((q) => q._trecho);
  const contextoGeral = todasTemTrecho ? '' : (baseLegal || questoes.map((q) => q._contextoVerificacao || '').find(Boolean) || '').slice(0, 2200);
  const prompt = `Resolva cada questão de concurso abaixo (Soldado PMPE — Banca AOCP) de forma independente e rigorosa. Para cada uma, escreva em "resolucao" o raciocínio em até 4 frases curtas (em contas e lógica, mostre os passos) e só depois dê a letra em "resposta". Quando houver TRECHO OFICIAL da questão, ele prevalece sobre o que você lembra.
${contextoGeral ? `
TEXTO OFICIAL DE REFERÊNCIA / LEGISLAÇÃO VIGENTE:
${contextoGeral}
` : ''}
${questoes.map((q, i) => `### QUESTÃO ${i + 1}${q.fonteLegal ? ` [Ref: ${q.fonteLegal}]` : ''}
${q._trecho ? `TRECHO OFICIAL (${q._trecho.fonte} — ${q._trecho.referencia}):
${String(q._trecho.texto).slice(0, 1400)}
` : ''}${q.textoBase ? `Texto-base: ${q.textoBase}
` : ''}${q.enunciado}
${q.alternativas.map((a) => `(${a.letra}) ${a.texto}`).join('\n')}`).join('\n\n')}

Retorne APENAS um array JSON no formato [{"numero": 1, "resolucao": "...", "resposta": "A", "confianca": "alta|media|baixa"}] com ${questoes.length} itens.`;

  try {
    const { text } = await chamarGemini({
      apiKey,
      modelsToTry,
      tentativasPorModelo: 1,
      onLog,
      etapa: 'verificacao',
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['numero', 'resolucao', 'resposta'],
              properties: { numero: { type: 'INTEGER' }, resolucao: { type: 'STRING' }, resposta: { type: 'STRING' }, confianca: { type: 'STRING' } }
            }
          }
        }
      }
    });
    const respostas = parseJsonSeguro(text);
    const mapa = new Map(respostas.map((r) => [Number(r.numero), String(r.resposta || '').trim().toUpperCase()]));
    return questoes.map((q, i) => {
      const resp = mapa.get(i + 1);
      if (!resp) return { ...q, verificacao: 'NAO_VERIFICADA' };
      return { ...q, verificacao: resp === q.gabarito ? 'OK' : 'DIVERGENTE', respostaVerificacao: resp };
    });
  } catch (err) {
    console.warn('[Gemini] Verificação independente falhou; questões seguem sem verificação:', err.message);
    return questoes.map((q) => ({ ...q, verificacao: 'NAO_VERIFICADA' }));
  }
}

// Cadeia do verificador: começa pelo modelo mais forte que NÃO seja o gerador (erro sistemático de um modelo passa batido por ele mesmo)
export function modelosVerificador(modeloGerador) {
  const preferidos = ['gemini-3.1-pro-preview', ...OFFICIAL_3X_MODELS];
  const outros = [...new Set(preferidos)].filter((m) => m !== modeloGerador);
  return [...outros, modeloGerador];
}
