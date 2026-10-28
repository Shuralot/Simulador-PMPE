import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Clock, 
  Check, 
  X, 
  Lightbulb, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Bookmark
} from 'lucide-react';

export default function QuizRunner({ 
  quizData, 
  modo = 'estudo', 
  preferences = {},
  onFinishQuiz, 
  onCancelQuiz 
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [index]: 'A' | 'B' | ... }
  const [showDica, setShowDica] = useState({});
  const [showExplanation, setShowExplanation] = useState({});
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [questionTimes, setQuestionTimes] = useState({});
  const [eliminatedAlts, setEliminatedAlts] = useState({});
  const [doubtQuestions, setDoubtQuestions] = useState({});

  const total = Array.isArray(quizData) ? quizData.length : 0;
  const currentQ = total > 0 ? quizData[currentIndex] : null;
  const currentAnswer = userAnswers[currentIndex];
  const isAnswered = currentAnswer !== undefined;
  const isCorrect = currentQ && currentAnswer === currentQ.gabarito;
  const progressPercent = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

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

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
        if (modo === 'simulado' || !isAnswered) {
          handleSelectAnswer(key);
        }
      } else if (e.key === 'ArrowRight' && currentIndex < total - 1) {
        setCurrentIndex(i => i + 1);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(i => i - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isAnswered, modo, total]);

  const handleSelectAnswer = (letra) => {
    setUserAnswers(prev => ({
      ...prev,
      [currentIndex]: letra
    }));

    if (modo === 'estudo' && preferences.autoExpandirMotivo !== false) {
      setShowExplanation(prev => ({
        ...prev,
        [currentIndex]: true
      }));
    }
  };

  const toggleEliminateAlt = (e, letra) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `${currentIndex}-${letra}`;
    setEliminatedAlts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleFinish = () => {
    const answeredCount = Object.keys(userAnswers).length;
    if (answeredCount < total) {
      const confirmFinish = window.confirm(
        `Você respondeu ${answeredCount} de ${total} questões. Finalizar agora?`
      );
      if (!confirmFinish) return;
    }
    onFinishQuiz({
      quizData,
      userAnswers,
      timerSeconds,
      questionTimes,
      doubtQuestions,
      modo
    });
  };

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 w-full space-y-6">
      {/* Top Bar Minimalista e Ampla */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-3.5">
            <button
              onClick={onCancelQuiz}
              className="p-2 -ml-1 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Voltar ao início"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-200">
                Questão {currentIndex + 1} de {total}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-sm sm:text-base text-slate-300 font-medium truncate max-w-xs sm:max-w-md">
                {currentQ.disciplina}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm sm:text-base text-slate-300 font-mono bg-white/[0.03] px-3.5 py-1.5 rounded-xl border border-white/[0.06]">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>{formatTime(timerSeconds)}</span>
            </div>

            <button
              onClick={handleFinish}
              className="text-sm font-semibold text-slate-400 hover:text-white px-3.5 py-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Finalizar
            </button>
          </div>
        </div>

        {/* Barra de Progresso Visível */}
        <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Card da Questão com Espaçamento Amplo */}
      <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-6 sm:p-10 lg:p-12 shadow-2xl shadow-black/40">
        {/* Metadados Sutis */}
        <div className="flex items-center justify-between gap-3 mb-7 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <span className="font-semibold text-indigo-400">
              {currentQ.assunto || 'Tópico Geral'}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-medium">
              {currentQ.origem === 'REAL' ? (currentQ.fonte || 'Banca AOCP') : 'Inédita AOCP'}
            </span>
          </div>

          {/* Botão de Marcar Dúvida */}
          <button
            type="button"
            onClick={() => setDoubtQuestions(prev => ({ ...prev, [currentIndex]: !prev[currentIndex] }))}
            className={`text-xs sm:text-sm px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
              doubtQuestions[currentIndex]
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/[0.14]'
            }`}
            title="Marcar para revisar no Caderno de Erros"
          >
            <Bookmark className={`w-4 h-4 ${doubtQuestions[currentIndex] ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span className="font-semibold hidden sm:inline">
              {doubtQuestions[currentIndex] ? 'Marcada p/ Revisão' : 'Marcar Dúvida'}
            </span>
          </button>
        </div>

        {/* Texto-base de Apoio (se houver) */}
        {currentQ.textoBase && (
          <div className="mb-8 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-sm sm:text-base text-slate-300 leading-relaxed max-h-64 overflow-y-auto">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Texto de Apoio:
            </span>
            <div className="whitespace-pre-line">{currentQ.textoBase}</div>
          </div>
        )}

        {/* Enunciado com Tipografia Confortável para 1080p */}
        <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-slate-100 leading-relaxed sm:leading-loose mb-8 sm:mb-10 whitespace-pre-line">
          {currentQ.enunciado}
        </h2>

        {/* Dica opcional */}
        {preferences.mostrarDica !== false && currentQ.dica && (
          <div className="mb-8">
            <button
              type="button"
              onClick={() => setShowDica(prev => ({ ...prev, [currentIndex]: !prev[currentIndex] }))}
              className="text-sm font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Lightbulb className="w-4 h-4" />
              <span>{showDica[currentIndex] ? 'Ocultar dica' : 'Ver dica de estudo'}</span>
            </button>
            {showDica[currentIndex] && (
              <div className="mt-3 p-4 rounded-2xl bg-amber-500/[0.08] border border-amber-500/25 text-sm sm:text-base text-amber-200 leading-relaxed">
                {currentQ.dica}
              </div>
            )}
          </div>
        )}

        {/* Lista de Alternativas em Pills Ampliadas */}
        <div className="space-y-3.5 mb-10">
          {(Array.isArray(currentQ.alternativas) ? currentQ.alternativas : []).map((alt) => {
            const isSelected = currentAnswer === alt.letra;
            const isTargetCorrect = alt.letra === currentQ.gabarito;
            const isEliminated = !!eliminatedAlts[`${currentIndex}-${alt.letra}`];

            let cardClass = 'bg-white/[0.02] border-white/[0.08] text-slate-100 hover:border-white/[0.2] hover:bg-white/[0.05]';
            let circleClass = 'bg-white/[0.06] text-slate-300 border border-white/[0.1]';

            if (modo === 'estudo' && isAnswered) {
              if (isTargetCorrect) {
                cardClass = 'bg-emerald-500/15 border-emerald-500/60 text-emerald-100 shadow-md ring-1 ring-emerald-500/30';
                circleClass = 'bg-emerald-500 text-white font-bold';
              } else if (isSelected && !isTargetCorrect) {
                cardClass = 'bg-rose-500/15 border-rose-500/60 text-rose-100 shadow-md ring-1 ring-rose-500/30';
                circleClass = 'bg-rose-500 text-white font-bold';
              } else {
                cardClass = 'bg-white/[0.01] border-white/[0.04] text-slate-500 opacity-50';
                circleClass = 'bg-white/[0.03] text-slate-600 border border-white/[0.04]';
              }
            } else if (isSelected) {
              cardClass = 'bg-indigo-600/20 border-indigo-500 text-white shadow-md ring-1 ring-indigo-500/40';
              circleClass = 'bg-indigo-600 text-white font-bold';
            } else if (isEliminated) {
              cardClass = 'bg-white/[0.01] border-white/[0.03] text-slate-600 opacity-40';
              circleClass = 'bg-transparent text-slate-700 border border-white/[0.04]';
            }

            return (
              <div
                key={alt.letra}
                onClick={() => handleSelectAnswer(alt.letra)}
                onContextMenu={(e) => toggleEliminateAlt(e, alt.letra)}
                className={`w-full p-4 sm:p-5 rounded-2xl border text-left flex items-start gap-4 sm:gap-5 transition-all duration-150 cursor-pointer select-none ${cardClass}`}
              >
                {/* Badge Circular com a Letra Ampliada */}
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-base font-bold flex-shrink-0 transition-colors ${circleClass}`}>
                  {alt.letra}
                </div>

                {/* Texto da Alternativa */}
                <span className={`text-base sm:text-lg leading-relaxed flex-1 pt-0.5 ${isEliminated && !isSelected ? 'line-through' : ''}`}>
                  {alt.texto}
                </span>

                {/* Status Icon */}
                {modo === 'estudo' && isAnswered && isTargetCorrect && (
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-1" />
                )}
                {modo === 'estudo' && isAnswered && isSelected && !isTargetCorrect && (
                  <X className="w-5 h-5 text-rose-400 flex-shrink-0 mt-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Feedback Imediato em Modo Estudo */}
        {modo === 'estudo' && isAnswered && (
          <div className="mb-10 pt-6 border-t border-white/[0.08] animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className={`w-3 h-3 rounded-full ${isCorrect ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className={`text-sm sm:text-base font-bold ${isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {isCorrect ? 'Resposta Correta!' : `Incorreto • Gabarito Oficial: Letra (${currentQ.gabarito})`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowExplanation(prev => ({ ...prev, [currentIndex]: !prev[currentIndex] }))}
                className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer bg-white/[0.04] px-3 py-1.5 rounded-xl border border-white/[0.08]"
              >
                <span>{showExplanation[currentIndex] ? 'Ocultar explicação' : 'Ver fundamentação'}</span>
                {showExplanation[currentIndex] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {showExplanation[currentIndex] && (
              <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-4 text-sm sm:text-base text-slate-200 leading-relaxed">
                <div>
                  <span className="font-bold text-slate-100 block mb-1.5 text-xs sm:text-sm uppercase tracking-wider text-emerald-400">
                    Fundamentação da Banca:
                  </span>
                  <p>{currentQ.explicacao?.correta || 'Alternativa em conformidade com a legislação e os precedentes da banca AOCP.'}</p>
                </div>

                {currentQ.explicacao?.distratores && Object.keys(currentQ.explicacao.distratores).length > 0 && (
                  <div className="pt-3 border-t border-white/[0.06]">
                    <span className="font-bold text-rose-400 block mb-2 text-xs sm:text-sm uppercase tracking-wider">
                      Por que os outros distratores estão errados:
                    </span>
                    <div className="space-y-2 text-xs sm:text-sm text-slate-300">
                      {Object.entries(currentQ.explicacao.distratores)
                        .filter(([letra]) => letra.toUpperCase() !== String(currentQ.gabarito).toUpperCase())
                        .map(([letra, erro]) => (
                          <div key={letra} className="flex gap-2">
                            <span className="text-rose-400 font-bold flex-shrink-0">({letra}):</span>
                            <span>{erro}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rodapé de Navegação Ampliado */}
        <div className="flex items-center justify-between pt-6 border-t border-white/[0.08]">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm sm:text-base font-semibold text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Anterior</span>
          </button>

          {currentIndex < total - 1 ? (
            <button
              onClick={() => setCurrentIndex(i => Math.min(total - 1, i + 1))}
              className="flex items-center gap-2 px-7 sm:px-9 py-3.5 sm:py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm sm:text-base font-bold shadow-lg shadow-indigo-600/25 transition-all cursor-pointer active:scale-95"
            >
              <span>Próxima</span>
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm sm:text-base font-bold shadow-lg shadow-emerald-600/25 transition-all cursor-pointer active:scale-95"
            >
              <span>Finalizar Simulado</span>
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Atalhos discretos no rodapé */}
      <p className="text-center text-xs sm:text-sm text-slate-400 mt-5">
        Atalhos: use as teclas <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-slate-200 font-mono font-bold">A-E</kbd> para responder e as setas <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-slate-200 font-mono font-bold">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-slate-200 font-mono font-bold">→</kbd> para navegar.
      </p>
    </div>
  );
}
