import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BookOpen, Search, X, Trash2, Plus, ChevronDown } from 'lucide-react';
import FormattedLegalText from './FormattedLegalText';
import {
  fetchBaseStats,
  buscarBaseLegal,
  fetchFonteBase,
  ingerirBaseLegal,
  removerBaseLegal
} from '../services/api';

const DISCIPLINAS = [
  { id: '', label: 'Todas' },
  { id: 'Direito Constitucional', label: 'Constitucional' },
  { id: 'Direitos Humanos e Legislação Extravagante', label: 'Leis e Direitos Humanos' },
  { id: 'História de Pernambuco', label: 'História de PE' },
  { id: 'Informática', label: 'Informática' }
];

const ATALHOS = [
  { label: 'CF Art. 5º XI', q: 'Art. 5 XI domicílio', disc: 'Direito Constitucional' },
  { label: 'Estatuto PMPE', q: 'Art. 28 valor policial-militar', disc: 'Direitos Humanos e Legislação Extravagante' },
  { label: 'SV 11 · Algemas', q: 'Súmula Vinculante 11 algemas', disc: 'Direitos Humanos e Legislação Extravagante' },
  { label: 'Guararapes', q: 'Guararapes 1648 Tabocas', disc: 'História de Pernambuco' },
  { label: 'PROCV e Calc', q: 'PROCV SOMASES Calc', disc: 'Informática' }
];

const TAMANHO_PAGINA = 30;

function Dispositivo({ item, mostrarFonte }) {
  return (
    <article className="rounded-2xl bg-[#121929] border border-white/[0.06] p-5 sm:p-6 space-y-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {item.referencia && (
          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            {item.referencia}
          </span>
        )}
        {mostrarFonte && <span className="text-sm text-slate-300 font-medium">{item.fonte}</span>}
        {item.topico && <span className="text-xs text-slate-500 sm:ml-auto">{item.topico}</span>}
      </header>
      <FormattedLegalText text={item.texto} />
    </article>
  );
}

