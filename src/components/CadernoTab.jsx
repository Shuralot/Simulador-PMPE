import React, { useState } from 'react';
import { Brain, CheckCircle2 } from 'lucide-react';
import { NotasItem, ResumoArmadilhas, imprimirCaderno } from './CadernoExtras';
import LegalReferencePanel from './LegalReferencePanel';

// Sub-aba "Caderno de Erros" (Sistema Leitner) do painel de Desempenho
export default function CadernoTab({ caderno, planoCaderno, onRevisar, onStartCadernoQuiz, onNotasSalvas }) {
  const [revealedAnswers, setRevealedAnswers] = useState({});

  return (
    <div className="space-y-5">
      <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <Brain className="w-6 h-6 text-rose-400" />
            <span>Caderno de Erros (Sistema Leitner)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Repetição espaçada com base na Curva do Esquecimento. Ao acertar, a questão avança de caixa e se consolida.
          </p>
        </div>

        {caderno.length > 0 && (
          <button
            onClick={() => imprimirCaderno(caderno)}
            className="px-5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            Imprimir / PDF
          </button>
        )}

        {onStartCadernoQuiz && caderno.length > 0 && (
          <button
            onClick={() => onStartCadernoQuiz(caderno.slice(0, 15))}
            className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            Revisar no Simulado ({Math.min(15, caderno.length)})
          </button>
        )}
      </div>

      <ResumoArmadilhas armadilhas={planoCaderno.armadilhas} />

      {caderno.length === 0 ? (
        <div className="p-10 rounded-3xl bg-white/[0.03] text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-80" />
          <p className="text-sm text-slate-400">Nenhuma questão pendente no caderno de erros!</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {caderno.map((q) => {
            const isRevealed = revealedAnswers[q.id];
            return (
              <div key={q.id} className="p-6 rounded-2xl bg-white/[0.03] space-y-3.5">
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
                      onClick={() => onRevisar(q.id, false)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 text-xs sm:text-sm font-semibold cursor-pointer hover:bg-rose-500/25"
                    >
                      Errei
                    </button>
                    <button
                      onClick={() => onRevisar(q.id, true)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs sm:text-sm font-semibold cursor-pointer hover:bg-emerald-500/30"
                    >
                      Acertei
                    </button>
                  </div>
                </div>

                <NotasItem item={q} tipos={planoCaderno.tiposArmadilha} onSalvo={onNotasSalvas} />

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
  );
}
