import React, { useState } from 'react';
import { seloConfianca } from '../../lib/confianca.mjs';
import { marcarQuestaoBanco } from '../services/api';

const COR = {
  oficial: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  revisada: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  conferida: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  ia: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  treino: 'bg-slate-500/10 text-slate-400 border-slate-500/30'
};

// Mostra o quanto dá para confiar no gabarito da questão (prova oficial, conferida na lei, verificada pela IA ou só treino).
export default function SeloConfianca({ questao }) {
  const selo = seloConfianca(questao);
  return (
    <span title={selo.ajuda} className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${COR[selo.nivel]}`}>
      {selo.rotulo}
    </span>
  );
}

// Para questões inéditas do banco: confirmar o gabarito ou marcá-lo como suspeito (some dos próximos sorteios).
export function BotoesGabarito({ questao }) {
  const [estado, setEstado] = useState(questao.revisada ? 'revisada' : '');
  const [erro, setErro] = useState('');
  if (!questao.bancoId || String(questao.origem).toUpperCase().includes('REAL')) return null;

  const marcar = async (acao) => {
    try {
      setErro('');
      await marcarQuestaoBanco(questao.bancoId, acao);
      setEstado(acao);
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      {estado === 'suspeita' ? (
        <span className="text-amber-300">Marcada como suspeita: não vai mais aparecer nos simulados.</span>
      ) : estado === 'revisada' ? (
        <span className="text-emerald-300">Gabarito confirmado por você.</span>
      ) : (
        <>
          <button type="button" onClick={() => marcar('revisada')} className="px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
            Gabarito conferido
          </button>
          <button type="button" onClick={() => marcar('suspeita')} className="px-2.5 py-1 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
            Gabarito suspeito
          </button>
        </>
      )}
      {erro && <span className="text-red-300">{erro}</span>}
    </div>
  );
}
