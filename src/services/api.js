// Comunicação com o Servidor Local SQLite (simulador.db)
const API_BASE = '/api';

export async function fetchProvas() {
  const res = await fetch(`${API_BASE}/provas`);
  if (!res.ok) throw new Error('Falha ao carregar provas do SQLite.');
  return await res.json();
}

export async function addProva(provaData) {
  const res = await fetch(`${API_BASE}/provas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provaData)
  });
  if (!res.ok) throw new Error('Falha ao gravar prova no SQLite.');
  return await res.json();
}

export async function toggleProva(id) {
  const res = await fetch(`${API_BASE}/provas/${id}/toggle`, {
    method: 'PATCH'
  });
  if (!res.ok) throw new Error('Falha ao alternar status da prova.');
  return await res.json();
}

export async function deleteProva(id) {
  const res = await fetch(`${API_BASE}/provas/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao excluir prova.');
  }
  return await res.json();
}

export async function fetchContextSnippets(disciplinas, assunto, limite = 6) {
  const params = new URLSearchParams();
  if (Array.isArray(disciplinas) && disciplinas.length > 0) {
    params.append('disciplinas', disciplinas.join(','));
  } else if (typeof disciplinas === 'string' && disciplinas) {
    params.append('disciplina', disciplinas);
  }
  if (assunto) params.append('assunto', assunto);
  if (limite) params.append('limite', String(limite));

  const res = await fetch(`${API_BASE}/provas/contexto?${params.toString()}`);
  if (!res.ok) return { snippets: '', evitarRepeticao: '' };
  return await res.json();
}

export async function buscaCossenoProvas({ query, disciplina, limite = 6 }) {
  const res = await fetch(`${API_BASE}/provas/busca-cosseno`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, disciplina, limite })
  });
  if (!res.ok) throw new Error('Falha na busca vetorial por cosseno.');
  return await res.json();
}

export async function saveSimuladoResult(simuladoData) {
  const res = await fetch(`${API_BASE}/simulados`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(simuladoData)
  });
  if (!res.ok) throw new Error('Falha ao salvar simulado no SQLite.');
  return await res.json();
}

export async function fetchDesempenho() {
  const res = await fetch(`${API_BASE}/desempenho`);
  if (!res.ok) throw new Error('Falha ao carregar métricas de desempenho.');
  return await res.json();
}

export async function fetchCadernoErros(apenasHoje = false) {
  const res = await fetch(`${API_BASE}/caderno-erros?apenasHoje=${apenasHoje}`);
  if (!res.ok) throw new Error('Falha ao carregar caderno de erros.');
  return await res.json();
}

export async function revisarQuestaoCaderno(id, acertou) {
  const res = await fetch(`${API_BASE}/caderno-erros/${id}/revisar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acertou })
  });
  if (!res.ok) throw new Error('Falha ao registrar revisão.');
  return await res.json();
}

export async function getSavedApiKey() {
  try {
    const res = await fetch(`${API_BASE}/config/key`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.key || '';
  } catch (err) {
    return '';
  }
}

export async function saveApiKeyToDB(key) {
  const res = await fetch(`${API_BASE}/config/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  if (!res.ok) throw new Error('Falha ao salvar chave no SQLite.');
  return await res.json();
}

// ==========================================
// BANCO DE QUESTÕES PERMANENTE (OFFLINE / 0s)
// ==========================================

export async function fetchBancoStats() {
  try {
    const res = await fetch(`${API_BASE}/banco/stats`);
    if (!res.ok) return { total: 0, ineditas: 0, disciplinas: [], assuntos: [] };
    return await res.json();
  } catch (err) {
    return { total: 0, ineditas: 0, disciplinas: [], assuntos: [] };
  }
}

export async function fetchContagemBanco({ disciplinas, tema, chips = [] }) {
  try {
    const res = await fetch(`${API_BASE}/banco/contagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disciplinas, tema, chips })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function salvarNoBanco(questoes) {
  const res = await fetch(`${API_BASE}/banco/salvar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questoes })
  });
  if (!res.ok) throw new Error('Falha ao salvar questões no banco permanente.');
  return await res.json();
}

export async function buscarNoBanco({ disciplinas, tema, quantidade = 10, apenasIneditas = false, somenteReais = false, somenteIneditas = false }) {
  const res = await fetch(`${API_BASE}/banco/buscar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disciplinas, tema, quantidade, apenasIneditas, somenteReais, somenteIneditas })
  });
  if (!res.ok) throw new Error('Falha ao buscar questões no banco.');
  return await res.json();
}

export async function registrarResultadoBanco(resultados) {
  try {
    await fetch(`${API_BASE}/banco/resultado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultados })
    });
  } catch (err) {
    console.error('Erro ao registrar estatísticas no banco de questões:', err);
  }
}

export async function fetchSimulados() {
  const res = await fetch(`${API_BASE}/simulados`);
  if (!res.ok) throw new Error('Falha ao carregar lista de simulados.');
  return await res.json();
}

export async function deleteSimulado(id) {
  const res = await fetch(`${API_BASE}/simulados/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Falha ao excluir simulado.');
  return await res.json();
}

export async function clearAllSimulados() {
  const res = await fetch(`${API_BASE}/simulados`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Falha ao limpar todos os simulados.');
  return await res.json();
}

// ==========================================
// TRIAGEM, GABARITOS E BASE LEGAL
// ==========================================

export async function triagemQuestoes(questoes) {
  const res = await fetch(`${API_BASE}/banco/triagem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questoes })
  });
  if (!res.ok) throw new Error('Falha na triagem de questões.');
  return await res.json();
}

export async function importarGabarito(provaId, texto) {
  const res = await fetch(`${API_BASE}/provas/${encodeURIComponent(provaId)}/gabarito`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao importar gabarito.');
  return data;
}

export async function ingerirBaseLegal({ fonte, disciplina, texto }) {
  const res = await fetch(`${API_BASE}/base/ingerir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fonte, disciplina: disciplina || null, texto })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao gravar texto na base legal.');
  return data;
}

export async function fetchBaseStats() {
  try {
    const res = await fetch(`${API_BASE}/base/stats`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function removerBaseLegal(fonte) {
  const res = await fetch(`${API_BASE}/base/${encodeURIComponent(fonte)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover fonte da base legal.');
  return await res.json();
}
