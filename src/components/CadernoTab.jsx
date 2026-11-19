import React, { useState, useMemo } from 'react';
import { NotasItem, ResumoArmadilhas, imprimirCaderno } from './CadernoExtras';
import LegalReferencePanel from './LegalReferencePanel';

// Caderno de erros: questões que você errou, na hora de rever (repetição espaçada em caixas de Leitner)
export default function CadernoTab({ caderno, planoCaderno, onRevisar, onStartCadernoQuiz, onNotasSalvas }) {
  const [reveladas, setReveladas] = useState({});
  const [notasAbertas, setNotasAbertas] = useState({});
  const [filtroDisc, setFiltroDisc] = useState('');
  const [filtroArmadilha, setFiltroArmadilha] = useState('');
  const [busca, setBusca] = useState('');
  const alternar = (setter, id) => setter((p) => ({ ...p, [id]: !p[id] }));

  const disciplinasDisponiveis = useMemo(
    () => [...new Set(caderno.map((q) => q.disciplina).filter(Boolean))],
    [caderno]
  );

  const filtradas = useMemo(() => {
    const qNorm = busca.trim().toLowerCase();
    return caderno.filter((q) => {
      if (filtroDisc && q.disciplina !== filtroDisc) return false;
      if (filtroArmadilha && q.tipo_armadilha !== filtroArmadilha) return false;
      if (qNorm && !`${q.enunciado} ${q.topico || ''} ${q.anotacao || ''}`.toLowerCase().includes(qNorm)) return false;
      return true;
    });
  }, [caderno, filtroDisc, filtroArmadilha, busca]);

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
          <button type="button" onClick={() => imprimirCaderno(filtradas)} className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-sm cursor-pointer">
            Imprimir / PDF
          </button>
          {onStartCadernoQuiz && filtradas.length > 0 && (
            <button type="button" onClick={() => onStartCadernoQuiz(filtradas.slice(0, 15))} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium cursor-pointer">
              Revisar {Math.min(15, filtradas.length)} agora
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por texto, tópico ou anotação..."
          className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/70 min-w-[220px] flex-1"
        />
        <select
          value={filtroDisc}
          onChange={(e) => setFiltroDisc(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 focus:outline-none"
        >
          <option value="">Todas as matérias</option>
          {disciplinasDisponiveis.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {planoCaderno.tiposArmadilha?.length > 0 && (
          <select
            value={filtroArmadilha}
            onChange={(e) => setFiltroArmadilha(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 focus:outline-none"
          >
            <option value="">Todas as armadilhas</option>
            {planoCaderno.tiposArmadilha.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <ResumoArmadilhas armadilhas={planoCaderno.armadilhas} />

      <ul className="divide-y divide-white/[0.06]">
        {filtradas.map((q) => {
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
