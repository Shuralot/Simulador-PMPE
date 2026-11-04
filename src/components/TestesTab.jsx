import React, { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { fetchSimulados, deleteSimulado, clearAllSimulados } from '../services/api';

const corTaxa = (t) => (t >= 75 ? 'text-emerald-400' : t < 60 ? 'text-rose-400' : 'text-slate-100');

// Histórico de testes; apagar um teste recalcula todas as estatísticas
export default function TestesTab() {
  const [simulados, setSimulados] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setSimulados((await fetchSimulados()) || []);
    } catch {
      setSimulados([]);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const apagar = async (id) => {
    if (!window.confirm(`Apagar o teste #${id}? As estatísticas serão recalculadas.`)) return;
    try {
      await deleteSimulado(id);
      await carregar();
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const limparTudo = async () => {
    if (!window.confirm('Apagar TODOS os testes? Isso reinicia suas estatísticas e não pode ser desfeito.')) return;
    try {
      await clearAllSimulados();
      await carregar();
    } catch (err) {
      alert('Erro ao limpar: ' + err.message);
    }
  };

  if (simulados === null) return <p className="text-slate-500">Carregando...</p>;
  if (simulados.length === 0) return <p className="py-12 text-slate-400">Nenhum teste salvo ainda.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">Apague testes feitos só para experimentar, para não distorcerem suas estatísticas.</p>
        <button type="button" onClick={limparTudo} className="shrink-0 text-sm text-slate-400 hover:text-rose-400 cursor-pointer">
          Apagar todos
        </button>
      </div>

      <ul className="divide-y divide-white/[0.06]">
        {simulados.map((sim) => {
          const taxa = Math.round(sim.taxa_acerto || 0);
          const minutos = Math.floor((sim.tempo_segundos || 0) / 60);
          return (
            <li key={sim.id} className="py-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-base text-slate-100 truncate">
                  {sim.disciplina}
                  {sim.assunto && sim.assunto !== 'Tópicos gerais' && <span className="text-slate-500"> — {sim.assunto}</span>}
                </div>
                <div className="text-sm text-slate-500">
                  #{sim.id} · {sim.modo === 'simulado' ? 'Prova' : 'Estudo'} · {sim.data_hora} · {minutos} min
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-lg font-semibold ${corTaxa(taxa)}`}>{taxa}%</div>
                <div className="text-sm text-slate-500">{sim.acertos} de {sim.total_questoes}</div>
              </div>
              <button type="button" onClick={() => apagar(sim.id)} aria-label={`Apagar teste ${sim.id}`} className="shrink-0 p-2 text-slate-500 hover:text-rose-400 cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
