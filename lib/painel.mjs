import { TOPICOS_EDITAL } from './taxonomia.mjs';
import { dataLocalISO } from './tempo.mjs';

// Suavização bayesiana: com poucas respostas a taxa puxa para o prior (60%), para não tratar 1 erro em 1 questão como "ponto fraco".
const PRIOR = 0.6;
const PESO_PRIOR = 4;
export const MIN_DADOS = 3; // respostas mínimas para um tópico entrar nas recomendações
const LIMITE_ATACAR = 0.7; // taxa abaixo disso = ponto fraco
const LIMITE_DOMINADO = 0.85;
const MIN_DOMINADO = 5;

export function taxaSuavizada(acertos, total) {
  return (acertos + PRIOR * PESO_PRIOR) / (total + PESO_PRIOR);
}

// Quanto mais erros, mais caderno pendente e menos respostas, maior a prioridade de estudar o tópico
export function prioridade({ acertos, total, pendentesCaderno = 0 }) {
  return (1 - taxaSuavizada(acertos, total)) * (1 + 0.1 * Math.min(pendentesCaderno, 5));
}

// 'atacar' | 'dominado' | 'ok' | 'poucos-dados' | 'nao-praticado'
export function estadoDoTopico({ acertos, total, recentes }) {
  if (total === 0) return 'nao-praticado';
  if (total < MIN_DADOS) return 'poucos-dados';
  const taxa = acertos / total;
  if (taxa < LIMITE_ATACAR) return 'atacar';
  const ultimas3 = recentes.slice(-3);
  if (total >= MIN_DOMINADO && taxa >= LIMITE_DOMINADO && ultimas3.length === 3 && ultimas3.every(Boolean)) return 'dominado';
  return 'ok';
}

const pct = (a, t) => (t > 0 ? Math.round((a / t) * 1000) / 10 : null);

function somarDias(isoDia, dias) {
  const [a, m, d] = isoDia.split('-').map(Number);
  return dataLocalISO(new Date(a, m - 1, d + dias));
}

/**
 * Monta o painel de desempenho.
 * respostas: [{ disciplina, topico, acertou, tempo_segundos, data_hora }] em ordem cronológica
 * caderno: [{ disciplina, topico, status, data_proxima_revisao, total_tentativas, total_acertos }]
 * hoje: 'AAAA-MM-DD' (dia local)
 */
