import React, { useState, useEffect, useMemo } from 'react';
import CadernoTab from './CadernoTab';
import { 
  BarChart3, 
  CheckCircle2, 
  Sparkles, 
  Target, 
  Brain, 
  Trash2, 
  History,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  Filter,
  TrendingUp,
  TrendingDown,
  Layers,
  BookOpen,
  X,
  Eye,
} from 'lucide-react';
import { 
  fetchDesempenho, 
  fetchCadernoErros, 
  revisarQuestaoCaderno,
  fetchPlano,
  fetchSimulados,
  deleteSimulado,
  clearAllSimulados,
  getSavedApiKey
} from '../services/api';

// Normaliza o retorno da IA para estrutura garantida de KPIs e plano tático
function parseDiagnostic(raw, fallbackData) {
  if (!raw && !fallbackData) return null;

  if (raw && typeof raw === 'object' && raw.kpis && raw.resumoExecutivo) {
    return raw;
  }

  let text = typeof raw === 'string' ? raw.trim() : '';

  if (text) {
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
          // segue para o gerador de fallback
        }
      }
    }
  }

  const pace = fallbackData?.global?.tempoMedioPorQuestao || 0;
  const taxa = fallbackData?.global?.taxaGeral || 0;
  const totalQuestoes = fallbackData?.global?.totalQuestoes || 0;
  const pendentes = fallbackData?.cadernoErros?.pendentes_hoje ?? fallbackData?.cadernoErros?.total_pendentes ?? 0;
  const impulsivos = fallbackData?.global?.errosImpulsividade || 0;
  const nota60 = Math.round((taxa / 100) * 60);

  const topicoCritico = fallbackData?.zonasCriticas?.[0] || null;
  const discAlvo = topicoCritico?.disciplina || fallbackData?.disciplinas?.[0]?.disciplina || 'Direito Constitucional';
  const topicoAlvo = topicoCritico?.assunto || 'Artigo 5º da CF/88';

  const classificacao = taxa >= 75 ? 'Competitivo' : taxa >= 60 ? 'Em Evolução' : 'Atenção Crítica';

  const resumo = typeof raw === 'string' && raw.length > 25 && !raw.includes('{')
    ? raw.replace(/[*#]/g, '').trim()
    : `Com taxa de acerto de ${taxa}% (${totalQuestoes} questões resolvidas) e ritmo médio de ${pace}s/questão, você mantém boa velocidade. O foco prioritário deve ser zerar as pendências do Caderno de Erros e blindar os tópicos mais recorrentes da banca Instituto AOCP.`;

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
  const [, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('kpis'); // 'kpis' | 'erros' | 'simulados'
  const [caderno, setCaderno] = useState([]);
  const [, setLoadingCaderno] = useState(false);
  const [planoCaderno, setPlanoCaderno] = useState({ armadilhas: [], tiposArmadilha: [] });
  const carregarPlanoCaderno = () => fetchPlano().then(setPlanoCaderno).catch(() => {});
  const [simulados, setSimulados] = useState([]);
  const [loadingSimulados, setLoadingSimulados] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Filtros de Desempenho
  const [selectedScope, setSelectedScope] = useState('geral'); // 'geral' | 'simulado' | 'disciplina' | 'assunto'
  const [selectedSimuladoId, setSelectedSimuladoId] = useState('');
  const [selectedDisciplina, setSelectedDisciplina] = useState('');
  const [selectedAssunto, setSelectedAssunto] = useState('');
  const [selectedModo, setSelectedModo] = useState('TODOS'); // 'TODOS' | 'estudo' | 'simulado'

  // Item Inspecionado no Gráfico para Feedback Textual Imediato
  const [inspectedItem, setInspectedItem] = useState(null);
  const [inspectedQuestao, setInspectedQuestao] = useState(null);

  // Diagnóstico Pedagógico com Gemini
  const [diagnostic, setDiagnostic] = useState(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);
  const [diagnosticTimestamp, setDiagnosticTimestamp] = useState(null);
  const [diagnosticNotice, setDiagnosticNotice] = useState(null);

  // Questão aberta no caderno de erros

  const loadData = async (customFilters = null) => {
    try {
      setLoading(true);
      const filtros = customFilters !== null ? customFilters : {
        disciplina: selectedScope === 'disciplina' ? selectedDisciplina : selectedScope === 'assunto' ? selectedDisciplina : '',
        assunto: selectedScope === 'assunto' ? selectedAssunto : '',
        simuladoId: selectedScope === 'simulado' ? selectedSimuladoId : '',
        modo: selectedModo !== 'TODOS' ? selectedModo : ''
      };

      const res = await fetchDesempenho(filtros);
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
    loadCaderno(false);
    carregarPlanoCaderno();
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

  // Recarrega dados sempre que o escopo ou os filtros ativos mudam
  useEffect(() => {
    const filtros = {
      disciplina: (selectedScope === 'disciplina' || selectedScope === 'assunto') ? selectedDisciplina : '',
      assunto: selectedScope === 'assunto' ? selectedAssunto : '',
      simuladoId: selectedScope === 'simulado' ? selectedSimuladoId : '',
      modo: selectedModo !== 'TODOS' ? selectedModo : ''
    };
    loadData(filtros);
    setInspectedQuestao(null);
  }, [selectedScope, selectedSimuladoId, selectedDisciplina, selectedAssunto, selectedModo]);

  const handleDeleteSimulado = async (id) => {
    if (!window.confirm(`Deseja apagar o Simulado #${id}? As métricas de desempenho serão recalculadas imediatamente.`)) {
      return;
    }
    try {
      await deleteSimulado(id);
      setActionFeedback(`Simulado #${id} excluído com sucesso. Suas métricas foram recalculadas.`);
      if (selectedSimuladoId === String(id)) {
        setSelectedSimuladoId('');
        setSelectedScope('geral');
      }
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
      setSelectedSimuladoId('');
      setSelectedScope('geral');
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
        filtro: {
          escopo: selectedScope,
          disciplina: selectedDisciplina || 'Todas',
          assunto: selectedAssunto || 'Todos',
          simuladoId: selectedSimuladoId || 'Todos'
        },
        taxaGeral: data?.global?.taxaGeral,
        totalQuestoes: data?.global?.totalQuestoes,
        totalAcertos: data?.global?.totalAcertos,
        tempoMedioSegundos: data?.global?.tempoMedioPorQuestao,
        errosImpulsividade: data?.global?.errosImpulsividade,
        questoesLentas: data?.global?.questoesLentas,
        notaProjetada60: data?.global?.notaProjetada60,
        cadernoErros: {
          pendentesHoje: data?.cadernoErros?.pendentes_hoje,
          totalPendentes: data?.cadernoErros?.total_pendentes
        },
        disciplinas: (data?.disciplinas || []).map(d => ({
          disciplina: d.disciplina,
          taxa: d.taxa,
          acertos: d.acertos,
          total: d.total,
          tempoMedio: d.tempo_medio
        })),
        zonasCriticas: (data?.zonasCriticas || []).slice(0, 5).map(z => ({
          disciplina: z.disciplina,
          topico: z.assunto,
          taxa: z.taxa,
          erros: z.erros
        }))
      };

      const prompt = `Você é um mentor especialista de elite em aprovação para Soldado da Polícia Militar de Pernambuco (PMPE), com domínio minucioso da banca examinadora Instituto AOCP.
Analise os seguintes dados estatísticos do aluno no SQLite:
${JSON.stringify(summaryPayload, null, 2)}

Contexto da prova PMPE:
- 60 questões objetivas (~2m30s por questão com cartão-resposta).
- Nota de corte estimada: 40 a 48 pontos (66% a 80%).

Instruções cruciais:
1. Avalie o ritmo (${data?.global?.tempoMedioPorQuestao || 0}s/q) e precisão.
2. Identifique os pontos críticos imediatos e forneça plano tático.
RESPONDA EXCLUSIVAMENTE EM FORMATO JSON PURO:
{
  "scoreProntidao": ${data?.global?.taxaGeral || 75},
  "classificacao": "${(data?.global?.taxaGeral || 0) >= 75 ? 'Competitivo' : (data?.global?.taxaGeral || 0) >= 60 ? 'Em Evolução' : 'Atenção Crítica'}",
  "resumoExecutivo": "2 a 3 frases densas e motivadoras avaliando a prontidão real e ajuste de estudo.",
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
    "disciplina": "Nome da matéria prioritária",
    "topico": "Tópico prioritário",
    "prioridade": "Alta",
    "motivo": "Por que focar neste conteúdo.",
    "metaEstudo": "Meta prática de estudo.",
    "dicaTatica": "Dica estratégica de como a banca AOCP cobra este conteúdo."
  },
  "pontosDeAtencao": [
    {
      "disciplina": "Matéria",
      "topico": "Tópico com erros",
      "problema": "Onde está a falha.",
      "gravidade": "alta"
    }
  ],
  "pontosFortes": [
    "Ponto forte demonstrado pelo candidato."
  ],
  "acoesRecomendadas": [
    {
      "acao": "Revisar as pendências no Caderno de Erros",
      "impacto": "Garante retenção na memória de longo prazo.",
      "tipoAcao": "caderno"
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
      console.warn('Erro ao consultar Gemini, usando fallback:', err);
      const localDiagnostic = parseDiagnostic(null, data);
      setDiagnostic(localDiagnostic);
      const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ')';
      setDiagnosticTimestamp(nowStr);
      localStorage.setItem('mentor_ia_diagnostico_cache', JSON.stringify(localDiagnostic));
      localStorage.setItem('mentor_ia_diagnostico_date', nowStr);
      setDiagnosticNotice(`IA temporariamente indisponível (${err.message}). Exibindo diagnóstico preliminar calibrado pelo SQLite.`);
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

  // Helper para acionar feedback do gráfico
  const handleInspectChart = (item) => {
    setInspectedItem(item);
  };

  const hasData = data && data.global && data.global.totalQuestoes > 0;
  const evolucaoList = data?.evolucao || [];

  // Dados para o gráfico de evolução SVG
  const chartPoints = useMemo(() => {
    if (!evolucaoList || evolucaoList.length === 0) return [];
    const width = 680;
    const height = 180;
    const padX = 40;
    const padY = 25;

    const count = evolucaoList.length;
    return evolucaoList.map((sim, index) => {
      const x = count === 1 ? width / 2 : padX + (index * (width - 2 * padX)) / (count - 1);
      const taxa = Math.min(100, Math.max(0, Number(sim.taxa_acerto) || 0));
      const y = height - padY - (taxa / 100) * (height - 2 * padY);
      return { x, y, taxa, sim };
    });
  }, [evolucaoList]);

  // Lista de tópicos filtráveis baseada na disciplina selecionada
  const availableAssuntos = useMemo(() => {
    if (!data?.filtrosDisponiveis?.assuntos) return [];
    if (!selectedDisciplina) return data.filtrosDisponiveis.assuntos;
    return data.filtrosDisponiveis.assuntos.filter(a => a.disciplina === selectedDisciplina);
  }, [data?.filtrosDisponiveis?.assuntos, selectedDisciplina]);

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

      {/* Cabeçalho e sub-abas */}
      <div className="space-y-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">Desempenho</h1>

        <div className="flex items-center gap-6 border-b border-white/[0.06]">
          <button
            onClick={() => setActiveSubTab('kpis')}
            className={`pb-2 text-base border-b-2 transition-colors cursor-pointer ${
              activeSubTab === 'kpis' ? 'border-indigo-400 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Visão geral
          </button>
          <button
            onClick={() => setActiveSubTab('erros')}
            className={`pb-2 text-base border-b-2 transition-colors cursor-pointer ${
              activeSubTab === 'erros' ? 'border-indigo-400 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Caderno de erros
            {data?.cadernoErros?.total_pendentes > 0 && (
              <span className="ml-2 text-sm text-slate-400 font-normal">{data.cadernoErros.total_pendentes}</span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('simulados')}
            className={`pb-2 text-base border-b-2 transition-colors cursor-pointer ${
              activeSubTab === 'simulados' ? 'border-indigo-400 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Testes
            {simulados.length > 0 && (
              <span className="ml-2 text-sm text-slate-400 font-normal">{simulados.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* SUB-ABA: GERENCIAR TESTES */}
      {activeSubTab === 'simulados' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-white/[0.03]">
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
            <div className="p-10 rounded-3xl bg-white/[0.03] text-center">
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
                    className="p-5 sm:p-6 rounded-2xl bg-white/[0.03] hover:border-white/[0.16] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                      <div className="text-right">
                        <div className="flex items-center gap-2.5 justify-end">
                          <span className={`text-base sm:text-lg font-bold ${
                            taxa >= 75 ? 'text-emerald-400' : taxa >= 60 ? 'text-indigo-400' : 'text-rose-400'
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

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedScope('simulado');
                          setSelectedSimuladoId(String(sim.id));
                          setActiveSubTab('kpis');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Ver análise completa deste teste no dashboard"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Ver no Dashboard</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSimulado(sim.id)}
                        className="p-2.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/25 transition-all cursor-pointer"
                        title="Apagar este simulado das estatísticas"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-ABA: DASHBOARD INTERATIVO */}
      {activeSubTab === 'kpis' && (
        <div className="space-y-6">
          {/* BARRA DE ESCOPOS & FILTROS (MINIMALISTA) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-white/[0.03] space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Seletor de Escopo */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
                  <Filter className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Escopo:</span>
                </span>

                <button
                  onClick={() => {
                    setSelectedScope('geral');
                    setSelectedSimuladoId('');
                    setSelectedDisciplina('');
                    setSelectedAssunto('');
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    selectedScope === 'geral'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  Geral (Global)
                </button>

                <button
                  onClick={() => {
                    setSelectedScope('simulado');
                    if (!selectedSimuladoId && data?.filtrosDisponiveis?.simulados?.[0]) {
                      setSelectedSimuladoId(String(data.filtrosDisponiveis.simulados[0].id));
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    selectedScope === 'simulado'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  Teste Individual
                </button>

                <button
                  onClick={() => {
                    setSelectedScope('disciplina');
                    if (!selectedDisciplina && data?.filtrosDisponiveis?.disciplinas?.[0]) {
                      setSelectedDisciplina(data.filtrosDisponiveis.disciplinas[0]);
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    selectedScope === 'disciplina'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  Por Matéria
                </button>

                <button
                  onClick={() => {
                    setSelectedScope('assunto');
                    if (!selectedAssunto && data?.filtrosDisponiveis?.assuntos?.[0]) {
                      setSelectedAssunto(data.filtrosDisponiveis.assuntos[0].assunto);
                      setSelectedDisciplina(data.filtrosDisponiveis.assuntos[0].disciplina);
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    selectedScope === 'assunto'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  Por Assunto
                </button>
              </div>

              {/* Seletor de Modo (Estudo vs Simulado) */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="hidden sm:inline">Modo:</span>
                <select
                  value={selectedModo}
                  onChange={(e) => setSelectedModo(e.target.value)}
                  className="bg-white/[0.04] text-slate-200 border border-white/[0.08] rounded-xl px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="TODOS" className="bg-[#121929]">Todos os Modos</option>
                  <option value="estudo" className="bg-[#121929]">Modo Estudo</option>
                  <option value="simulado" className="bg-[#121929]">Simulado Prova</option>
                </select>
              </div>
            </div>

            {/* SELETORES CONTEXTUAIS CONFORME O ESCOPO SELECIONADO */}
            {selectedScope === 'simulado' && (
              <div className="pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center gap-3">
                <label className="text-xs text-slate-400 font-medium">Selecione o Simulado:</label>
                <select
                  value={selectedSimuladoId}
                  onChange={(e) => setSelectedSimuladoId(e.target.value)}
                  className="bg-white/[0.04] text-slate-100 border border-indigo-500/40 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer min-w-[280px]"
                >
                  {(data?.filtrosDisponiveis?.simulados || []).map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#121929]">
                      Simulado #{s.id} — {s.disciplina} ({Math.round(s.taxa_acerto || 0)}%) • {s.data_hora}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedScope === 'disciplina' && (
              <div className="pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center gap-3">
                <label className="text-xs text-slate-400 font-medium">Selecione a Matéria:</label>
                <select
                  value={selectedDisciplina}
                  onChange={(e) => setSelectedDisciplina(e.target.value)}
                  className="bg-white/[0.04] text-slate-100 border border-indigo-500/40 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer min-w-[260px]"
                >
                  {(data?.filtrosDisponiveis?.disciplinas || []).map((disc) => (
                    <option key={disc} value={disc} className="bg-[#121929]">
                      {disc}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedScope === 'assunto' && (
              <div className="pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400 font-medium">Matéria:</label>
                  <select
                    value={selectedDisciplina}
                    onChange={(e) => {
                      setSelectedDisciplina(e.target.value);
                      setSelectedAssunto('');
                    }}
                    className="bg-white/[0.04] text-slate-100 border border-white/[0.1] rounded-xl px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-400 cursor-pointer"
                  >
                    <option value="" className="bg-[#121929]">Todas as Matérias</option>
                    {(data?.filtrosDisponiveis?.disciplinas || []).map((d) => (
                      <option key={d} value={d} className="bg-[#121929]">{d}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400 font-medium">Tópico / Assunto:</label>
                  <select
                    value={selectedAssunto}
                    onChange={(e) => setSelectedAssunto(e.target.value)}
                    className="bg-white/[0.04] text-slate-100 border border-indigo-500/40 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer min-w-[260px]"
                  >
                    <option value="" className="bg-[#121929]">Selecione um Assunto...</option>
                    {availableAssuntos.map((a, idx) => (
                      <option key={idx} value={a.assunto} className="bg-[#121929]">
                        {a.assunto} ({a.total} q)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {!hasData ? (
            <div className="bg-white/[0.03] rounded-3xl p-14 text-center max-w-xl mx-auto">
              <Target className="w-14 h-14 text-indigo-400 mx-auto mb-4 opacity-80" />
              <h2 className="text-xl font-bold text-slate-100 mb-2">Nenhum dado encontrado para este filtro</h2>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Tente selecionar outro simulado, matéria ou volte para o filtro &quot;Geral&quot;.
              </p>
              <button
                onClick={() => {
                  setSelectedScope('geral');
                  setSelectedSimuladoId('');
                  setSelectedDisciplina('');
                  setSelectedAssunto('');
                }}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition-all cursor-pointer"
              >
                Restaurar Visão Geral
              </button>
            </div>
          ) : (
            <>
              {/* 1. CARDS DE KPIS ESSENCIAIS COM NÚMEROS GRANDES (CONFORME FILTRO) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div 
                  onClick={() => handleInspectChart({
                    tipo: 'kpi',
                    titulo: 'Aproveitamento Geral no Filtro',
                    taxa: data.global.taxaGeral,
                    acertos: data.global.totalAcertos,
                    total: data.global.totalQuestoes,
                    feedback: data.global.taxaGeral >= 75
                      ? `Com ${data.global.taxaGeral}% de acertos nesta seleção (${data.global.totalAcertos}/${data.global.totalQuestoes}), você está acima da nota de corte projetada (75%) da banca AOCP.`
                      : `Com ${data.global.taxaGeral}% de aproveitamento, você está abaixo do corte ideal (75%). Reforce a memorização de exceções e prazos legais.`
                  })}
                  className="p-5 sm:p-6 rounded-3xl bg-white/[0.03] hover:border-white/[0.2] transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block">
                      Aproveitamento
                    </span>
                    <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">Ver Feedback</span>
                  </div>
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

                <div 
                  onClick={() => handleInspectChart({
                    tipo: 'pacing',
                    titulo: 'Gestão de Tempo e Pacing',
                    tempoMedio: data.global.tempoMedioPorQuestao,
                    feedback: data.global.tempoMedioPorQuestao <= 60
                      ? `Ritmo excelente de ${data.global.tempoMedioPorQuestao}s por questão! Na PMPE o limite recomendado é 150s (2m30s). Você economiza tempo precioso para a Redação e RLM.`
                      : data.global.tempoMedioPorQuestao <= 120
                      ? `Ritmo equilibrado de ${data.global.tempoMedioPorQuestao}s por questão, dentro da zona de segurança do concurso da PMPE.`
                      : `Atenção: ritmo lento de ${data.global.tempoMedioPorQuestao}s por questão. Risco de faltar tempo para preencher o gabarito ou fazer a redação da PMPE.`
                  })}
                  className="p-5 sm:p-6 rounded-3xl bg-white/[0.03] hover:border-white/[0.2] transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block">
                      Pacing Médio
                    </span>
                    <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">Ver Feedback</span>
                  </div>
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-100 font-mono">
                    {Math.floor(data.global.tempoMedioPorQuestao / 60)}m {data.global.tempoMedioPorQuestao % 60}s
                  </div>
                </div>

                <div 
                  onClick={() => setActiveSubTab('erros')}
                  className="p-5 sm:p-6 rounded-3xl bg-white/[0.03] hover:border-amber-500/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block">
                      Caderno de Erros
                    </span>
                    <span className="text-xs text-slate-500">Abrir</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-100">
                      {data.cadernoErros.pendentes_hoje}
                    </span>
                    <span className="text-xs sm:text-sm text-slate-400">pendentes</span>
                  </div>
                </div>

                <div 
                  onClick={() => handleInspectChart({
                    tipo: 'nota',
                    titulo: 'Projeção para Prova Objetiva PMPE',
                    nota: Math.round((data.global.taxaGeral / 100) * 60),
                    feedback: `Com base em 60 questões da prova oficial de Soldado da PMPE, sua taxa atual (${data.global.taxaGeral}%) projeta ${Math.round((data.global.taxaGeral / 100) * 60)} acertos. O corte histórico para convocação ao TAF varia entre 40 e 46 pontos.`
                  })}
                  className="p-5 sm:p-6 rounded-3xl bg-white/[0.03] hover:border-white/[0.2] transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider block">
                      Nota Projetada
                    </span>
                    <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">Ver Feedback</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-100">
                      {Math.round((data.global.taxaGeral / 100) * 60)}
                    </span>
                    <span className="text-xs sm:text-sm text-slate-400">/ 60 pts</span>
                  </div>
                </div>
              </div>

              {/* PAINEL DE FEEDBACK TÁTICO INTERATIVO (QUANDO O USUÁRIO CLICA EM QUALQUER ELEMENTO DO GRÁFICO) */}
              {inspectedItem && (
                <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-indigo-950/40 via-[#131b2e] to-[#0f1422] border border-indigo-500/30 animate-in fade-in slide-in-from-top-2 relative">
                  <button
                    onClick={() => setInspectedItem(null)}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                    title="Fechar Feedback"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-start gap-3.5 pr-8">
                    <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-300 shrink-0 mt-0.5">
                      <Sparkles className="w-5 h-5 text-indigo-300" />
                    </div>

                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                          Feedback Interativo do Gráfico
                        </span>
                        {inspectedItem.taxa !== undefined && (
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                            inspectedItem.taxa >= 75
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : inspectedItem.taxa >= 60
                              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}>
                            {inspectedItem.taxa}% de Precisão
                          </span>
                        )}
                        {inspectedItem.tempoMedio !== undefined && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-300 font-mono">
                            ⏱ {inspectedItem.tempoMedio}s/q
                          </span>
                        )}
                      </div>

                      <h4 className="text-base sm:text-lg font-bold text-slate-100">
                        {inspectedItem.titulo}
                      </h4>

                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                        {inspectedItem.feedback}
                      </p>

                      {inspectedItem.dica && (
                        <div className="p-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 text-xs sm:text-sm text-amber-200 mt-2">
                          <span className="font-bold text-amber-300 block mb-0.5">💡 Dica Estratégica da Banca:</span>
                          {inspectedItem.dica}
                        </div>
                      )}

                      {inspectedItem.acao && (
                        <div className="pt-2">
                          <button
                            onClick={inspectedItem.acao}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <span>{inspectedItem.acaoLabel || 'Filtrar por este item'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SE VISÃO FOR TESTE INDIVIDUAL ESPECÍFICO: GRADE DE QUESTÕES DO SIMULADO */}
              {selectedScope === 'simulado' && data?.simuladoDetalhes && (
                <div className="p-6 sm:p-8 rounded-3xl bg-[#121929] border border-indigo-500/30 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-indigo-400">Simulado #{data.simuladoDetalhes.id}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/[0.05] text-slate-300">
                          {data.simuladoDetalhes.modo === 'simulado' ? 'Simulado Prova' : 'Modo Estudo'}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-xs text-slate-400 font-mono">{data.simuladoDetalhes.data_hora}</span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-100">
                        {data.simuladoDetalhes.disciplina}
                        {data.simuladoDetalhes.assunto && <span className="text-slate-400"> — {data.simuladoDetalhes.assunto}</span>}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono">
                        <div className="text-lg font-bold text-emerald-400">
                          {Math.round(data.simuladoDetalhes.taxa_acerto || 0)}%
                        </div>
                        <div className="text-xs text-slate-400">
                          {data.simuladoDetalhes.acertos} / {data.simuladoDetalhes.total_questoes} acertos
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grid Interativo de Questões do Teste */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
                      Questões do Teste (Clique para inspecionar gabarito e resposta):
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                      {(data?.questoesDoSimulado || []).map((q, idx) => {
                        const isAcertou = q.acertou === 1;
                        const isSelected = inspectedQuestao?.id === q.id;

                        return (
                          <button
                            key={q.id || idx}
                            onClick={() => setInspectedQuestao(isSelected ? null : q)}
                            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'border-white bg-white/[0.1] shadow-lg ring-2 ring-indigo-500'
                                : isAcertou
                                ? 'bg-emerald-500/[0.06] border-emerald-500/20 hover:border-emerald-500/40 text-emerald-300'
                                : 'bg-rose-500/[0.06] border-rose-500/20 hover:border-rose-500/40 text-rose-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold">Q{q.questao_numero || idx + 1}</span>
                              <span className="text-[10px] font-bold">
                                {isAcertou ? '✓' : '✕'}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono opacity-80">
                              {q.tempo_segundos ? `${q.tempo_segundos}s` : '0s'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detalhe da Questão Inspecionada do Teste */}
                  {inspectedQuestao && (
                    <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-bold ${
                            inspectedQuestao.acertou === 1 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {inspectedQuestao.acertou === 1 ? 'ACERTOU' : 'ERROU'}
                          </span>
                          <span className="text-slate-400 font-mono">
                            Sua resposta: ({inspectedQuestao.resposta_usuario || '—'}) | Gabarito: ({inspectedQuestao.gabarito})
                          </span>
                        </div>
                        <button
                          onClick={() => setInspectedQuestao(null)}
                          className="text-slate-400 hover:text-white cursor-pointer text-xs"
                        >
                          Fechar
                        </button>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                        {inspectedQuestao.enunciado}
                      </p>

                      {inspectedQuestao.explicacao_json && (
                        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-300 space-y-1">
                          <span className="font-bold text-indigo-400 block">Fundamentação:</span>
                          <p>
                            {typeof inspectedQuestao.explicacao_json === 'string'
                              ? (() => {
                                  try {
                                    const parsed = JSON.parse(inspectedQuestao.explicacao_json);
                                    return parsed.correta || parsed.explicacao || inspectedQuestao.explicacao_json;
                                  } catch {
                                    return inspectedQuestao.explicacao_json;
                                  }
                                })()
                              : inspectedQuestao.explicacao_json.correta}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 2. GRÁFICO 1: EVOLUÇÃO E ACERTOS AO LONGO DOS TESTES (INTERATIVO COM CLIQUE) */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-400" />
                      <span>Evolução nos testes</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Clique em qualquer ponto do gráfico para ver o feedback detalhado daquele teste
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-medium">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      <span>Sua Taxa (%)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-400" />
                      <span>Corte PMPE (75%)</span>
                    </div>
                  </div>
                </div>

                {chartPoints.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    Realize simulados para traçar sua curva de evolução histórica.
                  </div>
                ) : (
                  <div className="relative pt-2">
                    <div className="w-full overflow-x-auto">
                      <svg
                        viewBox="0 0 680 180"
                        className="w-full h-44 sm:h-52 overflow-visible select-none"
                      >
                        <defs>
                          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Linhas de Grade discretas */}
                        <line x1="40" y1="25" x2="640" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                        <line x1="40" y1="87" x2="640" y2="87" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                        <line x1="40" y1="155" x2="640" y2="155" stroke="rgba(255,255,255,0.05)" />

                        {/* Linha de Corte PMPE (75%) = y ~ 57.5 */}
                        <line
                          x1="40"
                          y1="57.5"
                          x2="640"
                          y2="57.5"
                          stroke="#10b981"
                          strokeWidth="1.5"
                          strokeDasharray="4 4"
                          opacity="0.75"
                        />
                        <text x="645" y="61" fill="#10b981" fontSize="10" fontWeight="bold">
                          75%
                        </text>

                        {/* Linha de Área Preenchida */}
                        {chartPoints.length > 1 && (
                          <polygon
                            points={`
                              ${chartPoints[0].x},155 
                              ${chartPoints.map(p => `${p.x},${p.y}`).join(' ')} 
                              ${chartPoints[chartPoints.length - 1].x},155
                            `}
                            fill="url(#chartGradient)"
                          />
                        )}

                        {/* Linha Conectora dos Pontos */}
                        {chartPoints.length > 1 && (
                          <polyline
                            points={chartPoints.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#818cf8"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}

                        {/* Pontos Clicáveis Interativos */}
                        {chartPoints.map((pt, i) => {
                          const isSuccess = pt.taxa >= 75;
                          return (
                            <g
                              key={i}
                              className="cursor-pointer group"
                              onClick={() => handleInspectChart({
                                tipo: 'simulado',
                                titulo: `Simulado #${pt.sim.id} — ${pt.sim.disciplina}`,
                                taxa: Math.round(pt.taxa),
                                tempoMedio: pt.sim.tempo_medio_questao,
                                feedback: isSuccess
                                  ? `Excelente resultado! Você atingiu ${Math.round(pt.taxa)}% de acertos (${pt.sim.acertos}/${pt.sim.total_questoes} questões) no Simulado #${pt.sim.id}. Este aproveitamento coloca você na faixa dos aprovados no TAF.`
                                  : `No Simulado #${pt.sim.id}, você acertou ${pt.sim.acertos} de ${pt.sim.total_questoes} questões (${Math.round(pt.taxa)}%). Ficou abaixo da nota de corte ideal de 75%. Indicamos revisar o caderno de erros deste simulado.`,
                                dica: pt.sim.assunto && pt.sim.assunto !== 'Tópicos gerais'
                                  ? `O assunto prioritário trabalhado foi "${pt.sim.assunto}". Fique atento às pegadinhas da banca AOCP sobre este tema.`
                                  : 'Mantenha o ritmo de resolução para consolidar o tempo de prova.',
                                acaoLabel: 'Filtrar Dashboard por Este Teste',
                                acao: () => {
                                  setSelectedScope('simulado');
                                  setSelectedSimuladoId(String(pt.sim.id));
                                }
                              })}
                            >
                              {/* Círculo invisível maior para facilitar o clique no mobile */}
                              <circle cx={pt.x} cy={pt.y} r="16" fill="transparent" />

                              {/* Ponto Visual */}
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="6"
                                className={`transition-all duration-200 ${
                                  isSuccess ? 'fill-emerald-400 stroke-emerald-950' : 'fill-indigo-400 stroke-indigo-950'
                                } group-hover:r-8 group-hover:stroke-white`}
                                strokeWidth="2.5"
                              />

                              {/* Label de Porcentagem acima do Ponto */}
                              <text
                                x={pt.x}
                                y={pt.y - 12}
                                textAnchor="middle"
                                fill="#f1f5f9"
                                fontSize="11"
                                fontWeight="bold"
                                className="group-hover:fill-indigo-300 transition-colors"
                              >
                                {Math.round(pt.taxa)}%
                              </text>

                              {/* Label do Simulado abaixo do Ponto */}
                              <text
                                x={pt.x}
                                y="172"
                                textAnchor="middle"
                                fill="#94a3b8"
                                fontSize="10"
                                fontFamily="monospace"
                              >
                                #{pt.sim.id}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. GRÁFICO 2: APROVEITAMENTO POR DISCIPLINA (INTERATIVO COM CLIQUE) */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                      <span>Aproveitamento por disciplina</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Barras com precisão e ritmo. Clique em uma matéria para ver o diagnóstico estratégico
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  {(data.disciplinas || []).map((disc) => {
                    const isCompetitivo = disc.taxa >= 75;
                    const isRegular = disc.taxa >= 60 && disc.taxa < 75;

                    return (
                      <div
                        key={disc.disciplina}
                        onClick={() => handleInspectChart({
                          tipo: 'disciplina',
                          titulo: disc.disciplina,
                          taxa: disc.taxa,
                          acertos: disc.acertos,
                          total: disc.total,
                          tempoMedio: disc.tempo_medio,
                          feedback: isCompetitivo
                            ? `Você possui aproveitamento consolidado de ${disc.taxa}% em ${disc.disciplina} (${disc.acertos}/${disc.total} questões). Seu ritmo médio é de ${disc.tempo_medio || 0}s/q. Esta matéria pode ser considerada sua alavanca de pontos na PMPE.`
                            : isRegular
                            ? `Em ${disc.disciplina}, sua taxa de acerto é de ${disc.taxa}%. Você está muito próximo da nota de corte (75%). Ajustar a literalidade de artigos ou enunciados pode garantir 2 a 3 pontos adicionais.`
                            : `Atenção Crítica em ${disc.disciplina}: aproveitamento de apenas ${disc.taxa}%. Para o concurso da PMPE, zerar ou ir mal nesta matéria compromete a classificação final. Recomendamos treino focado imediatamente.`,
                          dica: `A banca Instituto AOCP elabora questões de ${disc.disciplina} priorizando a literalidade da lei seca e pegadinhas em prazos e competências.`,
                          acaoLabel: `Filtrar Dashboard por ${disc.disciplina}`,
                          acao: () => {
                            setSelectedScope('disciplina');
                            setSelectedDisciplina(disc.disciplina);
                          }
                        })}
                        className="p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-indigo-500/30 transition-all cursor-pointer group"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base font-semibold mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-100 group-hover:text-indigo-300 transition-colors">
                              {disc.disciplina}
                            </span>
                            {disc.tendencia !== null && disc.tendencia !== undefined && (
                              <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-0.5 font-mono ${
                                disc.tendencia >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                              }`}>
                                {disc.tendencia >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {disc.tendencia > 0 ? `+${disc.tendencia}%` : `${disc.tendencia}%`}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs sm:text-sm font-mono">
                            <span className={`font-bold ${
                              isCompetitivo ? 'text-emerald-400' : isRegular ? 'text-indigo-400' : 'text-rose-400'
                            }`}>
                              {disc.taxa}% ({disc.acertos}/{disc.total})
                            </span>
                            <span className="text-slate-400">
                              ⏱ {disc.tempo_medio || 0}s/q
                            </span>
                          </div>
                        </div>

                        {/* Barra de Progresso Visual */}
                        <div className="w-full h-3 rounded-full bg-white/[0.04] overflow-hidden p-0.5 border border-white/[0.06]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isCompetitivo
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : isRegular
                                ? 'bg-gradient-to-r from-indigo-500 to-indigo-400'
                                : 'bg-gradient-to-r from-rose-500 to-red-400'
                            }`}
                            style={{ width: `${Math.max(4, Math.min(100, disc.taxa))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. GRÁFICO 3: RADAR & MATRIZ DE ASSUNTOS E TÓPICOS (INTERATIVO COM CLIQUE) */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                      <Layers className="w-5 h-5 text-indigo-400" />
                      <span>Tópicos do edital</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Seguro (75% ou mais) · Atenção (60 a 74%) · Crítico (abaixo de 60%)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                  {(data.assuntos || []).slice(0, 12).map((topico, idx) => {
                    const isSafe = topico.taxa >= 75;
                    const isMid = topico.taxa >= 60 && topico.taxa < 75;

                    return (
                      <div
                        key={idx}
                        onClick={() => handleInspectChart({
                          tipo: 'assunto',
                          titulo: topico.assunto,
                          taxa: topico.taxa,
                          acertos: topico.acertos,
                          total: topico.total,
                          tempoMedio: topico.tempo_medio,
                          feedback: isSafe
                            ? `Tópico dominado com ${topico.taxa}% de precisão (${topico.acertos}/${topico.total}). Mantenha revisões espaçadas de 15 em 15 dias.`
                            : isMid
                            ? `Tópico em zona de transição (${topico.taxa}% de acertos). Os erros costumam ser em detalhes de texto ou palavras restritivas ("sempre", "nunca").`
                            : `Tópico Crítico com taxa de ${topico.taxa}% e ${topico.erros} erro(s). É altamente provável a cobrança deste assunto na prova de Soldado da PMPE.`,
                          dica: `A banca AOCP costuma cobrar o tema "${topico.assunto}" exigindo memorização de parágrafos e incisos exatos.`,
                          acaoLabel: `Treinar questões de ${topico.assunto}`,
                          acao: () => {
                            if (onStartTargetedQuiz) {
                              onStartTargetedQuiz(topico.disciplina, topico.assunto);
                            } else {
                              setSelectedScope('assunto');
                              setSelectedDisciplina(topico.disciplina);
                              setSelectedAssunto(topico.assunto);
                            }
                          }
                        })}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSafe
                            ? 'bg-emerald-500/[0.04] border-emerald-500/20 hover:border-emerald-500/50'
                            : isMid
                            ? 'bg-indigo-500/[0.04] border-indigo-500/20 hover:border-indigo-500/50'
                            : 'bg-rose-500/[0.04] border-rose-500/20 hover:border-rose-500/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-slate-400 font-medium truncate max-w-[140px]">
                              {topico.disciplina}
                            </span>
                            <span className={`font-bold font-mono px-2 py-0.5 rounded ${
                              isSafe
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : isMid
                                ? 'bg-indigo-500/15 text-indigo-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}>
                              {topico.taxa}%
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-100 line-clamp-2">
                            {topico.assunto}
                          </h4>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-400 font-mono mt-3 pt-2 border-t border-white/[0.04]">
                          <span>{topico.acertos} / {topico.total} acertos</span>
                          <span>⏱ {topico.tempo_medio || 0}s/q</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 5. DIAGNÓSTICO TÁTICO COM GEMINI & MENTOR PEDAGÓGICO */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] relative overflow-hidden space-y-6">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06] relative z-10">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-amber-400/10 text-amber-300 border border-amber-400/20 shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-100">Diagnóstico com IA</h3>
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

                {loadingDiagnostic && (
                  <div className="py-10 px-6 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-center space-y-3 animate-pulse">
                    <div className="w-10 h-10 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                    <h4 className="text-sm sm:text-base font-bold text-slate-200">
                      O Mentor IA está analisando seu histórico e cruzando com a banca AOCP...
                    </h4>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto">
                      Examinando tempo médio por questão, taxa de assertividade por matéria e caderno de erros.
                    </p>
                  </div>
                )}

                {!loadingDiagnostic && diagnostic && (
                  <div className="space-y-6">
                    {/* Resumo Executivo do Mentor */}
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

                    {/* Grid de KPIs Táticos */}
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

                    {/* Plano de Ataque */}
                    {diagnostic.planoDeAtaque && (
                      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-indigo-950/50 via-[#131b2e] to-[#0f1422] border border-indigo-500/30 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                              <Target className="w-4 h-4" />
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                              Plano de Ataque Imediato
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
                              <span className="text-indigo-400 font-bold block mb-1">Meta Prática:</span>
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
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* SUB-ABA: CADERNO DE ERROS (SISTEMA LEITNER) */}
      {activeSubTab === 'erros' && (
        <CadernoTab
          caderno={caderno}
          planoCaderno={planoCaderno}
          onRevisar={handleRevisar}
          onStartCadernoQuiz={onStartCadernoQuiz}
          onNotasSalvas={carregarPlanoCaderno}
        />
      )}
    </div>
  );
}
