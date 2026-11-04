import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { fetchPlano, salvarPlano } from '../services/api';

// Uma linha de status no topo; detalhes (data, meta, cobertura do edital) só quando abertos
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
    } catch { /* o plano é opcional; sem servidor, a linha simplesmente não aparece */ }
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
  const pctCobertura = Math.round((cobertura.topicosEstudados / cobertura.totalTopicos) * 100);
  const textoDias = diasRestantes === null ? 'Defina a data da prova'
    : diasRestantes > 1 ? `${diasRestantes} dias para a prova`
    : diasRestantes === 1 ? 'A prova é amanhã'
    : diasRestantes === 0 ? 'A prova é hoje'
    : 'Prova já realizada';
  const partes = [textoDias, `hoje ${respondidasHoje}/${metaDiaria}`];
  if (sequencia > 0) partes.push(`${sequencia} ${sequencia === 1 ? 'dia seguido' : 'dias seguidos'}`);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 w-full mb-2">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-3 text-sm text-slate-400 hover:text-slate-200 cursor-pointer py-2"
      >
        <span>{partes.join(' · ')}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="space-y-6 pt-3 pb-4 border-t border-white/[0.06]">
          <div className="grid sm:grid-cols-2 gap-5 text-sm text-slate-400">
            <div className="space-y-1.5">
              <div className="flex justify-between"><span>Meta de hoje</span><span className="font-mono text-slate-300">{respondidasHoje}/{metaDiaria}</span></div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full bg-indigo-400" style={{ width: `${Math.min(100, Math.round((respondidasHoje / metaDiaria) * 100))}%` }} /></div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between"><span>Edital praticado</span><span className="font-mono text-slate-300">{cobertura.topicosEstudados}/{cobertura.totalTopicos} tópicos</span></div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full bg-indigo-400" style={{ width: `${pctCobertura}%` }} /></div>
            </div>
          </div>

          <form onSubmit={salvar} className="flex flex-wrap items-end gap-3 text-sm text-slate-400">
            <label className="flex flex-col gap-1">Data da prova
              <input type="date" value={dataProva} onChange={(e) => setDataProva(e.target.value)} className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-100" />
            </label>
            <label className="flex flex-col gap-1">Meta diária
              <input type="number" min="1" max="500" value={meta} onChange={(e) => setMeta(e.target.value)} className="w-24 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-100" />
            </label>
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-slate-100 cursor-pointer">Salvar</button>
            {erro && <span className="text-rose-400">{erro}</span>}
          </form>

          {cobertura.faltam.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">Ainda não praticados (clique para estudar):</p>
              <div className="flex flex-wrap gap-1.5">
                {cobertura.faltam.map((t) => (
                  <button key={t.disciplina + t.topico} type="button" onClick={() => onEstudarTopico(t.disciplina, t.topico)}
                    className="px-2.5 py-1 rounded-full text-xs text-slate-300 bg-white/[0.04] hover:bg-white/[0.1] cursor-pointer">
                    {t.topico}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
