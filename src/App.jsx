import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import QuizConfig from './components/QuizConfig';
import QuizRunner from './components/QuizRunner';
import QuizResult from './components/QuizResult';
import ExamManager from './components/ExamManager';
import VadeMecum from './components/VadeMecum';
import HistoryTab from './components/HistoryTab';
import PlanoEstudo from './components/PlanoEstudo';
import SettingsTab from './components/SettingsTab';

import { 
  fetchProvas, 
  fetchCadernoErros,
  fetchContextSnippets, 
  saveSimuladoResult,
  getSavedApiKey,
  salvarNoBanco,
  buscarNoBanco,
  registrarResultadoBanco
} from './services/api';

import { getPreferences } from './services/preferencesService';
import { 
  getApiKey, 
  saveApiKey,
  getSelectedModel, 
  DEFAULT_MODEL,
  generateQuestionsWithGemini,
  dividirProporcao,
  getAiLogs
} from './services/geminiService';

export default function App() {
  const [activeTab, setActiveTab] = useState('quiz'); // 'quiz' | 'exams' | 'history' | 'settings'
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [preferences, setPreferences] = useState(getPreferences());
  const [exams, setExams] = useState([]);

  // Estados do Quiz
  const [quizState, setQuizState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pmpe_sessao_ativa') || 'null');
      return saved?.quiz?.length > 0 ? 'running' : 'config';
    } catch { return 'config'; }
  }); // 'config' | 'running' | 'result'
  const [currentQuiz, setCurrentQuiz] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pmpe_sessao_ativa') || 'null');
      return Array.isArray(saved?.quiz) ? saved.quiz : [];
    } catch { return []; }
  });
  const [quizMode, setQuizMode] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pmpe_sessao_ativa') || 'null');
      return saved?.modo || 'estudo';
    } catch { return 'estudo'; }
  });
  const [currentQuizMeta, setCurrentQuizMeta] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pmpe_sessao_ativa') || 'null');
      return saved?.meta || {};
    } catch { return {}; }
  });
  const [resultData, setResultData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [showLogsErro, setShowLogsErro] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [noticeMsg, setNoticeMsg] = useState(null);

  // Pré-preenchimento ao vir de Zona Crítica
  const [prefilledSubject, setPrefilledSubject] = useState(null);

  useEffect(() => {
    if (quizState === 'running' && currentQuiz.length > 0) {
      try {
        localStorage.setItem('pmpe_sessao_ativa', JSON.stringify({ quiz: currentQuiz, modo: quizMode, meta: currentQuizMeta }));
      } catch { /* quota */ }
    } else {
      localStorage.removeItem('pmpe_sessao_ativa');
      localStorage.removeItem('pmpe_runner_estado');
    }
  }, [quizState, currentQuiz, quizMode, currentQuizMeta]);

  // Revisões do Caderno de Erros que já venceram (repetição espaçada)
  const [revisoesVencidas, setRevisoesVencidas] = useState([]);
  useEffect(() => {
    if (activeTab !== 'quiz' || quizState !== 'config') return;
    let ativo = true;
    fetchCadernoErros(true)
      .then((itens) => { if (ativo) setRevisoesVencidas(itens); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [activeTab, quizState]);

  // Carregamento inicial do SQLite
  const loadExamsFromDB = async () => {
    try {
      const data = await fetchProvas();
      setExams(data);
    } catch (err) {
      console.error('Falha ao conectar ao servidor SQLite:', err);
    }
  };

  useEffect(() => {
    async function init() {
      let key = getApiKey();
      
      // Se não estiver no localStorage, tenta buscar do banco SQLite!
      if (!key) {
        try {
          const dbKey = await getSavedApiKey();
          if (dbKey) {
            key = dbKey;
            saveApiKey(dbKey);
          }
        } catch (e) {
          console.warn('Erro ao ler chave do SQLite:', e);
        }
      }

      setApiKey(key);
      const savedModel = getSelectedModel();
      setModel(savedModel || DEFAULT_MODEL);
      setPreferences(getPreferences());

      loadExamsFromDB();
    }

    init();
  }, []);

  // Monta o simulado: questões REAIS vêm do banco de provas (gabarito oficial); só as INÉDITAS passam pela IA,
  // que as valida, deduplica e confere por resolução independente antes de entrarem no banco.
  const handleStartQuiz = async ({ disciplina, disciplinas, assunto, quantidade, modo }) => {
    setLoading(true);
    setAiStatus('');
    setShowLogsErro(false);
    setErrorMsg(null);
    setNoticeMsg(null);

    try {
      const listaDisciplinas = Array.isArray(disciplinas) && disciplinas.length > 0
        ? disciplinas
        : [disciplina || 'Geral'];

      const { reais, ineditas } = dividirProporcao(quantidade, preferences.proporcao);

      // 1. Reais direto do acervo oficial
      let reaisQ = [];
      if (reais > 0) {
        try {
          const r = await buscarNoBanco({ disciplinas: listaDisciplinas, tema: assunto, quantidade: reais, somenteReais: true });
          reaisQ = r.questoes || [];
        } catch (e) {
          console.warn('Falha ao buscar questões reais:', e);
        }
      }

      // Se faltarem reais no acervo, a diferença é completada com inéditas
      const faltamIneditas = ineditas + (reais - reaisQ.length);
      let ineditasQ = [];
      const avisos = [];

      if (faltamIneditas > 0) {
        if (!apiKey) {
          if (reaisQ.length === 0) {
            setActiveTab('settings');
            return;
          }
          avisos.push('Sem chave da API: o simulado usa só as questões reais disponíveis.');
        } else {
          const ctx = await fetchContextSnippets(
            listaDisciplinas,
            assunto,
            Math.max(6, Math.ceil(faltamIneditas / 2))
          );

          const { questoes: geradas, descartadas } = await generateQuestionsWithGemini({
            apiKey,
            model,
            disciplina,
            disciplinas: listaDisciplinas,
            assunto,
            quantidade: faltamIneditas,
            itensProvas: ctx.itens || [],
            snippetsProvas: ctx.snippets || '',
            baseLegal: ctx.baseLegal || '',
            basePorTopico: ctx.basePorTopico || {},
            trechos: ctx.trechos || [],
            trechosPorTopico: ctx.trechosPorTopico || {},
            evitarRepeticao: ctx.evitarRepeticao || '',
            topicosSugeridos: ctx.topicosSugeridos || {},
            preferences,
            onLog: (e) => setAiStatus(e.mensagem)
          });

          // Salva no banco as aprovadas e põe em quarentena as que divergiram na verificação independente
          try {
            const divergentes = descartadas.filter(d => d.tipo === 'DIVERGENTE').map(d => d.questao);
            const res = await salvarNoBanco([...geradas, ...divergentes]);
            const ids = res.ids || {};
            ineditasQ = geradas.map((q, i) => (ids[i] ? { ...q, bancoId: ids[i] } : q));
          } catch (e) {
            console.warn('Erro ao salvar no banco permanente:', e);
            ineditasQ = geradas;
          }

          if (descartadas.length > 0) {
            avisos.push(`${descartadas.length} questão(ões) gerada(s) foram descartadas na checagem de qualidade (estrutura, fora do tema, artigo de lei não conferido, duplicidade ou gabarito divergente).`);
          }
          if (geradas.length < faltamIneditas) {
            avisos.push(`Só ${geradas.length} de ${faltamIneditas} inéditas passaram na validação.`);
          }
        }
      }

      // Embaralha reais e inéditas e renumera
      const todas = [...reaisQ, ...ineditasQ];
      for (let i = todas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [todas[i], todas[j]] = [todas[j], todas[i]];
      }
      const questoes = todas.map((q, i) => ({ ...q, numero: i + 1 }));

      if (questoes.length === 0) {
        throw new Error('Nenhuma questão foi retornada.');
      }
      if (avisos.length > 0) setNoticeMsg(avisos.join(' '));

      setCurrentQuiz(questoes);
      setQuizMode(modo);
      setCurrentQuizMeta({ disciplina, assunto, quantidade: questoes.length, modo, isRetry: false });
      setQuizState('running');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao gerar questões com a IA. Verifique sua chave de API e conexão.');
    } finally {
      setLoading(false);
      setAiStatus('');
    }
  };

  // Iniciar Simulado a partir do Banco Local SQLite (100% Offline / Zero IA / Instantâneo 0s)
  const handleStartLocalQuiz = async ({ disciplinas, tema, quantidade, modo, somenteReais = false, somenteIneditas = false }) => {
    setLoading(true);
    setAiStatus('');
    setShowLogsErro(false);
    setErrorMsg(null);
    setNoticeMsg(null);

    try {
      const res = await buscarNoBanco({
        disciplinas,
        tema,
        quantidade,
        apenasIneditas: false,
        somenteReais,
        somenteIneditas
      });

      if (!res.questoes || res.questoes.length === 0) {
        throw new Error(res.aviso || 'Nenhuma questão cadastrada para os filtros selecionados no banco local.');
      }

      setNoticeMsg(res.aviso || null);
      setCurrentQuiz(res.questoes);
      setQuizMode(modo);
      setCurrentQuizMeta({ 
        disciplina: disciplinas.length === 1 ? disciplinas[0] : `${disciplinas.length} Matérias`, 
        assunto: tema || 'Acervo Local', 
        quantidade: res.questoes.length, 
        modo 
      });
      setQuizState('running');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao buscar questões no banco local.');
    } finally {
      setLoading(false);
      setAiStatus('');
    }
  };

  // Finalizar Simulado e Gravar Permanentemente no SQLite
  const handleFinishQuiz = async ({ quizData, userAnswers, timerSeconds, questionTimes = {}, doubtQuestions = {}, modo }) => {
    let acertos = 0;
    const tempoMedioFallback = quizData.length > 0 ? Math.round(timerSeconds / quizData.length) : 0;

    const questoesComResultado = quizData.map((q, idx) => {
      const acertou = userAnswers[idx] === q.gabarito;
      if (acertou) acertos++;
      return {
        ...q,
        respostaUsuario: userAnswers[idx],
        acertou,
        marcouDuvida: !!doubtQuestions[idx],
        tempoSegundos: questionTimes[idx] || tempoMedioFallback
      };
    });

    // Só grava novo simulado se não for apenas um re-treino imediato das erradas da mesma sessão
    if (!currentQuizMeta.isRetry) {
      const simuladoPayload = {
        disciplina: currentQuizMeta.disciplina || 'Geral',
        assunto: currentQuizMeta.assunto || 'Tópicos gerais',
        modo,
        total_questoes: quizData.length,
        acertos,
        erros: quizData.length - acertos,
        tempo_segundos: timerSeconds,
        questoes: questoesComResultado
      };

      try {
        await saveSimuladoResult(simuladoPayload);
      } catch (err) {
        console.error('Erro ao salvar no banco SQLite:', err);
      }
    }

    // Atualiza contadores no banco permanente de questões
    try {
      const resultadosBanco = questoesComResultado
        .filter(q => q.bancoId || q.provaRef)
        .map(q => ({ bancoId: q.bancoId, provaRef: q.provaRef, acertou: q.acertou }));
      if (resultadosBanco.length > 0) {
        await registrarResultadoBanco(resultadosBanco);
      }
    } catch (e) {
      console.warn('Erro ao atualizar estatísticas do banco_questoes:', e);
    }

    setResultData({
      quizData,
      userAnswers,
      timerSeconds,
      questionTimes,
      modo
    });
    setQuizState('result');
  };

  // Refazer apenas as erradas (marca isRetry: true para não poluir estatísticas com duplicatas)
  const handleRestartWrong = (wrongQuestions) => {
    setCurrentQuiz(wrongQuestions);
    setQuizMode('estudo');
    setCurrentQuizMeta(prev => ({ ...prev, isRetry: true }));
    setQuizState('running');
  };

  // Iniciar revisão ativa do Caderno de Erros diretamente no QuizRunner
  const handleStartCadernoQuiz = (cadernoItems) => {
    if (!cadernoItems || cadernoItems.length === 0) return;
    const formatted = cadernoItems.map((item, idx) => ({
      id: item.id,
      cadernoId: item.id,
      numero: idx + 1,
      disciplina: item.disciplina,
      assunto: item.assunto,
      dificuldade: 'Revisão Leitner (Caixa ' + item.caixa_leitner + ')',
      origem: 'REVISÃO',
      fonte: `Caixa Leitner ${item.caixa_leitner}`,
      enunciado: item.enunciado,
      alternativas: item.alternativas,
      gabarito: item.gabarito,
      explicacao: item.explicacao
    }));
    setCurrentQuiz(formatted);
    setQuizMode('estudo');
    setCurrentQuizMeta({ disciplina: 'Caderno de Erros', assunto: 'Repetição Espaçada Leitner', quantidade: formatted.length, modo: 'estudo', isRetry: true });
    setQuizState('running');
    setActiveTab('quiz');
  };

  // Redirecionamento tático a partir de Zona Crítica
  const handleStartTargetedQuiz = (disciplina, assunto) => {
    setPrefilledSubject({ disciplina, assunto });
    setQuizState('config');
    setActiveTab('quiz');
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Barra de Navegação */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasApiKey={!!apiKey}
        examCount={exams.length}
        model={model}
      />

      {/* Conteúdo Principal */}
      <main className={`flex-1 flex flex-col py-6 sm:py-8 pb-24 sm:pb-8`}>
        {/* Notificação de Erro Global */}
        {errorMsg && (
          <div className="max-w-4xl mx-auto mb-4 px-4 sm:px-6 w-full space-y-2">
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between gap-3">
              <span>{errorMsg}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowLogsErro(v => !v)}
                  className="px-2.5 py-1 text-xs bg-white/[0.08] rounded-lg hover:bg-white/[0.15] text-slate-200 cursor-pointer"
                >
                  {showLogsErro ? 'Ocultar logs' : 'Ver logs'}
                </button>
                <button
                  onClick={() => setErrorMsg(null)}
                  className="px-2.5 py-1 text-xs bg-rose-500/20 rounded-lg hover:bg-rose-500/30 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
            {showLogsErro && (
              <div className="p-3 rounded-xl bg-[#121929] border border-white/[0.08] text-xs font-mono space-y-1 max-h-56 overflow-y-auto">
                {getAiLogs().slice(0, 12).map((l, idx) => (
                  <div key={idx} className={l.nivel === 'error' ? 'text-rose-400' : l.nivel === 'warn' ? 'text-amber-300' : 'text-slate-300'}>
                    [{l.ts?.slice(11, 19)}] [{l.etapa}] {l.mensagem}
                    {l.usage ? ` (tokens: ${l.usage.entrada} in / ${l.usage.saida} out)` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && aiStatus && (
          <div className="max-w-2xl mx-auto mb-4 px-4 sm:px-6 w-full">
            <div className="px-3.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs font-mono truncate">
              {aiStatus}
            </div>
          </div>
        )}

        {noticeMsg && (
          <div className="max-w-4xl mx-auto mb-4 px-4 sm:px-6 w-full">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-center justify-between">
              <span>{noticeMsg}</span>
              <button
                onClick={() => setNoticeMsg(null)}
                className="px-2.5 py-1 text-xs bg-amber-500/20 rounded-lg hover:bg-amber-500/30 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Aba Quiz / Simulador */}
        {activeTab === 'quiz' && (
          <>
            {quizState === 'config' && (
              <PlanoEstudo refreshKey={resultData} />
            )}

            {quizState === 'config' && (
              <QuizConfig
                onStartQuiz={handleStartQuiz}
                onStartLocalQuiz={handleStartLocalQuiz}
                loading={loading}
                hasApiKey={!!apiKey}
                onOpenSettings={() => setActiveTab('settings')}
                prefilled={prefilledSubject}
                revisoesVencidas={revisoesVencidas.length}
                onRevisar={() => handleStartCadernoQuiz(revisoesVencidas)}
              />
            )}

            {quizState === 'running' && (
              <QuizRunner
                quizData={currentQuiz}
                modo={quizMode}
                preferences={preferences}
                onFinishQuiz={handleFinishQuiz}
                onCancelQuiz={() => setQuizState('config')}
              />
            )}

            {quizState === 'result' && resultData && (
              <QuizResult
                resultData={resultData}
                onRestartWrong={handleRestartWrong}
                onNewQuiz={() => setQuizState('config')}
              />
            )}
          </>
        )}

        {/* Aba Banco de Provas (SQLite) */}
        {activeTab === 'exams' && (
          <ExamManager
            exams={exams}
            onRefreshExams={loadExamsFromDB}
          />
        )}

        {activeTab === 'vade' && (
          <VadeMecum
            onTreinarAssunto={(disciplina, assunto) => {
              setPrefilledSubject({ disciplina, assunto });
              setActiveTab('quiz');
              setQuizState('config');
            }}
          />
        )}

        {/* Aba Desempenho & Repetição Espaçada (SQLite) */}
        {activeTab === 'history' && (
          <HistoryTab
            apiKey={apiKey}
            model={model}
            onStartTargetedQuiz={handleStartTargetedQuiz}
            onStartCadernoQuiz={handleStartCadernoQuiz}
          />
        )}

        {/* Aba Opções & Configurações */}
        {activeTab === 'settings' && (
          <SettingsTab
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            preferences={preferences}
            setPreferences={setPreferences}
          />
        )}
      </main>
    </div>
  );
}
