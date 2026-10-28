import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Trophy, 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  RotateCcw, 
  Target, 
  Layers, 
  Brain, 
  Trash2, 
  History,
  Calendar,
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { 
  fetchDesempenho, 
  fetchCadernoErros, 
  revisarQuestaoCaderno,
  fetchSimulados,
  deleteSimulado,
  clearAllSimulados
} from '../services/api';

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
    if (!apiKey) {
      alert('Por favor, configure sua chave de API na aba Opções para gerar o diagnóstico.');
      return;
    }

    setLoadingDiagnostic(true);
    setDiagnostic(null);

    try {
      const summaryPayload = {
        taxaGeral: data?.global?.taxaGeral,
        totalQuestoes: data?.global?.totalQuestoes,
        tempoMedio: data?.global?.tempoMedioPorQuestao,
        disciplinas: data?.disciplinas,
        zonasCriticas: data?.zonasCriticas,
        pontosFortes: data?.pontosFortes
      };

      const prompt = `Você é um mentor especialista em aprovação no concurso de Soldado da PMPE e banca Instituto AOCP.
Analise os seguintes dados REAIS gravados no banco SQLite do estudante:
${JSON.stringify(summaryPayload, null, 2)}

Elabore um DIAGNÓSTICO TÁTICO ESTRATÉGICO e DIRETO AO PONTO com:
1. 🎯 PLANO DE ATAQUE PARA HOJE: Qual disciplina e tópico específico o aluno deve estudar hoje e por quê.
2. ⚠️ PONTOS DE ALERTA: Em quais conteúdos ele está perdendo pontos.
3. ⏱️ GESTÃO DE TEMPO: Análise do tempo médio por questão comparado ao limite oficial da PMPE.
4. 🚀 RECOMENDAÇÃO PRÁTICA: 2 ações para os próximos dias.`;

      const activeModel = model || 'gemini-3.8-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 }
        })
      });

      if (!res.ok) throw new Error('Falha ao comunicar com a IA para o diagnóstico.');
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      setDiagnostic(text);
    } catch (err) {
      alert(err.message);
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
              <div className="p-6 sm:p-8 rounded-3xl bg-[#121929] border border-white/[0.08]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    <h3 className="text-base sm:text-lg font-bold text-slate-100">Mentor IA: Diagnóstico de Desempenho</h3>
                  </div>

                  <button
                    onClick={handleGenerateDiagnostic}
                    disabled={loadingDiagnostic}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loadingDiagnostic ? 'Analisando...' : 'Atualizar Diagnóstico'}
                  </button>
                </div>

                {diagnostic ? (
                  <div className="mt-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-sm sm:text-base text-slate-200 whitespace-pre-line leading-relaxed">
                    {diagnostic}
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-slate-400">
                    Clique em &ldquo;Atualizar Diagnóstico&rdquo; para que a IA analise seus erros mais frequentes e oriente seu estudo.
                  </p>
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
                      <div className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs sm:text-sm text-slate-200 space-y-1.5">
                        <div className="text-emerald-400 font-bold">Gabarito: Letra ({q.gabarito})</div>
                        <p>{q.explicacao?.correta}</p>
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
