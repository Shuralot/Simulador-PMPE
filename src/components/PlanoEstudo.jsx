import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Flame, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchPlano, salvarPlano } from '../services/api';

export default function PlanoEstudo({ onEstudarTopico, refreshKey }) {
  const [plano, setPlano] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [dataProva, setDataProva] = useState('');
  const [meta, setMeta] = useState(20);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const p = await fetchPlano();
      setPlano(p);
      setDataProva(p.dataProva || '');
      setMeta(p.metaDiaria);
    } catch { /* o plano é opcional; sem servidor, o card simplesmente não aparece */ }
  }, []);

  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    try {
      await salvarPlano({ dataProva, metaDiaria: Number(meta) });
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  };

  if (!plano) return null;

  const { diasRestantes, respondidasHoje, metaDiaria, sequencia, cobertura } = plano;
  const pctMeta = Math.min(100, Math.round((respondidasHoje / metaDiaria) * 100));
  const pctCobertura = Math.round((cobertura.topicosEstudados / cobertura.totalTopicos) * 100);
  const textoDias = diasRestantes === null ? 'Defina a data da prova'
    : diasRestantes > 1 ? `${diasRestantes} dias para a prova`
    : diasRestantes === 1 ? 'A prova é amanhã'
    : diasRestantes === 0 ? 'A prova é hoje'
    : 'Prova já realizada';

  return (
    <div className="max-w-5xl mx-auto mb-4 px-4 sm:px-6 w-full">
      <div className="p-5 rounded-2xl bg-[#121929] border border-white/[0.08] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-slate-100 font-bold">
            <CalendarDays className="w-5 h-5 text-indigo-400" />
            <span>{textoDias}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span className="flex items-center gap-1.5"><Flame className="w-4 h-4 text-amber-400" />{sequencia} {sequencia === 1 ? 'dia seguido' : 'dias seguidos'}</span>
            <button type="button" onClick={() => setAberto(!aberto)} className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 cursor-pointer">
              {aberto ? 'Fechar' : 'Detalhes'} {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />Meta de hoje</span>
              <span className="font-mono">{respondidasHoje}/{metaDiaria}</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pctMeta}%` }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>Edital já tocado</span>
              <span className="font-mono">{cobertura.topicosEstudados}/{cobertura.totalTopicos} tópicos</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${pctCobertura}%` }} /></div>
          </div>
        </div>

        {aberto && (
          <div className="space-y-4 pt-3 border-t border-white/[0.06]">
            <form onSubmit={salvar} className="flex flex-wrap items-end gap-3 text-xs text-slate-300">
              <label className="flex flex-col gap-1">Data da prova
                <input type="date" value={dataProva} onChange={(e) => setDataProva(e.target.value)} className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-100" />
              </label>
              <label className="flex flex-col gap-1">Meta diária (questões)
                <input type="number" min="1" max="500" value={meta} onChange={(e) => setMeta(e.target.value)} className="w-28 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-100" />
              </label>
              <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer">Salvar</button>
              {erro && <span className="text-rose-400">{erro}</span>}
            </form>

            {cobertura.faltam.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Tópicos do edital que você ainda não praticou (clique para estudar):</p>
                <div className="flex flex-wrap gap-1.5">
                  {cobertura.faltam.map((t) => (
                    <button key={t.disciplina + t.topico} type="button" onClick={() => onEstudarTopico(t.disciplina, t.topico)}
                      className="px-2.5 py-1 rounded-lg text-xs text-slate-300 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.06] cursor-pointer">
                      {t.topico}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
