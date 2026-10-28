import React, { useState, useEffect } from 'react';
import { Sparkles, Brain, Clock, Check, ArrowRight, Zap, Database } from 'lucide-react';
import { fetchContagemBanco } from '../services/api';

const CORE_DISCIPLINAS = [
  { id: 'Direito Constitucional', nome: 'Direito Constitucional', bloco: 'Bloco III', chips: ['Artigo 5º', 'Remédios Constitucionais', 'Segurança Pública (Art. 144)'] },
  { id: 'Direitos Humanos e Legislação Extravagante', nome: 'Direitos Humanos e Legislação', bloco: 'Bloco III', chips: ['Lei de Tortura', 'Abuso de Autoridade', 'Maria da Penha', 'Estatuto dos Militares'] },
  { id: 'Língua Portuguesa', nome: 'Língua Portuguesa', bloco: 'Bloco I', chips: ['Crase', 'Pontuação', 'Concordância Verbal', 'Conectivos'] },
  { id: 'História de Pernambuco', nome: 'História de Pernambuco', bloco: 'Bloco I', chips: ['Domínio Holandês', 'Revolução de 1817', 'Confederação do Equador', 'Guerra dos Mascates'] },
  { id: 'Raciocínio Lógico-Matemático', nome: 'Raciocínio Lógico-Matemático', bloco: 'Bloco II', chips: ['Negação Lógica', 'Equivalência Lógica', 'Probabilidade', 'Análise Combinatória'] },
  { id: 'Informática', nome: 'Informática', bloco: 'Bloco II', chips: ['Segurança da Informação', 'Windows 10', 'Excel', 'Redes de Computadores'] }
];

