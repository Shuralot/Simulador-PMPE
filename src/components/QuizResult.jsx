import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight,
  BookOpen
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function QuizResult({ 
  resultData, 
  onRestartWrong, 
  onNewQuiz 
}) {
  const { quizData, userAnswers, timerSeconds, questionTimes = {}, modo } = resultData;
  const [filter, setFilter] = useState('todas'); // 'todas' | 'erradas' | 'certas'
  const [expandedIndices, setExpandedIndices] = useState({});

  const total = quizData.length;
  let correctCount = 0;
  quizData.forEach((q, idx) => {
    if (userAnswers[idx] === q.gabarito) {
      correctCount++;
    }
  });

  const percent = Math.round((correctCount / total) * 100);
  const wrongCount = total - correctCount;

  useEffect(() => {
    if (percent >= 70) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [percent]);

  const toggleExpand = (idx) => {
    setExpandedIndices(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const filteredQuestions = quizData.map((q, idx) => ({ ...q, originalIndex: idx })).filter(item => {
    const isCorrect = userAnswers[item.originalIndex] === item.gabarito;
    if (filter === 'erradas') return !isCorrect;
    if (filter === 'certas') return isCorrect;
    return true;
  });

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 w-full space-y-6">
      {/* Placar Principal Minimalista e Generoso */}
      <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-8 sm:p-12 shadow-2xl shadow-black/40 text-center mb-10">
        <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center mb-5">
          <Trophy className="w-8 h-8" />
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 mb-2">
          {percent >= 80 ? 'Excelente Desempenho!' : percent >= 60 ? 'Bom Treino!' : 'Treino Finalizado'}
        </h1>
        <p className="text-sm sm:text-base text-slate-400 mb-8">
          Você completou {total} questões no padrão da Banca AOCP
        </p>

        {/* Pontuação em Destaque */}
        <div className="inline-block px-8 py-4 rounded-3xl bg-white/[0.03] border border-white/[0.08] mb-10 shadow-inner">
          <span className={`text-5xl sm:text-6xl font-black tracking-tight ${
            percent >= 70 ? 'text-emerald-400' : percent >= 50 ? 'text-indigo-400' : 'text-rose-400'
          }`}>
            {percent}%
          </span>
          <span className="text-sm sm:text-base text-slate-400 block mt-1 font-medium">Aproveitamento</span>
        </div>

        {/* Métricas Principais Ampliadas */}
        <div className="grid grid-cols-3 gap-3.5 max-w-lg mx-auto mb-10">
          <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-xs sm:text-sm text-slate-400 block mb-1 font-medium">Acertos</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400">{correctCount}</span>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-xs sm:text-sm text-slate-400 block mb-1 font-medium">Erros</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-400">{wrongCount}</span>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-xs sm:text-sm text-slate-400 block mb-1 font-medium">Tempo</span>
            <span className="text-xl sm:text-2xl font-extrabold text-slate-200 mt-0.5 block">{formatTime(timerSeconds)}</span>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {wrongCount > 0 && (
            <button
              onClick={() => {
                const wrongQuestions = quizData.filter((_, idx) => userAnswers[idx] !== quizData[idx].gabarito);
                onRestartWrong(wrongQuestions);
              }}
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-rose-300 font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Refazer Erradas ({wrongCount})</span>
            </button>
          )}

          <button
            onClick={onNewQuiz}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm sm:text-base transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2.5 cursor-pointer active:scale-95"
          >
            <span>Novo Simulado</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Seção de Revisão */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">
            Revisão das Questões
          </h2>

          {/* Filtros em Segmented Control */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs sm:text-sm">
            <button
              onClick={() => setFilter('todas')}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
                filter === 'todas' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas ({total})
            </button>
            <button
              onClick={() => setFilter('erradas')}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
                filter === 'erradas' ? 'bg-rose-500/20 text-rose-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Erradas ({wrongCount})
            </button>
            <button
              onClick={() => setFilter('certas')}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
                filter === 'certas' ? 'bg-emerald-500/20 text-emerald-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Certas ({correctCount})
            </button>
          </div>
        </div>

        {/* Lista de Questões com Accordion */}
        <div className="space-y-4">
          {filteredQuestions.map((q) => {
            const userAns = userAnswers[q.originalIndex];
            const isUserCorrect = userAns === q.gabarito;
            const isExpanded = expandedIndices[q.originalIndex];

            return (
              <div
                key={q.originalIndex}
                className="bg-[#121929] border border-white/[0.08] rounded-3xl p-5 sm:p-6 transition-all"
              >
                <div 
                  onClick={() => toggleExpand(q.originalIndex)}
                  className="flex items-start justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs sm:text-sm font-bold ${
                      isUserCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {q.originalIndex + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-400 mb-1.5">
                        <span className="font-semibold text-slate-200">{q.disciplina}</span>
                        <span>•</span>
                        <span className="truncate">{q.assunto}</span>
                      </div>
                      <p className="text-sm sm:text-base text-slate-200 line-clamp-2 leading-relaxed">
                        {q.enunciado}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className={`text-xs sm:text-sm font-semibold px-3 py-1 rounded-xl ${
                      isUserCorrect 
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}>
                      {isUserCorrect ? `Acertou (${userAns})` : `Errou (${userAns || '-'}) • Gab: ${q.gabarito}`}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Detalhes Expandidos */}
                {isExpanded && (
                  <div className="mt-5 pt-5 border-t border-white/[0.08] space-y-4 animate-in fade-in duration-150">
                    <div className="text-base sm:text-lg text-slate-100 leading-relaxed whitespace-pre-line font-medium">
                      {q.enunciado}
                    </div>

                    {/* Alternativas */}
                    <div className="space-y-2 pt-2">
                      {q.alternativas.map((alt) => {
                        const isCorrectOption = alt.letra === q.gabarito;
                        const isUserOption = alt.letra === userAns;

                        let pillClass = 'bg-white/[0.02] border-white/[0.06] text-slate-300';
                        if (isCorrectOption) {
                          pillClass = 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100 font-semibold';
                        } else if (isUserOption && !isCorrectOption) {
                          pillClass = 'bg-rose-500/15 border-rose-500/50 text-rose-100';
                        }

                        return (
                          <div
                            key={alt.letra}
                            className={`p-3.5 sm:p-4 rounded-2xl border text-sm sm:text-base flex items-start gap-3.5 ${pillClass}`}
                          >
                            <span className="font-bold flex-shrink-0">({alt.letra})</span>
                            <span className="leading-relaxed">{alt.texto}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Justificativa */}
                    {q.explicacao?.correta && (
                      <div className="mt-4 p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-sm sm:text-base text-slate-200">
                        <span className="font-bold text-slate-100 block mb-1.5 text-xs sm:text-sm uppercase tracking-wider text-emerald-400">
                          Comentário da Banca AOCP:
                        </span>
                        <p className="leading-relaxed">{q.explicacao.correta}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