export default function VadeMecum() {
  const [stats, setStats] = useState([]);
  const [disciplina, setDisciplina] = useState('');
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState(null); // null = sem busca ativa
  const [termoBuscado, setTermoBuscado] = useState('');
  const [buscando, setBuscando] = useState(false);

  const [fonteAtiva, setFonteAtiva] = useState('');
  const [itens, setItens] = useState([]);
  const [totalFonte, setTotalFonte] = useState(0);
  const [carregando, setCarregando] = useState(false);

  const [novaAberta, setNovaAberta] = useState(false);
  const [novaFonte, setNovaFonte] = useState('');
  const [novaDisciplina, setNovaDisciplina] = useState('');
  const [novoTexto, setNovoTexto] = useState('');
  const [novaMsg, setNovaMsg] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregarStats = useCallback(async () => {
    setStats((await fetchBaseStats()) || []);
  }, []);

  useEffect(() => { carregarStats(); }, [carregarStats]);

  const fontes = useMemo(() => {
    const map = new Map();
    for (const r of stats) {
      const f = map.get(r.fonte) || { fonte: r.fonte, disciplina: r.disciplina || 'Outras', trechos: 0 };
      f.trechos += Number(r.trechos || 0);
      map.set(r.fonte, f);
    }
    return [...map.values()];
  }, [stats]);

  const totalDispositivos = useMemo(() => fontes.reduce((n, f) => n + f.trechos, 0), [fontes]);

  const fontesPorDisciplina = useMemo(() => {
    const grupos = new Map();
    for (const f of fontes) {
      if (disciplina && f.disciplina !== disciplina) continue;
      if (!grupos.has(f.disciplina)) grupos.set(f.disciplina, []);
      grupos.get(f.disciplina).push(f);
    }
    return [...grupos.entries()];
  }, [fontes, disciplina]);

  const buscar = async (termo = query, disc = disciplina) => {
    if (!termo.trim()) return;
    setBuscando(true);
    setFonteAtiva('');
    try {
      const res = await buscarBaseLegal({ q: termo.trim(), disciplina: disc, limite: 12 });
      setResultados(res);
      setTermoBuscado(termo.trim());
    } finally {
      setBuscando(false);
    }
  };

  const limparBusca = () => {
    setQuery('');
    setResultados(null);
    setTermoBuscado('');
  };

  const abrirFonte = async (fonte) => {
    setResultados(null);
    setFonteAtiva(fonte);
    setItens([]);
    setCarregando(true);
    try {
      const r = await fetchFonteBase(fonte, { offset: 0, limite: TAMANHO_PAGINA });
      setItens(r.itens);
      setTotalFonte(r.total);
    } finally {
      setCarregando(false);
    }
  };

  const carregarMais = async () => {
    setCarregando(true);
    try {
      const r = await fetchFonteBase(fonteAtiva, { offset: itens.length, limite: TAMANHO_PAGINA });
      setItens((atual) => [...atual, ...r.itens]);
    } finally {
      setCarregando(false);
    }
  };

  const remover = async (fonte) => {
    if (!window.confirm(`Remover todos os dispositivos de "${fonte}"?`)) return;
    try {
      await removerBaseLegal(fonte);
      if (fonte === fonteAtiva) { setFonteAtiva(''); setItens([]); }
      await carregarStats();
    } catch (err) {
      alert(err.message);
    }
  };

  const gravar = async () => {
    setSalvando(true);
    setNovaMsg(null);
    try {
      const r = await ingerirBaseLegal({ fonte: novaFonte, disciplina: novaDisciplina, texto: novoTexto });
      setNovaMsg({ ok: true, text: `${r.trechos} dispositivos gravados (por artigo/súmula).` });
      setNovoTexto('');
      await carregarStats();
    } catch (err) {
      setNovaMsg({ ok: false, text: err.message });
    } finally {
      setSalvando(false);
    }
  };

  const nomeDisciplina = (id) => DISCIPLINAS.find((d) => d.id === id)?.label || id;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 w-full space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 tracking-tight flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-emerald-400" />
          Vade Mecum
        </h1>
        <p className="text-sm text-slate-400">
          Legislação, súmulas e fichas do edital, offline. {totalDispositivos} dispositivos em {fontes.length} fontes.
        </p>
      </header>

      {/* Busca */}
      <div className="space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); buscar(); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Art. 5 XI, Lei 6783 art 28, Súmula 11, Revolução 1817..."
              className="w-full rounded-2xl bg-[#121929] border border-white/[0.08] pl-12 pr-10 py-3.5 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
            />
            {query && (
              <button type="button" onClick={limparBusca} aria-label="Limpar busca" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={buscando || !query.trim()}
            className="px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold cursor-pointer"
          >
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {DISCIPLINAS.map((d) => (
              <button
                key={d.id || 'todas'}
                type="button"
                onClick={() => { setDisciplina(d.id); if (resultados && query.trim()) buscar(query, d.id); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                  disciplina === d.id
                    ? 'bg-white/10 text-white border-white/20'
                    : 'text-slate-400 border-white/[0.06] hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Atalhos:</span>
            {ATALHOS.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => { setQuery(a.q); setDisciplina(a.disc); buscar(a.q, a.disc); }}
                className="text-slate-400 hover:text-emerald-300 underline-offset-4 hover:underline cursor-pointer"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-8 items-start">
        {/* Fontes */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fontes</h2>
          {fontesPorDisciplina.length === 0 && <p className="text-sm text-slate-500">Nenhuma fonte nesta disciplina.</p>}
          {fontesPorDisciplina.map(([disc, lista]) => (
            <div key={disc} className="space-y-1">
              <p className="text-xs text-slate-500 px-2 pb-1">{nomeDisciplina(disc)}</p>
              {lista.map((f) => (
                <div
                  key={f.fonte}
                  className={`group flex items-center gap-1 rounded-xl transition-colors ${
                    fonteAtiva === f.fonte ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => abrirFonte(f.fonte)}
                    className="flex-1 min-w-0 text-left px-2 py-1.5 cursor-pointer"
                  >
                    <span className={`block truncate text-sm ${fonteAtiva === f.fonte ? 'text-white font-medium' : 'text-slate-300'}`}>{f.fonte}</span>
                    <span className="text-[11px] text-slate-500">{f.trechos} dispositivos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remover(f.fonte)}
                    title={`Remover ${f.fonte}`}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </aside>

        {/* Conteúdo */}
        <section className="space-y-3 min-w-0">
          {resultados !== null && (
            <>
              <p className="text-sm text-slate-400">
                {resultados.length === 0
                  ? <>Nada encontrado para <strong className="text-slate-200">{termoBuscado}</strong>. Tente o número do artigo ou uma palavra-chave.</>
                  : <>{resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'} para <strong className="text-slate-200">{termoBuscado}</strong></>}
              </p>
              {resultados.map((r) => <Dispositivo key={r.id} item={r} mostrarFonte />)}
            </>
          )}

          {resultados === null && fonteAtiva && (
            <>
              <h2 className="text-lg font-semibold text-slate-100">{fonteAtiva}</h2>
              {itens.map((r) => <Dispositivo key={r.id} item={r} />)}
              {carregando && <p className="text-sm text-slate-500">Carregando...</p>}
              {!carregando && itens.length < totalFonte && (
                <button type="button" onClick={carregarMais} className="w-full py-3 rounded-2xl border border-white/[0.08] text-sm text-slate-300 hover:bg-white/[0.04] cursor-pointer">
                  Carregar mais ({itens.length} de {totalFonte})
                </button>
              )}
            </>
          )}

          {resultados === null && !fonteAtiva && (
            <div className="rounded-2xl border border-dashed border-white/[0.1] p-10 text-center space-y-1">
              <p className="text-slate-300">Busque um artigo ou escolha uma fonte ao lado para ler.</p>
              <p className="text-sm text-slate-500">Funciona sem internet.</p>
            </div>
          )}
        </section>
      </div>

      {/* Adicionar fonte */}
      <div className="pt-6 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => setNovaAberta(!novaAberta)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Adicionar lei ou resumo
          <ChevronDown className={`w-4 h-4 transition-transform ${novaAberta ? 'rotate-180' : ''}`} />
        </button>
        {novaAberta && (
          <div className="mt-4 space-y-3 max-w-2xl">
            <p className="text-xs text-slate-500">Cole o texto: ele é dividido e indexado por artigo ou súmula.</p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="Fonte (ex: Lei nº 13.869/2019)"
                value={novaFonte}
                onChange={(e) => setNovaFonte(e.target.value)}
                className="rounded-xl bg-[#121929] border border-white/[0.08] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/60"
              />
              <select
                value={novaDisciplina}
                onChange={(e) => setNovaDisciplina(e.target.value)}
                className="rounded-xl bg-[#121929] border border-white/[0.08] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/60"
              >
                <option value="">Todas as disciplinas</option>
                <option>Direito Constitucional</option>
                <option>Direitos Humanos e Legislação Extravagante</option>
                <option>Língua Portuguesa</option>
                <option>História de Pernambuco</option>
                <option>Raciocínio Lógico-Matemático</option>
                <option>Informática</option>
              </select>
            </div>
            <textarea
              value={novoTexto}
              onChange={(e) => setNovoTexto(e.target.value)}
              rows={4}
              placeholder="Cole aqui o texto dos artigos..."
              className="w-full rounded-xl bg-[#121929] border border-white/[0.08] px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500/60"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={gravar}
                disabled={salvando || !novaFonte.trim() || novoTexto.trim().length < 50}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white cursor-pointer"
              >
                {salvando ? 'Gravando...' : 'Gravar'}
              </button>
              {novaMsg && <span className={`text-xs ${novaMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{novaMsg.text}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