export function montarPainel({ respostas, caderno, hoje }) {
  const pendentes = caderno.filter((c) => c.status === 'PENDENTE');
  const vencidas = pendentes.filter((c) => c.data_proxima_revisao <= hoje);
  const limite7 = somarDias(hoje, 7);
  const proximos7 = pendentes.filter((c) => c.data_proxima_revisao > hoje && c.data_proxima_revisao <= limite7).length;

  // Tópicos do edital (inclui os nunca praticados) + qualquer tópico extra que apareça nas respostas
  const topicos = new Map();
  const chave = (d, t) => `${d}|${t}`;
  const garantir = (disciplina, topico) => {
    const k = chave(disciplina, topico);
    if (!topicos.has(k)) topicos.set(k, { disciplina, topico, total: 0, acertos: 0, recentes: [], ultimaData: null, tempos: [] });
    return topicos.get(k);
  };
  for (const [disciplina, lista] of Object.entries(TOPICOS_EDITAL)) for (const t of lista) garantir(disciplina, t.topico);

  for (const r of respostas) {
    const t = garantir(r.disciplina, r.topico || 'Outros');
    t.total++;
    if (r.acertou) t.acertos++;
    t.recentes.push(Boolean(r.acertou));
    t.ultimaData = r.data_hora;
    if (r.tempo_segundos > 0) t.tempos.push(r.tempo_segundos);
  }

  for (const t of topicos.values()) {
    const doTopico = pendentes.filter((c) => c.disciplina === t.disciplina && c.topico === t.topico);
    t.pendentesCaderno = doTopico.length;
    t.vencidasCaderno = doTopico.filter((c) => c.data_proxima_revisao <= hoje).length;
    t.taxa = pct(t.acertos, t.total);
    t.tempoMedio = t.tempos.length ? Math.round(t.tempos.reduce((a, b) => a + b, 0) / t.tempos.length) : null;
    t.estado = estadoDoTopico(t);
    t.prioridade = t.total > 0 ? Math.round(prioridade(t) * 1000) / 1000 : 0;
    t.recentes = t.recentes.slice(-5);
    delete t.tempos;
  }
  const todos = [...topicos.values()];
  const comNome = (t) => t.topico !== 'Outros';

  const atacar = todos
    .filter((t) => t.estado === 'atacar' && comNome(t))
    .sort((a, b) => b.prioridade - a.prioridade)
    .slice(0, 6);
  const dominados = todos.filter((t) => t.estado === 'dominado').sort((a, b) => b.total - a.total);
  const naoPraticados = todos.filter((t) => t.estado === 'nao-praticado');

  // Por disciplina
  const disciplinas = Object.keys(TOPICOS_EDITAL).map((disciplina) => {
    const dos = todos.filter((t) => t.disciplina === disciplina);
    const doRespostas = respostas.filter((r) => r.disciplina === disciplina);
    const acertos = doRespostas.filter((r) => r.acertou).length;
    const tempos = doRespostas.map((r) => r.tempo_segundos).filter((s) => s > 0);
    return {
      disciplina,
      total: doRespostas.length,
      acertos,
      taxa: pct(acertos, doRespostas.length),
      tempoMedio: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
      topicosPraticados: dos.filter((t) => t.total > 0 && comNome(t)).length,
      topicosTotal: (TOPICOS_EDITAL[disciplina] || []).length,
      vencidasCaderno: vencidas.filter((c) => c.disciplina === disciplina).length,
      topicos: dos.sort((a, b) => (b.prioridade - a.prioridade) || a.topico.localeCompare(b.topico, 'pt-BR'))
    };
  }).sort((a, b) => {
    // pior desempenho primeiro; sem dados por último
    if (a.taxa === null && b.taxa === null) return 0;
    if (a.taxa === null) return 1;
    if (b.taxa === null) return -1;
    return a.taxa - b.taxa;
  });

  // Resumo + tendência (últimas 20 respostas contra as 20 anteriores)
  const total = respostas.length;
  const acertosTotal = respostas.filter((r) => r.acertou).length;
  const recente = respostas.slice(-20);
  const anterior = respostas.slice(-40, -20);
  const taxaRecente = pct(recente.filter((r) => r.acertou).length, recente.length);
  const taxaAnterior = anterior.length >= 10 ? pct(anterior.filter((r) => r.acertou).length, anterior.length) : null;
  const temposTodos = respostas.map((r) => r.tempo_segundos).filter((s) => s > 0);

  // Últimos 14 dias
  const porDia = new Map();
  for (const r of respostas) {
    const dia = dataLocalISO(new Date(r.data_hora));
    const d = porDia.get(dia) || { total: 0, acertos: 0 };
    d.total++;
    if (r.acertou) d.acertos++;
    porDia.set(dia, d);
  }
  const dias = [];
  for (let i = 13; i >= 0; i--) {
    const dia = somarDias(hoje, -i);
    const d = porDia.get(dia) || { total: 0, acertos: 0 };
    dias.push({ dia, total: d.total, acertos: d.acertos, taxa: pct(d.acertos, d.total) });
  }

  // Revisão: onde as vencidas se concentram e o que você erra repetidamente
  const porTopicoVencidas = new Map();
  for (const c of vencidas) {
    const k = chave(c.disciplina, c.topico || 'Outros');
    porTopicoVencidas.set(k, { disciplina: c.disciplina, topico: c.topico || 'Outros', n: (porTopicoVencidas.get(k)?.n || 0) + 1 });
  }
  const reincidentes = pendentes.filter((c) => c.total_tentativas >= 2 && c.total_acertos / c.total_tentativas < 0.5).length;

  return {
    resumo: {
      respondidas: total,
      acertos: acertosTotal,
      taxa: pct(acertosTotal, total),
      taxaRecente,
      taxaAnterior,
      tempoMedio: temposTodos.length ? Math.round(temposTodos.reduce((a, b) => a + b, 0) / temposTodos.length) : null
    },
    revisar: {
      vencidasHoje: vencidas.length,
      proximos7,
      pendentes: pendentes.length,
      reincidentes,
      porTopico: [...porTopicoVencidas.values()].sort((a, b) => b.n - a.n).slice(0, 5)
    },
    atacar,
    dominados,
    naoPraticados,
    disciplinas,
    dias
  };
}
