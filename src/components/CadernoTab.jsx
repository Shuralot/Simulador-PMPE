import React, { useState } from 'react';
import { NotasItem, ResumoArmadilhas, imprimirCaderno } from './CadernoExtras';
import LegalReferencePanel from './LegalReferencePanel';

// Caderno de erros: questões que você errou, na hora de rever (repetição espaçada em caixas de Leitner)
export default function CadernoTab({ caderno, planoCaderno, onRevisar, onStartCadernoQuiz, onNotasSalvas }) {
  const [reveladas, setReveladas] = useState({});
  const [notasAbertas, setNotasAbertas] = useState({});
  const alternar = (setter, id) => setter((p) => ({ ...p, [id]: !p[id] }));

  if (caderno.length === 0) {
    return <p className="py-12 text-slate-400">Nenhuma questão pendente no caderno de erros. Quando você errar uma questão, ela volta aqui para ser revista.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-xl">
          Ao acertar, a questão avança de caixa e volta mais tarde (1, 3, 7, 15 dias). Ao errar, volta para a caixa 1.
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => imprimirCaderno(caderno)} className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-sm cursor-pointer">
            Imprimir / PDF
          </button>
          {onStartCadernoQuiz && (
            <button type="button" onClick={() => onStartCadernoQuiz(caderno.slice(0, 15))} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium cursor-pointer">
              Revisar {Math.min(15, caderno.length)} agora
            </button>
          )}
        </div>
      </div>

      <ResumoArmadilhas armadilhas={planoCaderno.armadilhas} />

      <ul className="divide-y divide-white/[0.06]">
        {caderno.map((q) => {
          const revelada = reveladas[q.id];
          const notaAberta = notasAbertas[q.id] || q.anotacao || q.tipo_armadilha;
          return (
            <li key={q.id} className="py-6 space-y-4">
              <div className="text-sm text-slate-500">
                {q.disciplina}{q.topico ? ` · ${q.topico}` : ''} · caixa {q.caixa_leitner} · {q.total_acertos} acertos em {q.total_tentativas} tentativas
              </div>

              <p className="text-base text-slate-100 leading-relaxed">{q.enunciado}</p>

              {Array.isArray(q.alternativas) && q.alternativas.length > 0 && (
                <ul className="space-y-2">
                  {q.alternativas.map((a) => (
                    <li key={a.letra} className={`text-base leading-relaxed ${revelada && a.letra === q.gabarito ? 'text-emerald-400' : 'text-slate-300'}`}>
                      <strong className="font-semibold">{a.letra})</strong> {a.texto}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <button type="button" onClick={() => alternar(setReveladas, q.id)} className="text-sm text-indigo-300 hover:text-indigo-200 cursor-pointer">
                  {revelada ? 'Ocultar gabarito' : 'Ver gabarito'}
                </button>
                <button type="button" onClick={() => alternar(setNotasAbertas, q.id)} className="text-sm text-slate-400 hover:text-slate-200 cursor-pointer">
                  {q.anotacao || q.tipo_armadilha ? 'Minha anotação' : 'Anotar'}
                </button>
                <span className="flex items-center gap-2 ml-auto">
                  <button type="button" onClick={() => onRevisar(q.id, false)} className="px-4 py-2 rounded-lg bg-rose-500/15 text-rose-300 text-sm font-medium hover:bg-rose-500/25 cursor-pointer">
                    Errei
                  </button>
                  <button type="button" onClick={() => onRevisar(q.id, true)} className="px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 cursor-pointer">
                    Acertei
                  </button>
                </span>
              </div>

              {revelada && (
                <div className="space-y-2 text-base text-slate-200">
                  <div className="text-emerald-400 font-semibold">Gabarito: {q.gabarito}</div>
                  {q.explicacao?.correta && <p className="leading-relaxed">{q.explicacao.correta}</p>}
                  <LegalReferencePanel question={q} />
                </div>
              )}

              {notaAberta && <NotasItem item={q} tipos={planoCaderno.tiposArmadilha} onSalvo={onNotasSalvas} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
