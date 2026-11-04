import React, { useState } from 'react';
import { Scale, BookOpen, Search, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { buscarBaseLegal } from '../services/api';
import FormattedLegalText from './FormattedLegalText';

const DISCIPLINAS_COM_BASE = new Set([
  'Direito Constitucional',
  'Direitos Humanos e Legislação Extravagante',
  'História de Pernambuco',
  'Informática'
]);

function extrairQueryInicial(question) {
  const fonte = (question?.fonteLegal || question?.fonte_legal || '').trim();
  const comentario = (question?.explicacao?.correta || '').trim();
  const assunto = (question?.assunto || question?.topico || '').trim();
  const enunciado = (question?.enunciado || '').slice(0, 200).trim();

  // Captura menções explícitas a artigos ou súmulas na explicação ou fonte_legal
  const citacoes = [];
  if (fonte) citacoes.push(fonte);
  const arts = comentario.match(/\bart(?:igo)?\.?\s*\d+[º°]?/gi) || [];
  const sums = comentario.match(/\bs[uú]mula(?:\s+vinculante)?\s*(?:n[º°.]?\s*)?\d+/gi) || [];
  if (arts.length > 0) citacoes.push(arts.slice(0, 2).join(' '));
  if (sums.length > 0) citacoes.push(sums.slice(0, 2).join(' '));

  if (citacoes.length > 0) {
    return `${citacoes.join(' ')} ${assunto}`.trim();
  }
  return `${assunto} ${comentario.slice(0, 140) || enunciado}`.trim();
}

export default function LegalReferencePanel({ question }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [customQuery, setCustomQuery] = useState('');

  if (!question) return null;

  const disciplina = question.disciplina || '';
  const fonteCitada = (question.fonteLegal || question.fonte_legal || '').trim();
  const temBase = DISCIPLINAS_COM_BASE.has(disciplina) || Boolean(fonteCitada);

  if (!temBase) return null;

  const isJuridica = disciplina.includes('Direito');
  const buttonLabel = isJuridica ? 'Consultar Letra da Lei / Súmula' : 'Consultar Ficha Oficial do Edital';

  const carregar = async (qOverride = null) => {
    setLoading(true);
    try {
      const q = qOverride !== null ? qOverride : extrairQueryInicial(question);
      let res = await buscarBaseLegal({
        q,
        disciplina,
        limite: 3
      });
      if ((!res || res.length === 0) && qOverride === null) {
        res = await buscarBaseLegal({
          q: question.assunto || question.topico || '',
          disciplina,
          limite: 3
        });
      }
      setItems(res || []);
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loadedOnce) {
      carregar(null);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!customQuery.trim()) {
      carregar(null);
      return;
    }
    carregar(customQuery.trim());
  };

  return (
    <div className="pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-300 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
        >
          {isJuridica ? <Scale className="w-4 h-4 text-indigo-400" /> : <BookOpen className="w-4 h-4 text-indigo-400" />}
          <span>{open ? 'Ocultar Base Oficial' : buttonLabel}</span>
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {fonteCitada && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-mono">
            <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate max-w-xs sm:max-w-md">{fonteCitada}</span>
          </span>
        )}
      </div>

      {open && (
        <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-[#0d1322] border border-indigo-500/20 space-y-3.5 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-indigo-300">
                Acervo Soldado PMPE 2026
              </span>
              <span>•</span>
              <span>Consulta local instantânea (0 tokens)</span>
            </div>

            <form onSubmit={handleSearch} className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder={isJuridica ? 'Ex: Art. 5 XI, Súmula 11, Lei 6783...' : 'Pesquisar termo na matéria...'}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500/60 w-48 sm:w-56"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Buscar
              </button>
            </form>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400 py-3">Buscando dispositivos oficiais no SQLite...</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">
              Nenhum dispositivo exato localizado para este filtro. Use a busca acima para consultar qualquer artigo, súmula ou ficha desta disciplina.
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[#090d16] border border-white/[0.08] space-y-3 shadow-lg shadow-black/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-emerald-400">
                        {it.fonte}
                      </span>
                      {it.referencia && (
                        <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-300 border border-white/[0.08]">
                          {it.referencia}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {it.disciplina && (
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 text-[11px] font-medium">
                          {it.disciplina}
                        </span>
                      )}
                      {it.topico && (
                        <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-[11px] font-medium">
                          {it.topico}
                        </span>
                      )}
                    </div>
                  </div>
                  <FormattedLegalText text={it.texto} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
