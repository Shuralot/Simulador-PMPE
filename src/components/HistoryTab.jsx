import React, { useState, useEffect, useCallback } from 'react';
import VisaoGeral from './VisaoGeral';
import CadernoTab from './CadernoTab';
import TestesTab from './TestesTab';
import { fetchCadernoErros, revisarQuestaoCaderno, fetchPlano } from '../services/api';

const ABAS = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'erros', rotulo: 'Caderno de erros' },
  { id: 'testes', rotulo: 'Testes' }
];

// Desempenho: o que atacar, o que revisar e o que já pode sair do foco
export default function HistoryTab({ onStartTargetedQuiz, onStartCadernoQuiz }) {
  const [aba, setAba] = useState('geral');
  const [caderno, setCaderno] = useState([]);
  const [planoCaderno, setPlanoCaderno] = useState({ armadilhas: [], tiposArmadilha: [] });

  const carregarCaderno = useCallback(async () => {
    try {
      setCaderno(await fetchCadernoErros(false));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const carregarPlanoCaderno = useCallback(() => fetchPlano().then(setPlanoCaderno).catch(() => {}), []);

  useEffect(() => {
    carregarCaderno();
    carregarPlanoCaderno();
  }, [carregarCaderno, carregarPlanoCaderno]);

  const handleRevisar = async (cadernoId, acertou) => {
    try {
      await revisarQuestaoCaderno(cadernoId, acertou);
      await carregarCaderno();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full space-y-8">
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">Desempenho</h1>

      <div className="flex items-center gap-6 border-b border-white/[0.06]" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`pb-2 text-base border-b-2 transition-colors cursor-pointer ${
              aba === a.id ? 'border-indigo-400 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {a.rotulo}
            {a.id === 'erros' && caderno.length > 0 && <span className="ml-2 text-sm text-slate-400 font-normal">{caderno.length}</span>}
          </button>
        ))}
      </div>

      {aba === 'geral' && <VisaoGeral onTreinarTopico={onStartTargetedQuiz} onStartCadernoQuiz={onStartCadernoQuiz} />}
      {aba === 'erros' && (
        <CadernoTab
          caderno={caderno}
          planoCaderno={planoCaderno}
          onRevisar={handleRevisar}
          onStartCadernoQuiz={onStartCadernoQuiz}
          onNotasSalvas={carregarPlanoCaderno}
        />
      )}
      {aba === 'testes' && <TestesTab />}
    </div>
  );
}