export default function QuizConfig({ 
  onStartQuiz, 
  onStartLocalQuiz, 
  loading, 
  hasApiKey, 
  onOpenSettings, 
  preferences = {}, 
  prefilled = null 
}) {
  const [selectedDisciplinas, setSelectedDisciplinas] = useState(CORE_DISCIPLINAS.map(d => d.id));
  const [assunto, setAssunto] = useState('');
  const [quantidade, setQuantidade] = useState(8);
  const [modo, setModo] = useState('estudo'); // 'estudo' | 'simulado'
  const [sourceMode, setSourceMode] = useState('local'); // 'local' | 'ai'
  const [contagemData, setContagemData] = useState(null);

  const activeChips = CORE_DISCIPLINAS
    .filter(d => selectedDisciplinas.includes(d.id))
    .flatMap(d => d.chips)
    .slice(0, 6);

  useEffect(() => {
    let isMounted = true;
    fetchContagemBanco({
      disciplinas: selectedDisciplinas,
      tema: assunto.trim(),
      chips: activeChips
    }).then(data => {
      if (isMounted && data) {
        setContagemData(data);
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [selectedDisciplinas, assunto]);

  useEffect(() => {
    if (prefilled) {
      if (prefilled.disciplina) setSelectedDisciplinas([prefilled.disciplina]);
      if (prefilled.assunto) setAssunto(prefilled.assunto);
    }
  }, [prefilled]);

  const toggleDisciplina = (id) => {
    if (selectedDisciplinas.includes(id)) {
      if (selectedDisciplinas.length > 1) {
        setSelectedDisciplinas(selectedDisciplinas.filter(d => d !== id));
      }
    } else {
      setSelectedDisciplinas([...selectedDisciplinas, id]);
    }
  };

  const setPreset = (tipo) => {
    if (tipo === 'todas') setSelectedDisciplinas(CORE_DISCIPLINAS.map(d => d.id));
    else if (tipo === 'bloco3') setSelectedDisciplinas(['Direito Constitucional', 'Direitos Humanos e Legislação Extravagante']);
    else if (tipo === 'bloco1') setSelectedDisciplinas(['Língua Portuguesa', 'História de Pernambuco']);
  };

  const isTemaDefinido = Boolean(assunto && assunto.trim());
  
  const totalLocalDisponivel = contagemData 
    ? (isTemaDefinido ? (contagemData.focoTemaTotal || 0) : ((contagemData.totalLocalGeral || 0) + (contagemData.totalProvasGeral || 0)))
    : 156;

  const handleStart = (e) => {
    e?.preventDefault();
    if (loading) return;

    if (sourceMode === 'local') {
      if (onStartLocalQuiz) {
        onStartLocalQuiz({
          disciplinas: selectedDisciplinas,
          tema: assunto.trim(),
          quantidade: Number(quantidade),
          modo
        });
      }
    } else {
      if (!hasApiKey) {
        onOpenSettings();
        return;
      }
      onStartQuiz({
        disciplina: selectedDisciplinas.join(', '),
        disciplinas: selectedDisciplinas,
        assunto: assunto.trim(),
        quantidade: Number(quantidade),
        modo
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full my-auto px-4 sm:px-6">
      <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/40">
        {/* Cabeçalho Compacto e Elegante */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-white/[0.07]">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
                Configurar Simulado
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/30">
                PMPE • AOCP
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Personalize matérias, quantidade e modo de resolução para seu treino
            </p>
          </div>

          {/* Badge de Questões Prontas */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-300 shadow-sm">
            <Database className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong className="text-emerald-400 font-bold">{totalLocalDisponivel} questões</strong> prontas no acervo
              {contagemData && !isTemaDefinido && (
                <span className="text-slate-400 font-normal ml-1">
                  ({contagemData.totalLocalGeral || 0} banco + {contagemData.totalProvasGeral || 0} provas)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Layout 2 Colunas Widescreen Centralizado */}
        <form onSubmit={handleStart} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* COLUNA ESQUERDA: Disciplinas e Tema (7 Colunas) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Disciplinas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
                  Disciplinas do Edital
                </label>
                {/* Presets Rápidos */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreset('todas')}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
                  >
                    Todas (6)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('bloco3')}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
                  >
                    Direito
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('bloco1')}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
                  >
                    Gerais
                  </button>
                </div>
              </div>

              {/* Grid 2x3 das Matérias */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CORE_DISCIPLINAS.map((d) => {
                  const isSelected = selectedDisciplinas.includes(d.id);
                  const count = contagemData?.contagemPorDisciplina?.[d.id]?.total ?? 0;

                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDisciplina(d.id)}
                      className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600/15 border-indigo-500/50 text-slate-100 shadow-sm'
                          : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-xs sm:text-sm font-semibold leading-tight block truncate">
                          {d.nome}
                        </span>
                        <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                          {count > 0 ? `${count} disponíveis` : 'Disponível com IA'}
                        </span>
                      </div>

                      <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                        isSelected ? 'bg-indigo-500 text-white' : 'border border-slate-700'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assunto ou Tema com Chips */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
                  Assunto ou Tema <span className="text-slate-400 font-normal normal-case">(Opcional)</span>
                </label>
                {isTemaDefinido && (
                  <span className="text-xs text-indigo-400 font-semibold">
                    {contagemData?.focoTemaTotal || 0} encontradas
                  </span>
                )}
              </div>

              <input
                type="text"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Ex: Artigo 5º, Crase, Negação lógica, Nassau..."
                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all"
              />

              {/* Chips Compactos */}
              {activeChips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-slate-400 font-medium mr-1">Sugestões:</span>
                  {activeChips.map((chip) => {
                    const isCurrent = assunto.trim().toLowerCase() === chip.toLowerCase();
                    const chipCount = contagemData?.chipsCount?.[chip]?.total;

                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setAssunto(chip)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all border cursor-pointer flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            : 'bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white border-white/[0.06]'
                        }`}
                      >
                        <span>{chip}</span>
                        {chipCount !== undefined && chipCount > 0 && (
                          <span className={`text-xs px-1.5 py-0.2 rounded font-mono ${
                            isCurrent ? 'bg-indigo-700 text-indigo-100' : 'bg-white/[0.08] text-slate-400'
                          }`}>
                            {chipCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA: Quantidade, Modo, Origem e Ação (5 Colunas) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            {/* Quantidade */}
            <div>
              <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 block mb-1.5">
                Quantidade de Questões
              </label>
              <div className="flex gap-1.5">
                {[4, 8, 12, 16, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuantidade(num)}
                    className={`flex-1 py-2.5 rounded-xl text-center text-xs sm:text-sm font-bold border transition-all cursor-pointer ${
                      quantidade === num
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:text-white hover:border-white/[0.12]'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Modo de Resolução */}
            <div>
              <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 block mb-1.5">
                Modo de Resolução
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModo('estudo')}
                  className={`py-2.5 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                    modo === 'estudo'
                      ? 'bg-indigo-600/15 border-indigo-500/50 text-indigo-200 font-semibold shadow-sm'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm">
                    <Brain className="w-4 h-4 text-indigo-400" />
                    <span>Modo Estudo</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setModo('simulado')}
                  className={`py-2.5 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                    modo === 'simulado'
                      ? 'bg-indigo-600/15 border-indigo-500/50 text-indigo-200 font-semibold shadow-sm'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>Modo Prova</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Origem das Questões */}
            <div>
              <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 block mb-1.5">
                Origem das Questões
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSourceMode('local')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    sourceMode === 'local'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200 shadow-sm'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Acervo Local</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {totalLocalDisponivel} prontas • Offline
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceMode('ai')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    sourceMode === 'ai'
                      ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-200 shadow-sm'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Gerar com IA</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Inéditas com Gemini
                  </p>
                </button>
              </div>
            </div>

            {/* Botão de Ação Primário */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-bold text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-600/30 cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Preparando...</span>
                  </div>
                ) : (
                  <>
                    <span>Iniciar Treino • {quantidade} Questões</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
