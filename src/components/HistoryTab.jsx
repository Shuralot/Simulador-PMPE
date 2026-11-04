import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Target, 
  Brain, 
  Trash2, 
  History,
  RefreshCw,
  ArrowRight,
  Zap,
  AlertCircle
} from 'lucide-react';
import { 
  fetchDesempenho, 
  fetchCadernoErros, 
  revisarQuestaoCaderno,
  fetchSimulados,
  deleteSimulado,
  clearAllSimulados,
  getSavedApiKey
} from '../services/api';
import LegalReferencePanel from './LegalReferencePanel';

// Normaliza o retorno da IA para estrutura garantida de KPIs e plano tático
function parseDiagnostic(raw, fallbackData) {
  if (!raw && !fallbackData) return null;

  // Se já for um objeto estruturado válido
  if (raw && typeof raw === 'object' && raw.kpis && raw.resumoExecutivo) {
    return raw;
  }

  let text = typeof raw === 'string' ? raw.trim() : '';

  if (text) {
    // Remove blocos de markdown caso venham no retorno
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && parsed.resumoExecutivo) {
        return parsed;
      }
    } catch {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
          if (parsed && typeof parsed === 'object' && parsed.resumoExecutivo) {
            return parsed;
          }
        } catch {
          // Continua para o gerador de resiliência
        }
      }
    }
  }

  // Fallback tático calculado diretamente a partir dos dados reais do SQLite
  const pace = fallbackData?.global?.tempoMedioPorQuestao || 0;
  const taxa = fallbackData?.global?.taxaGeral || 0;
  const totalQuestoes = fallbackData?.global?.totalQuestoes || 0;
  const pendentes = fallbackData?.cadernoErros?.pendentes_hoje ?? fallbackData?.cadernoErros?.total_pendentes ?? 0;
  const impulsivos = fallbackData?.global?.errosImpulsividade || 0;
  const nota60 = Math.round((taxa / 100) * 60);

  const topicoCritico = fallbackData?.zonasCriticas?.[0] || null;
  const discAlvo = topicoCritico?.disciplina || fallbackData?.disciplinas?.[0]?.disciplina || 'Direito Constitucional';
  const topicoAlvo = topicoCritico?.assunto || 'Direitos e Deveres Individuais (Art. 5º)';

  const classificacao = taxa >= 75 ? 'Competitivo' : taxa >= 60 ? 'Em Evolução' : 'Atenção Crítica';

  const resumo = typeof raw === 'string' && raw.length > 25 && !raw.includes('{')
    ? raw.replace(/[*#]/g, '').trim()
    : `Com taxa de acerto de ${taxa}% (${totalQuestoes} questões resolvidas) e ritmo médio de ${pace}s/questão, você mantém excelente velocidade de prova. O foco prioritário deve ser zerar as pendências do Caderno de Erros e blindar os tópicos mais recorrentes da banca Instituto AOCP.`;

  return {
    scoreProntidao: taxa || 70,
    classificacao,
    resumoExecutivo: resumo,
    kpis: [
      {
        titulo: 'Ritmo de Prova',
        valor: `${pace}s / q`,
        avaliacao: pace < 50 ? 'Ágil' : pace <= 120 ? 'Ideal' : 'Lento',
        status: pace <= 120 ? 'positivo' : 'alerta',
        descricao: 'Tempo por questão comparado ao limite oficial de 2m30s da PMPE. Preserva tempo para redação e RLM.'
      },
      {
        titulo: 'Precisão Real',
        valor: `${taxa}%`,
        avaliacao: taxa >= 75 ? 'Faixa de Corte' : taxa >= 60 ? 'Regular' : 'Abaixo do Corte',
        status: taxa >= 75 ? 'positivo' : taxa >= 60 ? 'positivo' : 'critico',
        descricao: `Projeção atual de ${nota60} / 60 pontos na prova objetiva.`
      },
      {
        titulo: 'Caderno de Erros',
        valor: `${pendentes} itens`,
        avaliacao: pendentes > 0 ? 'Revisar Hoje' : 'Em Dia',
        status: pendentes > 10 ? 'alerta' : 'positivo',
        descricao: 'Ciclo de repetição espaçada Leitner para fixar conceitos errados.'
      },
      {
        titulo: 'Radar Pegadinha',
        valor: impulsivos > 2 ? 'Risco Moderado' : 'Baixo Risco',
        avaliacao: impulsivos > 2 ? 'Atenção' : 'Seguro',
        status: impulsivos > 2 ? 'alerta' : 'positivo',
        descricao: impulsivos > 0 ? `${impulsivos} erro(s) em menos de 30s.` : 'Sem sinais de precipitação nas questões respondidas.'
      }
    ],
    planoDeAtaque: {
      disciplina: discAlvo,
      topico: topicoAlvo,
      prioridade: 'Alta',
      motivo: 'Tópico de alta incidência no histórico da banca AOCP onde se concentram os erros recentes.',
      metaEstudo: 'Resolver bateria de 15 questões e revisar exceções dos artigos cobrados.',
      dicaTatica: 'A banca Instituto AOCP foca na literalidade da lei e na inversão de conceitos (ex: autoridade policial vs autoridade judicial).'
    },
    pontosDeAtencao: (fallbackData?.zonasCriticas || []).slice(0, 3).map(z => ({
      disciplina: z.disciplina,
      topico: z.assunto,
      problema: `Taxa de acerto de ${z.taxa}% com ${z.erros} erro(s) registrados.`,
      gravidade: z.taxa < 50 ? 'alta' : 'media'
    })),
    pontosFortes: (fallbackData?.pontosFortes || []).length > 0
      ? fallbackData.pontosFortes.slice(0, 3).map(p => `${p.disciplina}: ${p.assunto} (${p.taxa}% de precisão)`)
      : [
          `Ritmo de prova acelerado (${pace}s/questão) com boa agilidade de leitura`,
          'Aproveitamento competitivo nas primeiras baterias'
        ],
    acoesRecomendadas: [
      {
        acao: `Revisar as ${pendentes} pendências no Caderno de Erros`,
        impacto: 'Evita a curva do esquecimento de conteúdos que já caíram no seu simulado.',
        tipoAcao: 'caderno'
      },
      {
        acao: `Treinar bateria em ${discAlvo}`,
        impacto: 'Consolida pontos decisivos em matéria de peso para Soldado da PMPE.',
        tipoAcao: 'treino'
      }
    ]
  };
}

export default function HistoryTab({ apiKey, model, onStartTargetedQuiz, onStartCadernoQuiz }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('kpis'); // 'kpis' | 'erros' | 'simulados'
  const [caderno, setCaderno] = useState([]);
  const [loadingCaderno, setLoadingCaderno] = useState(false);
  const [simulados, setSimulados] = useState([]);
  const [loadingSimulados, setLoadingSimulados] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Diagnóstico Pedagógico com Gemini
  const [diagnostic, setDiagnostic] = useState(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);
  const [diagnosticTimestamp, setDiagnosticTimestamp] = useState(null);
  const [diagnosticNotice, setDiagnosticNotice] = useState(null);

  // Questão aberta no caderno de erros
  const [revealedAnswers, setRevealedAnswers] = useState({});

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchDesempenho();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCaderno = async (apenasHoje = false) => {
    try {
      setLoadingCaderno(true);
      const items = await fetchCadernoErros(apenasHoje);
      setCaderno(items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCaderno(false);
    }
  };

  const loadSimulados = async () => {
    try {
      setLoadingSimulados(true);
      const items = await fetchSimulados();
      setSimulados(items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSimulados(false);
    }
  };

  useEffect(() => {
    loadData();
    loadCaderno(false);
    loadSimulados();

    try {
      const cached = localStorage.getItem('mentor_ia_diagnostico_cache');
      const cachedTime = localStorage.getItem('mentor_ia_diagnostico_date');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed) {
          setDiagnostic(parsed);
          if (cachedTime) setDiagnosticTimestamp(cachedTime);
        }
      }
    } catch {
      // Ignora erro de cache
    }
  }, []);

  const handleDeleteSimulado = async (id) => {
    if (!window.confirm(`Deseja apagar o Simulado #${id}? As métricas de desempenho serão recalculadas imediatamente.`)) {
      return;
    }
    try {
      await deleteSimulado(id);
      setActionFeedback(`Simulado #${id} excluído com sucesso. Suas métricas foram recalculadas.`);
      await loadData();
      await loadSimulados();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      alert('Erro ao excluir simulado: ' + err.message);
    }
  };

  const handleClearAllSimulados = async () => {
    if (!window.confirm('Atenção: deseja realmente excluir TODOS os testes realizados? Esta ação não pode ser desfeita e reiniciará suas estatísticas.')) {
      return;
    }
    try {
      await clearAllSimulados();
      setActionFeedback('Todos os testes foram excluídos com sucesso.');
      await loadData();
      await loadSimulados();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      alert('Erro ao limpar testes: ' + err.message);
    }
  };

  const handleGenerateDiagnostic = async () => {
    setLoadingDiagnostic(true);
    setDiagnosticNotice(null);

    let effectiveKey = apiKey;
    if (!effectiveKey) {
      try {
        const storedKey = localStorage.getItem('gemini_api_key');
        if (storedKey) effectiveKey = storedKey;
        else {
          const dbKey = await getSavedApiKey();
          if (dbKey) effectiveKey = dbKey;
        }
      } catch (e) {
        console.warn('Erro ao obter chave do banco:', e);
      }
    }

    if (!effectiveKey) {
      // Gera diagnóstico resiliente estruturado com base direta nas métricas do SQLite
      const localDiagnostic = parseDiagnostic(null, data);
      setDiagnostic(localDiagnostic);
      const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ')';
      setDiagnosticTimestamp(nowStr);
      localStorage.setItem('mentor_ia_diagnostico_cache', JSON.stringify(localDiagnostic));
      localStorage.setItem('mentor_ia_diagnostico_date', nowStr);
      setDiagnosticNotice('Chave Gemini não cadastrada em Opções. Exibindo diagnóstico preliminar calibrado pelo histórico do banco de dados.');
      setLoadingDiagnostic(false);
      return;
    }

    try {
      const summaryPayload = {
        taxaGeral: data?.global?.taxaGeral,
        totalQuestoes: data?.global?.totalQuestoes,
        totalAcertos: data?.global?.totalAcertos,
        tempoMedioSegundos: data?.global?.tempoMedioPorQuestao,
        errosImpulsividade: data?.global?.errosImpulsividade,
        questoesLentas: data?.global?.questoesLentas,
        notaProjetada60: data?.global?.notaProjetada60,
        cadernoErros: {
          pendentesHoje: data?.cadernoErros?.pendentes_hoje,
          totalPendentes: data?.cadernoErros?.total_pendentes,
          totalDominadas: data?.cadernoErros?.total_dominadas
        },
        calibracao: data?.global?.calibracao,
        disciplinas: (data?.disciplinas || []).map(d => ({
          disciplina: d.disciplina,
          taxa: d.taxa,
          acertos: d.acertos,
          total: d.total,
          tempoMedio: d.tempo_medio,
          tendencia: d.tendencia
        })),
        zonasCriticas: (data?.zonasCriticas || []).slice(0, 5).map(z => ({
          disciplina: z.disciplina,
          topico: z.assunto,
          taxa: z.taxa,
          erros: z.erros,
          total: z.total
        })),
        pontosFortes: (data?.pontosFortes || []).slice(0, 5).map(p => ({
          disciplina: p.disciplina,
          topico: p.assunto,
          taxa: p.taxa,
          total: p.total
        })),
        ultimosErros: (data?.ultimosErros || []).slice(0, 5).map(e => ({
          disciplina: e.disciplina,
          topico: e.assunto,
          tempoSegundos: e.tempo_segundos
        }))
      };

      const prompt = `Você é um mentor especialista de elite em aprovação para Soldado da Polícia Militar de Pernambuco (PMPE), com domínio minucioso da banca examinadora Instituto AOCP.
Analise os seguintes dados estatísticos REAIS do aluno, gravados no banco SQLite:
${JSON.stringify(summaryPayload, null, 2)}

Contexto da prova PMPE (Instituto AOCP):
- 60 questões objetivas (Língua Portuguesa 10, História de PE 10, RLM 10, Informática 10, Direito Constitucional 10, Direitos Humanos e Legislação Extravagante 10).
- Duração total: 4 horas (~2m20s a 2m30s por questão com cartão-resposta).
- Nota de corte média para o TAF: 40 a 48 pontos (66% a 80%).

Instruções cruciais:
1. Avalie o ritmo do aluno (${data?.global?.tempoMedioPorQuestao || 0}s/q): se for rápido (<50s), avalie se ele está ágil e assertivo ou sob risco de impulsividade.
2. Identifique a disciplina e tópico onde ele mais perde pontos ou precisa blindar a pontuação.
3. Elabore um plano de ataque cirúrgico e dicas sobre armadilhas da banca AOCP.

RESPONDA EXCLUSIVAMENTE EM FORMATO JSON PURO (sem \`\`\`json, sem introdução):
{
  "scoreProntidao": ${data?.global?.taxaGeral || 75},
  "classificacao": "${(data?.global?.taxaGeral || 0) >= 75 ? 'Competitivo' : (data?.global?.taxaGeral || 0) >= 60 ? 'Em Evolução' : 'Atenção Crítica'}",
  "resumoExecutivo": "2 a 3 frases densas e motivadoras avaliando a prontidão real do candidato e o principal ajuste de estudo.",
  "kpis": [
    {
      "titulo": "Ritmo de Prova",
      "valor": "${data?.global?.tempoMedioPorQuestao || 0}s / q",
      "avaliacao": "${(data?.global?.tempoMedioPorQuestao || 0) < 50 ? 'Ágil' : 'Equilibrado'}",
      "status": "positivo",
      "descricao": "Tempo de resolução comparado ao limite oficial de 2m30s da PMPE."
    },
    {
      "titulo": "Taxa de Acertos",
      "valor": "${data?.global?.taxaGeral || 0}%",
      "avaliacao": "${(data?.global?.taxaGeral || 0) >= 75 ? 'Faixa de Corte' : 'Em Busca de Corte'}",
      "status": "positivo",
      "descricao": "Aproveitamento geral projetado para pontuação competitiva."
    },
    {
      "titulo": "Caderno de Erros",
      "valor": "${data?.cadernoErros?.pendentes_hoje || 0} pendentes",
      "avaliacao": "${(data?.cadernoErros?.pendentes_hoje || 0) > 0 ? 'Revisar' : 'Em Dia'}",
      "status": "${(data?.cadernoErros?.pendentes_hoje || 0) > 0 ? 'alerta' : 'positivo'}",
      "descricao": "Itens aguardando repetição espaçada no método Leitner."
    },
    {
      "titulo": "Filtro Pegadinha",
      "valor": "Baixo Risco",
      "avaliacao": "Seguro",
      "status": "positivo",
      "descricao": "Avaliação de erros precipitados (<30s) ou excesso de confiança."
    }
  ],
  "planoDeAtaque": {
    "disciplina": "Nome exato da matéria prioritária",
    "topico": "Tópico prioritário para hoje",
    "prioridade": "Alta",
    "motivo": "Por que focar exatamente neste conteúdo agora.",
    "metaEstudo": "Meta prática de estudo (ex: resolver 15 questões focando em prazos).",
    "dicaTatica": "Dica estratégica de como a banca AOCP cobra este conteúdo."
  },
  "pontosDeAtencao": [
    {
      "disciplina": "Nome da Matéria",
      "topico": "Tópico com erros",
      "problema": "Onde está a falha cognitiva ou falta de memorização.",
      "gravidade": "alta"
    }
  ],
  "pontosFortes": [
    "Ponto forte demonstrado pelo desempenho do aluno.",
    "Outro ponto forte que deve ser mantido com revisões periódicas."
  ],
  "acoesRecomendadas": [
    {
      "acao": "Revisar as pendências no Caderno de Erros",
      "impacto": "Garante retenção na memória de longo prazo.",
      "tipoAcao": "caderno"
    },
    {
      "acao": "Treinar bateria no tópico crítico",
      "impacto": "Converte ponto fraco em pontuação líquida garantida.",
      "tipoAcao": "treino"
    }
  ]
}`;

      const activeModel = model || 'gemini-3.8-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${effectiveKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erro ${res.status} ao comunicar com a IA.`);
      }

      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = parseDiagnostic(rawText, data);

      if (parsed) {
        setDiagnostic(parsed);
        const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ')';
        setDiagnosticTimestamp(nowStr);
        localStorage.setItem('mentor_ia_diagnostico_cache', JSON.stringify(parsed));
        localStorage.setItem('mentor_ia_diagnostico_date', nowStr);
      }
    } catch (err) {
      console.warn('Erro ao consultar Gemini, usando fallback de alta precisão:', err);
      const localDiagnostic = parseDiagnostic(null, data);
      setDiagnostic(localDiagnostic);
      const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ')';
      setDiagnosticTimestamp(nowStr);
      localStorage.setItem('mentor_ia_diagnostico_cache', JSON.stringify(localDiagnostic));
      localStorage.setItem('mentor_ia_diagnostico_date', nowStr);
      setDiagnosticNotice(`IA temporariamente indisponível (${err.message}). Exibindo diagnóstico estratégico calculado a partir das suas métricas do SQLite.`);
    } finally {
      setLoadingDiagnostic(false);
    }
  };

  const handleRevisar = async (cadernoId, acertou) => {
    try {
      await revisarQuestaoCaderno(cadernoId, acertou);
      await loadCaderno(false);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-5xl mx-auto py-16 px-4 text-center">
        <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-400">Carregando métricas do banco SQLite...</p>
      </div>
    );
  }

  const hasData = data && data.global && data.global.totalQuestoes > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 w-full space-y-6">
      {/* Alerta de Feedback de Ação */}
      {actionFeedback && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5 font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Header com Navegação em Sub-Abas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            <span>Desempenho & Evolução</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Métricas de acertos, tempo e repetição espaçada no SQLite
          </p>
        </div>

        {/* Sub-abas Ampliadas */}
        <div className="flex items-center gap-1.5 p-1.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl">
          <button
            onClick={() => setActiveSubTab('kpis')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeSubTab === 'kpis' ? 'bg-white/10 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dashboard
          </button>

          <button
            onClick={() => setActiveSubTab('erros')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'erros' ? 'bg-rose-500/20 text-rose-300 shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Caderno de Erros</span>
            {data?.cadernoErros?.total_pendentes > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500 text-white font-bold">
                {data.cadernoErros.total_pendentes}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('simulados')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'simulados' ? 'bg-indigo-600/30 text-indigo-300 shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Gerenciar Testes</span>
            {simulados.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-white/[0.08] text-slate-200 font-mono font-bold">
                {simulados.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* CONTEÚDO DA SUB-ABA: GERENCIAR TESTES (Apagar simulados descartáveis) */}
      {activeSubTab === 'simulados' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-[#121929] border border-white/[0.08]">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2.5">
                <History className="w-5 h-5 text-indigo-400" />
                <span>Histórico de Simulados & Gerenciamento de Métricas</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Exclua simulados de teste ou rasura para que não distorçam sua taxa de acertos e gráficos.
              </p>
            </div>

            {simulados.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllSimulados}
                className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Limpar Todos os Testes</span>
              </button>
            )}
          </div>

          {loadingSimulados ? (
            <div className="py-16 text-center text-sm text-slate-400">Carregando lista de simulados...</div>
          ) : simulados.length === 0 ? (
            <div className="p-10 rounded-3xl bg-[#121929] border border-white/[0.08] text-center">
              <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Nenhum simulado salvo no banco de dados.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {simulados.map((sim) => {
                const taxa = Math.round(sim.taxa_acerto || 0);
                const minutos = Math.floor((sim.tempo_segundos || 0) / 60);
                const segundos = (sim.tempo_segundos || 0) % 60;

                return (
                  <div
                    key={sim.id}
                    className="p-5 sm:p-6 rounded-2xl bg-[#121929] border border-white/[0.08] hover:border-white/[0.16] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="text-sm sm:text-base font-bold text-slate-100">
                          Simulado #{sim.id}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-md bg-white/[0.04] text-slate-300 border border-white/[0.08] font-medium">
                          {sim.modo === 'simulado' ? 'Simulado Prova' : 'Modo Estudo'}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs sm:text-sm text-slate-400 font-mono">
                          {sim.data_hora}
                        </span>
                      </div>

                      <div className="text-sm sm:text-base text-slate-300">
                        <span className="font-semibold text-indigo-400">{sim.disciplina}</span>
                        {sim.assunto && sim.assunto !== 'Tópicos gerais' && (
                          <span className="text-slate-400"> — {sim.assunto}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-5 flex-shrink-0">
                      {/* Métricas do Simulado */}
                      <div className="text-right">
                        <div className="flex items-center gap-2.5 justify-end">
                          <span className={`text-base sm:text-lg font-bold ${
                            taxa >= 70 ? 'text-emerald-400' : taxa >= 50 ? 'text-indigo-400' : 'text-rose-400'
                          }`}>
                            {taxa}%
                          </span>
                          <span className="text-xs sm:text-sm text-slate-400">
                            ({sim.acertos}/{sim.total_questoes})
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono block mt-0.5">
                          ⏱ {minutos}m {segundos}s ({sim.tempo_medio_questao ? Math.round(sim.tempo_medio_questao) : 0}s/q)
                        </span>
                      </div>

                      {/* Botão de Excluir */}
                      <button
                        type="button"
                        onClick={() => handleDeleteSimulado(sim.id)}
                        className="p-3 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/25 transition-all cursor-pointer"
                        title="Apagar este simulado para não constar nas métricas"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA SUB-ABA: DASHBOARD DE KPIS */}
      {activeSubTab === 'kpis' && (
        <>
          {!hasData ? (
            <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-14 text-center max-w-xl mx-auto">
              <Target className="w-14 h-14 text-indigo-400 mx-auto mb-4 opacity-80" />
              <h2 className="text-xl font-bold text-slate-100 mb-2">Nenhum simulado registrado no SQLite</h2>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Faça seu primeiro treino de questões para gerar métricas de aproveitamento, ritmo e pontos fracos.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* 1. CARDS DE KPIS ESSENCIAIS COM NÚMEROS GRANDES */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 sm:p-6 rounded-3xl bg-[#121929] border border-white/[0.08]">
                  <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                    Aproveitamento
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl sm:text-4xl lg:text-5xl font-black ${
                      data.global.taxaGeral >= 75 ? 'text-emerald-400' : data.global.taxaGeral >= 60 ? 'text-indigo-400' : 'text-rose-400'
                    }`}>
                      {data.global.taxaGeral}%
                    </span>
                    <span className="text-xs sm:text-sm text-slate-400">
                      ({data.global.totalAcertos}/{data.global.totalQuestoes})
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-6 rounded-3xl bg-[#121929] border border-white/[0.08]">
                  <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                    Pacing Médio
                  </span>
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-100 font-mono">
                    {Math.floor(data.global.tempoMedioPorQuestao / 60)}m {data.global.tempoMedioPorQuestao % 60}s
                  </div>
                </div>

                <div className="p-5 sm:p-6 rounded-3xl bg-[#121929] border border-white/[0.08]">
                  <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                    Caderno de Erros
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-amber-400">
                      {data.cadernoErros.pendentes_hoje}
                    </span>
                    <span className="text-xs sm:text-sm text-slate-400">pendentes</span>
                  </div>
                </div>

                <div className="p-5 sm:p-6 rounded-3xl bg-[#121929] border border-white/[0.08]">
                  <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                    Nota Projetada
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-indigo-400">
                      {Math.round((data.global.taxaGeral / 100) * 60)}
                    </span>
                    <span className="text-xs sm:text-sm text-slate-400">/ 60 pts</span>
                  </div>
                </div>
              </div>

              {/* 2. DIAGNÓSTICO TÁTICO COM GEMINI */}
              <div className="p-6 sm:p-8 rounded-3xl bg-[#121929] border border-white/[0.08] relative overflow-hidden shadow-2xl space-y-6">
                {/* Glow decorativo de fundo */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

                {/* Header do Mentor */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06] relative z-10">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-amber-400/10 text-amber-300 border border-amber-400/20 shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-100">Mentor IA: Diagnóstico de Desempenho</h3>
                        {diagnostic?.classificacao && (
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
                            diagnostic.classificacao === 'Excelente' || diagnostic.classificacao === 'Competitivo'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : diagnostic.classificacao === 'Em Evolução'
                              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}>
                            {diagnostic.classificacao}
                          </span>
                        )}
                        {diagnostic?.scoreProntidao !== undefined && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/[0.08] font-mono font-semibold">
                            Prontidão: {diagnostic.scoreProntidao}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        Análise tática calibrada com base nos seus dados do SQLite e nos critérios de corte da banca Instituto AOCP
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    {diagnosticTimestamp && (
                      <span className="text-xs text-slate-500 font-mono hidden md:inline-block">
                        {diagnosticTimestamp}
                      </span>
                    )}
                    <button
                      onClick={handleGenerateDiagnostic}
                      disabled={loadingDiagnostic}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs sm:text-sm font-bold transition-all shadow-md hover:shadow-indigo-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingDiagnostic ? 'animate-spin' : ''}`} />
                      <span>{loadingDiagnostic ? 'Analisando Dados...' : diagnostic ? 'Atualizar Diagnóstico' : 'Gerar Diagnóstico'}</span>
                    </button>
                  </div>
                </div>

                {/* Notificação/Aviso informativo se houver */}
                {diagnosticNotice && (
                  <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-indigo-400" />
                      <span>{diagnosticNotice}</span>
                    </div>
                    <button onClick={() => setDiagnosticNotice(null)} className="text-indigo-400 hover:text-white cursor-pointer">
                      ✕
                    </button>
                  </div>
                )}

                {/* Estado de Carregamento */}
                {loadingDiagnostic && (
                  <div className="py-10 px-6 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-center space-y-3 animate-pulse">
                    <div className="w-10 h-10 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                    <h4 className="text-sm sm:text-base font-bold text-slate-200">
                      O Mentor IA está analisando seu histórico e cruzando com a banca AOCP...
                    </h4>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto">
                      Examinando tempo médio por questão, taxa de assertividade por matéria, questões com dúvida e caderno de erros para formular seu plano tático.
                    </p>
                  </div>
                )}

                {/* Conteúdo Rico do Diagnóstico */}
                {!loadingDiagnostic && diagnostic && (
                  <div className="space-y-6">
                    {/* 1. Resumo Executivo do Mentor */}
                    {diagnostic.resumoExecutivo && (
                      <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-[#141d33] to-[#121929] border border-indigo-500/25 flex items-start gap-3.5">
                        <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 shrink-0 mt-0.5">
                          <Brain className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                            Parecer do Mentor Pedagógico
                          </span>
                          <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-medium">
                            {diagnostic.resumoExecutivo}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 2. Grid de 4 KPIs Táticos do Mentor */}
                    {Array.isArray(diagnostic.kpis) && diagnostic.kpis.length > 0 && (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {diagnostic.kpis.map((kpi, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col justify-between hover:border-white/[0.15] transition-colors"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                  {kpi.titulo}
                                </span>
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                    kpi.status === 'positivo'
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : kpi.status === 'alerta'
                                      ? 'bg-amber-500/15 text-amber-400'
                                      : 'bg-rose-500/15 text-rose-400'
                                  }`}
                                >
                                  {kpi.avaliacao}
                                </span>
                              </div>
                              <div className="text-xl sm:text-2xl font-black text-slate-100 font-mono">
                                {kpi.valor}
                              </div>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-400 mt-2.5 leading-relaxed">
                              {kpi.descricao}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 3. Hero Card: Plano de Ataque para Hoje */}
                    {diagnostic.planoDeAtaque && (
                      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-indigo-950/50 via-[#131b2e] to-[#0f1422] border border-indigo-500/30 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                              <Target className="w-4 h-4" />
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                              Plano de Ataque para Hoje
                            </span>
                          </div>
                          {diagnostic.planoDeAtaque.prioridade && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                              Prioridade: {diagnostic.planoDeAtaque.prioridade}
                            </span>
                          )}
                        </div>

                        <div>
                          <h4 className="text-base sm:text-lg font-bold text-slate-100">
                            {diagnostic.planoDeAtaque.disciplina}
                            {diagnostic.planoDeAtaque.topico && (
                              <span className="text-indigo-300 font-medium"> — {diagnostic.planoDeAtaque.topico}</span>
                            )}
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
                            {diagnostic.planoDeAtaque.motivo}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {diagnostic.planoDeAtaque.metaEstudo && (
                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs sm:text-sm">
                              <span className="text-indigo-400 font-bold block mb-1">🎯 Meta Prática:</span>
                              <span className="text-slate-300">{diagnostic.planoDeAtaque.metaEstudo}</span>
                            </div>
                          )}
                          {diagnostic.planoDeAtaque.dicaTatica && (
                            <div className="p-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/20 text-xs sm:text-sm">
                              <span className="text-amber-300 font-bold block mb-1">💡 Dica da Banca AOCP:</span>
                              <span className="text-slate-300">{diagnostic.planoDeAtaque.dicaTatica}</span>
                            </div>
                          )}
                        </div>

                        {onStartTargetedQuiz && diagnostic.planoDeAtaque.disciplina && (
                          <div className="pt-2 flex justify-end">
                            <button
                              onClick={() => onStartTargetedQuiz(
                                diagnostic.planoDeAtaque.disciplina,
                                diagnostic.planoDeAtaque.topico || ''
                              )}
                              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer hover:translate-x-0.5"
                            >
                              <span>Treinar este Tópico no Simulado</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. Colunas: Pontos de Alerta vs. Pontos Fortes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Pontos de Atenção */}
                      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
                        <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Pontos de Alerta & Riscos</span>
                        </div>
                        {Array.isArray(diagnostic.pontosDeAtencao) && diagnostic.pontosDeAtencao.length > 0 ? (
                          <div className="space-y-2.5">
                            {diagnostic.pontosDeAtencao.map((alerta, i) => (
                              <div key={i} className="p-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/15 text-xs sm:text-sm">
                                <div className="flex items-center justify-between font-semibold text-rose-300 mb-1">
                                  <span>{alerta.disciplina} • {alerta.topico}</span>
                                </div>
                                <p className="text-slate-300">{alerta.problema}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">Nenhum ponto crítico grave registrado no momento.</p>
                        )}
                      </div>

                      {/* Pontos Fortes */}
                      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Pontos Fortes & Consolidados</span>
                        </div>
                        {Array.isArray(diagnostic.pontosFortes) && diagnostic.pontosFortes.length > 0 ? (
                          <div className="space-y-2">
                            {diagnostic.pontosFortes.map((forte, i) => (
                              <div key={i} className="p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 text-xs sm:text-sm text-slate-300 flex items-start gap-2">
                                <span className="text-emerald-400 font-bold">✓</span>
                                <span>{typeof forte === 'string' ? forte : forte.topico || forte.descricao}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">Resolva mais simulados para consolidar sua base estatística.</p>
                        )}
                      </div>
                    </div>

                    {/* 5. Ações Práticas Recomendadas */}
                    {Array.isArray(diagnostic.acoesRecomendadas) && diagnostic.acoesRecomendadas.length > 0 && (
                      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                          <Zap className="w-4 h-4" />
                          <span>Ações Táticas Recomendadas</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {diagnostic.acoesRecomendadas.map((acao, i) => (
                            <div
                              key={i}
                              className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-semibold text-slate-200">
                                  {acao.acao}
                                </div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                  {acao.impacto}
                                </div>
                              </div>
                              {acao.tipoAcao === 'caderno' && (
                                <button
                                  onClick={() => setActiveSubTab('erros')}
                                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold shrink-0 transition-colors cursor-pointer"
                                >
                                  Abrir Caderno
                                </button>
                              )}
                              {acao.tipoAcao === 'treino' && onStartTargetedQuiz && (
                                <button
                                  onClick={() => onStartTargetedQuiz(
                                    diagnostic.planoDeAtaque?.disciplina || '',
                                    diagnostic.planoDeAtaque?.topico || ''
                                  )}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-bold shrink-0 transition-colors cursor-pointer"
                                >
                                  Iniciar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Estado Inicial (Antes de gerar pela primeira vez) */}
                {!loadingDiagnostic && !diagnostic && (
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Clique em <strong>&ldquo;Atualizar Diagnóstico&rdquo;</strong> para que a Inteligência Artificial examine seus dados reais no banco de dados SQLite e elabore um plano de estudos tático e personalizado.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                        <span className="text-xs font-bold text-indigo-400 block flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" />
                          <span>Zonas Críticas</span>
                        </span>
                        <p className="text-[11px] text-slate-400">Mapeamento dos tópicos onde você mais erra e precisam de blindagem.</p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                        <span className="text-xs font-bold text-amber-400 block flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Calibração de Ritmo</span>
                        </span>
                        <p className="text-[11px] text-slate-400">Comparação do seu tempo médio por questão com a margem da PMPE (2m30s).</p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                        <span className="text-xs font-bold text-emerald-400 block flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          <span>Plano Imediato</span>
                        </span>
                        <p className="text-[11px] text-slate-400">Indicação cirúrgica de qual matéria e tópico estudar hoje para subir sua nota.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. APROVEITAMENTO POR DISCIPLINA */}
              <div className="p-6 sm:p-8 rounded-3xl bg-[#121929] border border-white/[0.08]">
                <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-5">Aproveitamento por Disciplina</h3>
                <div className="space-y-4">
                  {(data.disciplinas || []).map((disc) => (
                    <div key={disc.disciplina}>
                      <div className="flex justify-between text-sm sm:text-base font-semibold mb-1.5">
                        <span className="text-slate-200">{disc.disciplina}</span>
                        <span className="text-slate-400 font-mono">
                          {disc.acertos}/{disc.total} ({disc.taxa}%) • ⏱ {disc.tempo_medio || 0}s/q
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            disc.taxa >= 75 ? 'bg-emerald-500' : disc.taxa >= 60 ? 'bg-indigo-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${disc.taxa}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* CONTEÚDO DA SUB-ABA: CADERNO DE ERROS (SISTEMA LEITNER) */}
      {activeSubTab === 'erros' && (
        <div className="space-y-5">
          <div className="p-6 sm:p-8 rounded-3xl bg-[#121929] border border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2.5">
                <Brain className="w-6 h-6 text-rose-400" />
                <span>Caderno de Erros (Sistema Leitner)</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Repetição espaçada com base na Curva do Esquecimento. Ao acertar, a questão avança de caixa e se consolida.
              </p>
            </div>

            {onStartCadernoQuiz && caderno.length > 0 && (
              <button
                onClick={() => onStartCadernoQuiz(caderno.slice(0, 15))}
                className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Revisar no Simulado ({Math.min(15, caderno.length)})
              </button>
            )}
          </div>

          {caderno.length === 0 ? (
            <div className="p-10 rounded-3xl bg-[#121929] border border-white/[0.08] text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-80" />
              <p className="text-sm text-slate-400">Nenhuma questão pendente no caderno de erros!</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {caderno.map((q) => {
                const isRevealed = revealedAnswers[q.id];
                return (
                  <div key={q.id} className="p-6 rounded-2xl bg-[#121929] border border-white/[0.08] space-y-3.5">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-rose-400">Caixa Leitner {q.caixa_leitner}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-300 font-medium">{q.disciplina}</span>
                      </div>
                      <span className="text-slate-400 font-mono text-xs">
                        {q.total_acertos} acertos / {q.total_tentativas} tentativas
                      </span>
                    </div>

                    <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">{q.enunciado}</p>

                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                      <button
                        onClick={() => setRevealedAnswers(p => ({ ...p, [q.id]: !p[q.id] }))}
                        className="text-xs sm:text-sm text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                      >
                        {isRevealed ? 'Ocultar Gabarito' : 'Revelar Gabarito'}
                      </button>

                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => handleRevisar(q.id, false)}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 text-xs sm:text-sm font-semibold cursor-pointer hover:bg-rose-500/25"
                        >
                          Errei
                        </button>
                        <button
                          onClick={() => handleRevisar(q.id, true)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs sm:text-sm font-semibold cursor-pointer hover:bg-emerald-500/30"
                        >
                          Acertei
                        </button>
                      </div>
                    </div>

                    {isRevealed && (
                      <div className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs sm:text-sm text-slate-200 space-y-2">
                        <div className="text-emerald-400 font-bold">Gabarito: Letra ({q.gabarito})</div>
                        <p>{q.explicacao?.correta}</p>
                        <LegalReferencePanel question={q} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
