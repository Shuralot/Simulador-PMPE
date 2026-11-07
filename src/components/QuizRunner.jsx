import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  ChevronLeft,
  ChevronRight,
  Clock, 
  Check, 
  X, 
  Lightbulb, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Bookmark,
  Strikethrough,
  Highlighter,
  Eraser,
  RotateCcw,
  Scale
} from 'lucide-react';
import LegalReferencePanel from './LegalReferencePanel';
import FormattedQuestionText from './FormattedQuestionText';
import SeloConfianca from './SeloConfianca';

const HIGHLIGHT_PALETTE = [
  { id: 'yellow', name: 'Amarelo', bg: '#facc15' },
  { id: 'green', name: 'Verde', bg: '#4ade80' },
  { id: 'blue', name: 'Azul', bg: '#38bdf8' },
  { id: 'pink', name: 'Rosa', bg: '#f472b6' },
  { id: 'orange', name: 'Laranja', bg: '#fb923c' },
];

export default function QuizRunner({ 
  quizData, 
  modo = 'estudo', 
  preferences = {},
  onFinishQuiz, 
  onCancelQuiz 
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Respostas validadas / confirmadas
  const [userAnswers, setUserAnswers] = useState({}); // { [index]: 'A' | 'B' | ... }
  // Resposta selecionada provisoriamente (aguardando o botão Validar)
  const [pendingAnswers, setPendingAnswers] = useState({}); // { [index]: 'A' | 'B' | ... }
  
  const [showDica, setShowDica] = useState({});
  const [showLegalRef, setShowLegalRef] = useState({});
  const [expandedDistractors, setExpandedDistractors] = useState({}); // { [`${currentIndex}-${letra}`]: boolean }
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [questionTimes, setQuestionTimes] = useState({});
  const [eliminatedAlts, setEliminatedAlts] = useState({});
  const [doubtQuestions, setDoubtQuestions] = useState({});

  // Marca-Texto: armazena HTML destacado por questão e por zona
  const [highlights, setHighlights] = useState({});
  const [activeHighlighterColor, setActiveHighlighterColor] = useState(null);
  const [floatingMenu, setFloatingMenu] = useState(null); // { x, y, range, container, zoneKey }

  const questionCardRef = useRef(null);

  const total = Array.isArray(quizData) ? quizData.length : 0;
  const currentQ = total > 0 ? quizData[currentIndex] : null;

  // Uma questão só é considerada respondida quando for validada
  const currentAnswer = userAnswers[currentIndex];
  const isValidated = currentAnswer !== undefined;
  const isCorrect = currentQ && currentAnswer === currentQ.gabarito;
  const currentPending = pendingAnswers[currentIndex];
  const progressPercent = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  // Marcações salvas para a questão atual
  const currentQHighlights = highlights[currentIndex] || {};
  const hasAnyHighlights = Object.keys(currentQHighlights).length > 0;

  // Cronômetro
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerSeconds(s => s + 1);
      setQuestionTimes(prev => ({
        ...prev,
        [currentIndex]: (prev[currentIndex] || 0) + 1
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentIndex]);

  // Selecionar alternativa candidata (sem validar imediatamente)
  const handleSelectCandidateAnswer = (letra) => {
    if (isValidated) return;

    // Se a alternativa estava eliminada, desfaz a eliminação
    const elimKey = `${currentIndex}-${letra}`;
    if (eliminatedAlts[elimKey]) {
      setEliminatedAlts(prev => ({ ...prev, [elimKey]: false }));
    }

    setPendingAnswers(prev => ({
      ...prev,
      [currentIndex]: letra
    }));
  };

  // Validar a resposta selecionada
  const handleValidateAnswer = () => {
    const chosen = currentPending || userAnswers[currentIndex];
    if (!chosen || isValidated) return;

    setUserAnswers(prev => ({
      ...prev,
      [currentIndex]: chosen
    }));
  };

  // Os atalhos chamam sempre a versão mais recente dos handlers (evita fechar o simulado com tempos/respostas antigos)
  const handlersRef = useRef({});

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
        if (!isValidated) {
          handlersRef.current.select(key);
        }
      } else if (e.key === 'Enter') {
        if (!isValidated && (currentPending || userAnswers[currentIndex])) {
          handlersRef.current.validate();
        } else if (isValidated && currentIndex < total - 1) {
          setCurrentIndex(i => i + 1);
        } else if (isValidated && currentIndex === total - 1) {
          handlersRef.current.finish();
        }
      } else if (e.key === 'ArrowRight' && currentIndex < total - 1) {
        setCurrentIndex(i => i + 1);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(i => i - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isValidated, currentPending, userAnswers, total]);

  // Alternar eliminação (riscar / cortar) alternativa
  const toggleEliminateAlt = (e, letra) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `${currentIndex}-${letra}`;
    const willBeEliminated = !eliminatedAlts[key];

    setEliminatedAlts(prev => ({ ...prev, [key]: willBeEliminated }));

    // Se o usuário eliminou a alternativa selecionada como pendente, remove a seleção
    if (willBeEliminated && currentPending === letra) {
      setPendingAnswers(prev => {
        const copy = { ...prev };
        delete copy[currentIndex];
        return copy;
      });
    }
  };

  // Detecção de seleção de texto para Marca-Texto
  const handleTextSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setTimeout(() => {
        const activeSel = window.getSelection();
        if (!activeSel || activeSel.isCollapsed) {
          setFloatingMenu(null);
        }
      }, 150);
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText) {
      setFloatingMenu(null);
      return;
    }

    const anchorEl = sel.anchorNode?.nodeType === Node.ELEMENT_NODE 
      ? sel.anchorNode 
      : sel.anchorNode?.parentElement;
    const zoneContainer = anchorEl?.closest('[data-highlight-zone]');
    
    if (!zoneContainer) {
      setFloatingMenu(null);
      return;
    }

    const zoneKey = zoneContainer.getAttribute('data-highlight-zone');
    const range = sel.getRangeAt(0);

    // Se já houver uma cor pré-selecionada no topo, aplica diretamente
    if (activeHighlighterColor) {
      applyHighlightToRange(range, zoneContainer, zoneKey, activeHighlighterColor);
      return;
    }

    // POSICIONA O MENU FLUTUANTE ABAIXO DA SELEÇÃO (rect.bottom + 10)
    // Isso evita completamente a colisão com o popup nativo do navegador Opera que fica no topo
    const rect = range.getBoundingClientRect();
    setFloatingMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10,
      range: range.cloneRange(),
      container: zoneContainer,
      zoneKey
    });
  };

  // Aplica o marca-texto de forma segura sem quebrar o layout
  const applyHighlightToRange = (range, container, zoneKey, colorId) => {
    if (!range || !container) return;

    const mark = document.createElement('mark');
    mark.className = `hl-mark hl-${colorId}`;
    mark.setAttribute('data-hl', colorId);

    try {
      range.surroundContents(mark);
    } catch {
      const fragment = range.extractContents();
      if (fragment.querySelectorAll) {
        fragment.querySelectorAll('mark.hl-mark, mark[data-hl]').forEach(m => {
          m.replaceWith(...m.childNodes);
        });
      }
      mark.appendChild(fragment);
      range.insertNode(mark);
    }

    // Atualiza o HTML armazenado para esta zona
    setHighlights(prev => ({
      ...prev,
      [currentIndex]: {
        ...(prev[currentIndex] || {}),
        [zoneKey]: container.innerHTML
      }
    }));

    window.getSelection()?.removeAllRanges();
    setFloatingMenu(null);
  };

  // Remove marcações de texto dentro da seleção
  const removeHighlightFromSelection = () => {
    if (!floatingMenu?.range || !floatingMenu?.container) return;
    const { range, container, zoneKey } = floatingMenu;

    const marks = container.querySelectorAll('mark.hl-mark, mark[data-hl]');
    marks.forEach(mark => {
      if (range.intersectsNode(mark)) {
        mark.replaceWith(...mark.childNodes);
      }
    });
    container.normalize();

    setHighlights(prev => ({
      ...prev,
      [currentIndex]: {
        ...(prev[currentIndex] || {}),
        [zoneKey]: container.innerHTML
      }
    }));

    window.getSelection()?.removeAllRanges();
    setFloatingMenu(null);
  };

  // Limpa todos os marca-textos da questão atual
  const clearCurrentQuestionHighlights = () => {
    setHighlights(prev => {
      const copy = { ...prev };
      delete copy[currentIndex];
      return copy;
    });
    setFloatingMenu(null);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleFinish = function handleFinish() {
    const finalAnswers = { ...userAnswers };
    if (currentPending && !finalAnswers[currentIndex]) {
      finalAnswers[currentIndex] = currentPending;
    }

    const answeredCount = Object.keys(finalAnswers).length;
    if (answeredCount < total) {
      const confirmFinish = window.confirm(
        `Você respondeu ${answeredCount} de ${total} questões. Finalizar agora?`
      );
      if (!confirmFinish) return;
    }
    onFinishQuiz({
      quizData,
      userAnswers: finalAnswers,
      timerSeconds,
      questionTimes,
      doubtQuestions,
      modo
    });
  };

  useEffect(() => {
    handlersRef.current = { select: handleSelectCandidateAnswer, validate: handleValidateAnswer, finish: handleFinish };
  });

  if (!currentQ || total === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-10">
          <p className="text-slate-300 text-base mb-6">Nenhuma questão encontrada.</p>
          <button
            onClick={onCancelQuiz}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold cursor-pointer"
          >
            Voltar à Configuração
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full space-y-6 relative">
      {/* Top Bar Minimalista com Navegação Integrada na Barra de Progresso */}
      <div className="mb-6 sm:mb-8 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onCancelQuiz}
              className="p-2 -ml-1 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Voltar ao início"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-slate-200 min-w-0">
              <span className="whitespace-nowrap">Questão {currentIndex + 1} de {total}</span>
              <span className="hidden sm:inline text-slate-600">•</span>
              <span className="hidden sm:inline text-slate-400 font-normal truncate max-w-xs sm:max-w-md">
                {currentQ.disciplina}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-300 font-mono bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/[0.06]">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>{formatTime(timerSeconds)}</span>
            </div>

            <button
              onClick={handleFinish}
              className="text-sm font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Finalizar
            </button>
          </div>
        </div>

        {/* Barra de Progresso Interativa com Botões Anterior/Próxima Embutidos */}
        <div className="flex items-center gap-2 sm:gap-3 pt-1">
          <button
            type="button"
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
            title="Questão anterior (ou seta ←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Navegador de Questões */}
          {total <= 25 ? (
            <div className="flex items-center gap-1.5 flex-1">
              {Array.from({ length: total }).map((_, idx) => {
                const isCurrent = idx === currentIndex;
                const isAns = userAnswers[idx] !== undefined;
                const isDoubt = doubtQuestions[idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-2 flex-1 rounded-full transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-indigo-400 ring-2 ring-indigo-400/60 scale-y-125'
                        : isDoubt
                        ? 'bg-amber-400/90'
                        : isAns
                        ? 'bg-indigo-600/80 hover:bg-indigo-500'
                        : 'bg-white/[0.08] hover:bg-white/[0.2]'
                    }`}
                    title={`Questão ${idx + 1}${isAns ? ' (Respondida)' : ''}${isDoubt ? ' (Marcada)' : ''}`}
                  />
                );
              })}
            </div>
          ) : (
            <div 
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const targetIdx = Math.min(total - 1, Math.max(0, Math.floor((clickX / rect.width) * total)));
                setCurrentIndex(targetIdx);
              }}
              className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden flex cursor-pointer relative"
              title={`Questão ${currentIndex + 1} de ${total} (clique para navegar)`}
            >
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setCurrentIndex(i => Math.min(total - 1, i + 1))}
            disabled={currentIndex === total - 1}
            className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
            title="Próxima questão (ou seta →)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Card Principal da Questão */}
      <div 
        ref={questionCardRef}
        onMouseUp={handleTextSelection}
        onTouchEnd={handleTextSelection}
        className="bg-[#121929] border border-white/[0.08] rounded-2xl sm:rounded-3xl p-4 sm:p-10 lg:p-12 shadow-2xl shadow-black/40 relative"
      >
        {/* Metadados e Ferramentas Discretas */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-400 min-w-0">
            <span className="font-medium text-indigo-400">
              {currentQ.assunto || 'Tópico Geral'}
            </span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span>
              {currentQ.origem === 'REAL' ? (currentQ.fonte || 'Banca AOCP') : 'Inédita AOCP'}
            </span>
            <SeloConfianca questao={currentQ} />
          </div>

          <div className="flex items-center gap-2">
            {/* Marca-Texto: seletor minimalista */}
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.06] px-2.5 py-1 rounded-xl">
              <Highlighter className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
              <div className="flex items-center gap-1">
                {HIGHLIGHT_PALETTE.map(c => {
                  const isActive = activeHighlighterColor === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveHighlighterColor(isActive ? null : c.id)}
                      className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                        isActive ? 'scale-125 ring-2 ring-white/90' : 'opacity-60 hover:opacity-100 hover:scale-115'
                      }`}
                      style={{ backgroundColor: c.bg }}
                      title={`Marca-texto ${c.name} ${isActive ? '(ativo)' : ''}`}
                    />
                  );
                })}
              </div>

              {hasAnyHighlights && (
                <button
                  type="button"
                  onClick={clearCurrentQuestionHighlights}
                  className="ml-1 p-0.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Limpar marcações da questão"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Marcar Dúvida */}
            <button
              type="button"
              onClick={() => setDoubtQuestions(prev => ({ ...prev, [currentIndex]: !prev[currentIndex] }))}
              className={`text-xs px-2.5 py-1 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                doubtQuestions[currentIndex]
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/[0.14]'
              }`}
              title="Marcar para revisar no Caderno de Erros"
            >
              <Bookmark className={`w-3.5 h-3.5 ${doubtQuestions[currentIndex] ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span className="hidden sm:inline">
                {doubtQuestions[currentIndex] ? 'Revisar' : 'Dúvida'}
              </span>
            </button>
          </div>
        </div>

        {/* Texto de Apoio Minimalista */}
        {currentQ.textoBase && (
          <div className="mb-7 rounded-2xl bg-white/[0.015] border-l-2 border-indigo-400/50 p-4 sm:p-5 text-sm sm:text-base text-slate-300 leading-relaxed">
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400/80 mb-2 select-none">
              Texto de Apoio
            </div>
            {currentQHighlights.textoBase ? (
              <div 
                data-highlight-zone="textoBase"
                className="whitespace-pre-line select-text"
                dangerouslySetInnerHTML={{ __html: currentQHighlights.textoBase }}
              />
            ) : (
              <div 
                data-highlight-zone="textoBase"
                className="whitespace-pre-line select-text"
              >
                {currentQ.textoBase}
              </div>
            )}
          </div>
        )}

        {/* Enunciado Formatado: integrado e minimalista */}
        {currentQHighlights.enunciado ? (
          <div 
            data-highlight-zone="enunciado"
            className="select-text mb-7 text-base sm:text-lg lg:text-xl text-slate-100 leading-relaxed sm:leading-loose"
            dangerouslySetInnerHTML={{ __html: currentQHighlights.enunciado }}
          />
        ) : (
          <div data-highlight-zone="enunciado" className="select-text mb-7">
            <FormattedQuestionText text={currentQ.enunciado} />
          </div>
        )}

        {/* Dica de Estudo (opcional) */}
        {preferences.mostrarDica !== false && currentQ.dica && (
          <div className="mb-7">
            <button
              type="button"
              onClick={() => setShowDica(prev => ({ ...prev, [currentIndex]: !prev[currentIndex] }))}
              className="text-xs sm:text-sm font-medium text-amber-400/90 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Lightbulb className="w-4 h-4" />
              <span>{showDica[currentIndex] ? 'Ocultar dica' : 'Ver dica de estudo'}</span>
            </button>
            {showDica[currentIndex] && (
              <div className="mt-2.5 p-3.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 text-xs sm:text-sm text-amber-200 leading-relaxed">
                {currentQ.dica}
              </div>
            )}
          </div>
        )}

        {/* Lista de Alternativas com Balões Flutuantes Externos (Esquerda e Direita fora da caixa central) */}
        <div className="space-y-4 mb-8">
          {(Array.isArray(currentQ.alternativas) ? currentQ.alternativas : []).map((alt, altIndex) => {
            const isEliminated = !!eliminatedAlts[`${currentIndex}-${alt.letra}`];
            const isPendingSelected = currentPending === alt.letra;
            const isTargetCorrect = alt.letra === currentQ.gabarito;
            const isAnswerSelected = currentAnswer === alt.letra;

            let cardClass = 'bg-white/[0.02] border-white/[0.07] text-slate-200 hover:border-white/[0.18] hover:bg-white/[0.04]';
            let circleClass = 'bg-white/[0.05] text-slate-300 border border-white/[0.08]';

            if (isValidated) {
              if (modo === 'estudo') {
                if (isTargetCorrect) {
                  cardClass = 'bg-emerald-500/15 border-emerald-500/60 text-emerald-100 shadow-sm';
                  circleClass = 'bg-emerald-500 text-white font-bold';
                } else if (isAnswerSelected && !isTargetCorrect) {
                  cardClass = 'bg-rose-500/15 border-rose-500/60 text-rose-100 shadow-sm';
                  circleClass = 'bg-rose-500 text-white font-bold';
                } else {
                  cardClass = 'bg-white/[0.01] border-white/[0.04] text-slate-500 opacity-40';
                  circleClass = 'bg-white/[0.02] text-slate-600 border border-white/[0.04]';
                }
              } else {
                if (isAnswerSelected) {
                  cardClass = 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm';
                  circleClass = 'bg-indigo-600 text-white font-bold';
                } else {
                  cardClass = 'bg-white/[0.01] border-white/[0.04] text-slate-500 opacity-50';
                  circleClass = 'bg-white/[0.02] text-slate-600 border border-white/[0.04]';
                }
              }
            } else if (isPendingSelected) {
              cardClass = 'bg-indigo-600/20 border-indigo-500/90 text-white shadow-sm ring-1 ring-indigo-500/50';
              circleClass = 'bg-indigo-600 text-white font-bold';
            } else if (isEliminated) {
              cardClass = 'bg-white/[0.008] border-white/[0.03] text-slate-600 opacity-40';
              circleClass = 'bg-transparent text-slate-700 border border-white/[0.04] line-through';
            }

            const altZoneKey = `alt-${alt.letra}`;
            const altHighlightedHtml = currentQHighlights[altZoneKey];

            // Alterna os balões entre o lado esquerdo e direito fora da caixa central
            // A = Esquerda, B = Direita, C = Esquerda, D = Direita, E = Esquerda
            const isLeft = altIndex % 2 === 0;

            const isUserWrongChoice = isValidated && modo === 'estudo' && isAnswerSelected && !isTargetCorrect;
            const distractorReason = currentQ.explicacao?.distratores?.[alt.letra] ||
              currentQ.explicacao?.distratores?.[alt.letra.toLowerCase()] ||
              currentQ.explicacao?.distratores?.[alt.letra.toUpperCase()];
            const gabaritoReason = currentQ.explicacao?.correta || currentQ.explicacao?.por_que_correta;

            // Classes de posicionamento lateral fora da caixa central
            const desktopSideClasses = isLeft
              ? 'xl:absolute xl:right-[calc(100%+60px)] xl:top-1/2 xl:-translate-y-1/2 xl:w-80 2xl:w-96 text-left z-30'
              : 'xl:absolute xl:left-[calc(100%+60px)] xl:top-1/2 xl:-translate-y-1/2 xl:w-80 2xl:w-96 text-left z-30';

            return (
              <div key={alt.letra} className="relative">
                {/* Card da Alternativa */}
                <div
                  onClick={() => {
                    const sel = window.getSelection();
                    if (sel && sel.toString().trim().length > 0) return;
                    handleSelectCandidateAnswer(alt.letra);
                  }}
                  onContextMenu={(e) => toggleEliminateAlt(e, alt.letra)}
                  className={`w-full p-4 sm:p-4.5 rounded-2xl border text-left flex items-start gap-3.5 transition-all duration-150 cursor-pointer ${cardClass}`}
                >
                  {/* Badge da Letra */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${circleClass}`}>
                    {alt.letra}
                  </div>

                  {/* Texto da Alternativa */}
                  {altHighlightedHtml ? (
                    <div 
                      data-highlight-zone={altZoneKey}
                      className={`text-base sm:text-lg leading-relaxed flex-1 pt-0.5 select-text ${
                        isEliminated && !isPendingSelected ? 'line-through text-slate-500' : ''
                      }`}
                      dangerouslySetInnerHTML={{ __html: altHighlightedHtml }}
                    />
                  ) : (
                    <div 
                      data-highlight-zone={altZoneKey}
                      className={`text-base sm:text-lg leading-relaxed flex-1 pt-0.5 select-text ${
                        isEliminated && !isPendingSelected ? 'line-through text-slate-500' : ''
                      }`}
                    >
                      {alt.texto}
                    </div>
                  )}

                  {/* Ações: Eliminar (Riscar) + Ícones de Status */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    {!isValidated && (
                      <button
                        type="button"
                        onClick={(e) => toggleEliminateAlt(e, alt.letra)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isEliminated
                            ? 'text-rose-400 bg-rose-500/15'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] opacity-40 hover:opacity-100'
                        }`}
                        title={isEliminated ? 'Restaurar alternativa' : 'Eliminar alternativa'}
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isValidated && modo === 'estudo' && isTargetCorrect && (
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    )}
                    {isValidated && modo === 'estudo' && isAnswerSelected && !isTargetCorrect && (
                      <X className="w-5 h-5 text-rose-400 flex-shrink-0" />
                    )}
                  </div>
                </div>

                {/* BALÃO FLUTUANTE EXTERNO (FORA DA CAIXA CENTRAL) PARA CADA ALTERNATIVA */}
                {isValidated && modo === 'estudo' && (
                  isTargetCorrect ? (
                    /* BALÃO DO GABARITO OFICIAL */
                    <div className={`deadlock-balloon ${desktopSideClasses} mt-2 xl:mt-0 p-3.5 sm:p-4 rounded-2xl bg-[#081f15]/95 border border-emerald-500/60 shadow-2xl shadow-emerald-950/60 text-emerald-100 text-xs sm:text-sm`}>
                      {/* Tail para Desktop (aponta lateralmente para a alternativa) */}
                      {isLeft ? (
                        <div className="hidden xl:block absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rotate-45 bg-[#081f15] border-t border-r border-emerald-500/60" />
                      ) : (
                        <div className="hidden xl:block absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rotate-45 bg-[#081f15] border-b border-l border-emerald-500/60" />
                      )}
                      {/* Tail para telas menores (aponta para cima) */}
                      <div className="xl:hidden absolute -top-1.5 left-6 w-3 h-3 rotate-45 bg-[#081f15] border-t border-l border-emerald-500/60" />

                      <div className="flex items-start gap-2.5 relative z-10">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          ✓
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="font-bold text-emerald-300 uppercase tracking-wider text-[11px]">
                            Gabarito Oficial ({alt.letra})
                          </div>
                          <p className="leading-relaxed text-emerald-100/95 text-xs sm:text-sm">
                            {gabaritoReason || 'Alternativa correta em conformidade com o edital e a legislação.'}
                          </p>

                          {/* Botão de Base Legal */}
                          <div className="pt-1.5">
                            <button
                              type="button"
                              onClick={() => setShowLegalRef(prev => ({ ...prev, [currentIndex]: !prev[currentIndex] }))}
                              className="text-[11px] font-semibold text-emerald-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 rounded-lg border border-emerald-500/30"
                            >
                              <Scale className="w-3.5 h-3.5" />
                              <span>{showLegalRef[currentIndex] ? 'Ocultar Lei' : 'Consultar Letra da Lei'}</span>
                              {showLegalRef[currentIndex] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {showLegalRef[currentIndex] && (
                              <div className="mt-2 text-slate-200">
                                <LegalReferencePanel question={currentQ} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* BALÃO DE DISTRATOR (EXPLICAÇÃO DO ERRO DE CADA ALTERNATIVA) */
                    <div className={`deadlock-balloon ${desktopSideClasses} mt-2 xl:mt-0 p-3.5 rounded-2xl ${
                      isUserWrongChoice
                        ? 'bg-[#250a13]/95 border border-rose-500/70 shadow-2xl shadow-rose-950/60 text-rose-100 ring-1 ring-rose-500/40'
                        : 'bg-[#181122]/95 border border-white/[0.12] hover:border-white/[0.25] shadow-xl shadow-black/60 text-slate-200'
                    }`}>
                      {/* Tail para Desktop */}
                      {isLeft ? (
                        <div className={`hidden xl:block absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rotate-45 ${
                          isUserWrongChoice ? 'bg-[#250a13] border-t border-r border-rose-500/70' : 'bg-[#181122] border-t border-r border-white/[0.15]'
                        }`} />
                      ) : (
                        <div className={`hidden xl:block absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rotate-45 ${
                          isUserWrongChoice ? 'bg-[#250a13] border-b border-l border-rose-500/70' : 'bg-[#181122] border-b border-l border-white/[0.15]'
                        }`} />
                      )}
                      {/* Tail para telas menores */}
                      <div className={`xl:hidden absolute -top-1.5 left-6 w-3 h-3 rotate-45 ${
                        isUserWrongChoice ? 'bg-[#250a13] border-t border-l border-rose-500/70' : 'bg-[#181122] border-t border-l border-white/[0.15]'
                      }`} />

                      <div className="flex items-start gap-2.5 relative z-10">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                          isUserWrongChoice ? 'bg-rose-500/20 text-rose-400' : 'bg-white/[0.08] text-slate-400'
                        }`}>
                          ✕
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <div className={`font-bold uppercase tracking-wider text-[11px] ${
                            isUserWrongChoice ? 'text-rose-300' : 'text-slate-400'
                          }`}>
                            {isUserWrongChoice ? `Sua Resposta (${alt.letra}) - Incorreta` : `Por que a (${alt.letra}) está incorreta`}
                          </div>
                          <p className="leading-relaxed text-xs sm:text-sm text-slate-300">
                            {distractorReason || 'Alternativa em desconformidade com a legislação ou o padrão cobrado pela banca.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Linha de Ação: Apenas o Botão de Validar ou Avançar (SEM TEXTO REDUNDANTE) */}
        <div className="flex justify-end pt-2">
          {!isValidated ? (
            <button
              type="button"
              disabled={!currentPending}
              onClick={handleValidateAnswer}
              className={`px-7 py-3 rounded-xl font-bold text-sm sm:text-base flex items-center gap-2 transition-all cursor-pointer ${
                currentPending
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/30 active:scale-95'
                  : 'bg-white/[0.04] text-slate-600 border border-white/[0.05] cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Validar Resposta {currentPending ? `(${currentPending})` : ''}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (currentIndex < total - 1) {
                  setCurrentIndex(i => i + 1);
                } else {
                  handleFinish();
                }
              }}
              className="px-7 py-3 rounded-xl font-bold text-sm sm:text-base bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
            >
              <span>{currentIndex < total - 1 ? 'Próxima Questão' : 'Finalizar Simulado'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Menu Flutuante de Marca-Texto Minimalista (Abaixo da seleção, sem colidir com Opera) */}
      {floatingMenu && (
        <div 
          className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 bg-[#162032]/95 border border-white/[0.12] rounded-full shadow-2xl backdrop-blur-md animate-in fade-in duration-100"
          style={{
            left: `${floatingMenu.x}px`,
            top: `${floatingMenu.y}px`,
            transform: 'translate(-50%, 0)' // Posicionado diretamente ABAIXO da seleção
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {HIGHLIGHT_PALETTE.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                applyHighlightToRange(floatingMenu.range, floatingMenu.container, floatingMenu.zoneKey, c.id);
              }}
              className="w-4.5 h-4.5 rounded-full hover:scale-125 transition-transform cursor-pointer"
              style={{ backgroundColor: c.bg }}
              title={`Marcar de ${c.name}`}
            />
          ))}

          <div className="w-px h-3.5 bg-white/15 mx-0.5" />

          {/* Remover Marcação */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              removeHighlightFromSelection();
            }}
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-white/[0.06] rounded-full transition-colors cursor-pointer"
            title="Remover marcação"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          {/* Fechar */}
          <button
            type="button"
            onClick={() => setFloatingMenu(null)}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] rounded-full transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Atalhos discretos */}
      <p className="hidden sm:block text-center text-xs text-slate-500 mt-4">
        Atalhos: <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 font-mono">A-E</kbd> selecionar • <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 font-mono">Enter</kbd> validar • <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 font-mono">←</kbd> <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 font-mono">→</kbd> navegar
      </p>
    </div>
  );
}
