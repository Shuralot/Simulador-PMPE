import React, { useState, useEffect } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { fetchContagemBanco, fetchPainel } from '../services/api';

const CORE_DISCIPLINAS = [
  { id: 'Direito Constitucional', nome: 'Constitucional', chips: ['Artigo 5º', 'Remédios Constitucionais', 'Organização do Estado', 'Segurança Pública (Art. 144)'] },
  { id: 'Direitos Humanos e Legislação Extravagante', nome: 'Leis e Direitos Humanos', chips: ['Estatuto PMPE (Lei 6.783)', 'Abuso de Autoridade', 'Maria da Penha', 'Crimes Ambientais', 'ECA'] },
  { id: 'Língua Portuguesa', nome: 'Português', chips: ['Crase', 'Pontuação', 'Concordância', 'Funções do Que e Se'] },
  { id: 'História de Pernambuco', nome: 'História de PE', chips: ['Domínio Holandês', 'Revolução de 1817', 'Confederação do Equador', 'Quilombos e Cultura Afro'] },
  { id: 'Raciocínio Lógico-Matemático', nome: 'Raciocínio Lógico', chips: ['Negação e Equivalência', 'Diagramas Lógicos', 'Análise Combinatória', 'Probabilidade'] },
  { id: 'Informática', nome: 'Informática', chips: ['Segurança da Informação', 'Windows 11', 'Excel 2019 e Calc', 'Backup e Nuvem'] }
];

const QUANTIDADES = [4, 8, 12, 16, 20];

const pill = (ativo) =>
  `px-3.5 py-1.5 rounded-full text-sm transition-colors cursor-pointer ${
    ativo
      ? 'bg-indigo-500 text-white font-medium'
      : 'text-slate-300 bg-white/[0.04] hover:bg-white/[0.09]'
  }`;

export default function QuizConfig({
  onStartQuiz,
  onStartLocalQuiz,
  loading,
  hasApiKey,
  onOpenSettings,
  prefilled = null,
  revisoesVencidas = 0,
  onRevisar
}) {
  const [selectedDisciplinas, setSelectedDisciplinas] = useState([]);
  const [assunto, setAssunto] = useState('');
  const [quantidade, setQuantidade] = useState(8);
  const [modo, setModo] = useState('estudo'); // 'estudo' | 'simulado'
  const [sourceMode, setSourceMode] = useState('local'); // 'local' | 'ai'
  const [contagemData, setContagemData] = useState(null);
  const [avisoFracos, setAvisoFracos] = useState('');
  const [maisAberto, setMaisAberto] = useState(false);

  const activeChips = CORE_DISCIPLINAS
    .filter((d) => selectedDisciplinas.includes(d.id))
    .flatMap((d) => d.chips)
    .slice(0, 6);

  useEffect(() => {
    if (selectedDisciplinas.length === 0) return undefined;
    let isMounted = true;
    fetchContagemBanco({
      disciplinas: selectedDisciplinas,
      tema: assunto.trim(),
      chips: activeChips
    }).then((data) => {
      if (isMounted && data) setContagemData(data);
    }).catch(() => {});

    return () => { isMounted = false; };
  }, [selectedDisciplinas, assunto]);

  useEffect(() => {
    if (prefilled) {
      if (prefilled.disciplina) setSelectedDisciplinas([prefilled.disciplina]);
      if (prefilled.assunto) {
        setAssunto(prefilled.assunto);
        setMaisAberto(true);
      }
    }
  }, [prefilled]);

  const todasSelecionadas = selectedDisciplinas.length === CORE_DISCIPLINAS.length;

  const toggleDisciplina = (id) => {
    setAvisoFracos('');
    if (selectedDisciplinas.includes(id)) {
      setSelectedDisciplinas(selectedDisciplinas.filter((d) => d !== id));
    } else {
      setSelectedDisciplinas([...selectedDisciplinas, id]);
    }
  };

  // Seleciona as disciplinas onde você mais erra (zonas críticas do Desempenho) e foca no pior tópico
  const aplicarPontosFracos = async () => {
    setAvisoFracos('');
    try {
      const { atacar } = await fetchPainel();
      if (atacar.length === 0) {
        setAvisoFracos('Ainda não há pontos fracos claros: responda mais questões para o app identificá-los.');
        return;
      }
      const top = atacar.slice(0, 3);
      const disciplinas = [...new Set(top.map((t) => t.disciplina))];
      setSelectedDisciplinas(disciplinas);
      setAssunto(disciplinas.length === 1 ? top[0].topico : '');
      setAvisoFracos(`Foco em: ${top.map((t) => `${t.topico} (${Math.round(t.taxa)}%)`).join(', ')}`);
    } catch {
      setAvisoFracos('Não foi possível carregar seu desempenho.');
    }
  };

  const isTemaDefinido = Boolean(assunto && assunto.trim());

  const handleStart = (e) => {
    e?.preventDefault();
    if (loading || selectedDisciplinas.length === 0) return;

    if (sourceMode === 'local') {
      onStartLocalQuiz?.({
        disciplinas: selectedDisciplinas,
        tema: assunto.trim(),
        quantidade: Number(quantidade),
        modo
      });
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
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6">
      <form onSubmit={handleStart} className="space-y-9 py-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">Treinar</h1>

        {/* Matérias */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm text-slate-400">Matérias</h2>
            <div className="flex items-center gap-4 text-sm">
              {!todasSelecionadas && (
                <button type="button" onClick={() => { setSelectedDisciplinas(CORE_DISCIPLINAS.map((d) => d.id)); setAvisoFracos(''); }} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                  Todas
                </button>
              )}
              <button type="button" onClick={aplicarPontosFracos} className="text-indigo-300 hover:text-indigo-200 cursor-pointer">
                Focar nos pontos fracos
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {CORE_DISCIPLINAS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDisciplina(d.id)}
                aria-pressed={selectedDisciplinas.includes(d.id)}
                className={pill(selectedDisciplinas.includes(d.id))}
              >
                {d.nome}
              </button>
            ))}
          </div>
          {avisoFracos && <p className="text-sm text-slate-400">{avisoFracos}</p>}
        </section>

        {/* Quantidade */}
        <section className="space-y-3">
          <h2 className="text-sm text-slate-400">Questões</h2>
          <div className="flex gap-2">
            {QUANTIDADES.map((num) => (
              <button key={num} type="button" onClick={() => setQuantidade(num)} className={`${pill(quantidade === num)} min-w-12 text-center`}>
                {num}
              </button>
            ))}
          </div>
        </section>

        {/* Ação principal */}
        <div className="space-y-3">
          <button
            type="submit"
            disabled={loading || selectedDisciplinas.length === 0}
            className="w-full py-4 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white text-lg font-semibold transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Preparando...
              </>
            ) : (
              <>Começar <ArrowRight className="w-5 h-5" /></>
            )}
          </button>

          {selectedDisciplinas.length === 0 && <p className="text-sm text-slate-500 text-center">Escolha ao menos uma matéria para começar.</p>}

          {revisoesVencidas > 0 && (
            <button
              type="button"
              onClick={onRevisar}
              className="w-full py-3 rounded-2xl text-base text-slate-200 bg-white/[0.04] hover:bg-white/[0.09] transition-colors cursor-pointer"
            >
              Revisar erros <span className="text-slate-400">· {revisoesVencidas} para hoje</span>
            </button>
          )}
        </div>

        {/* Opções avançadas */}
        <section>
          <button
            type="button"
            onClick={() => setMaisAberto(!maisAberto)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Mais opções
            <ChevronDown className={`w-4 h-4 transition-transform ${maisAberto ? 'rotate-180' : ''}`} />
          </button>

          {maisAberto && (
            <div className="mt-5 space-y-7">
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm text-slate-400">Assunto específico</h2>
                  {isTemaDefinido && contagemData && (
                    <span className="text-sm text-slate-500">{contagemData.focoTemaTotal || 0} questões encontradas</span>
                  )}
                </div>
                <input
                  type="text"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  placeholder="Artigo 5º, Crase, Negação lógica..."
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/70"
                />
                <div className="flex flex-wrap gap-2">
                  {activeChips.map((chip) => (
                    <button key={chip} type="button" onClick={() => setAssunto(chip)} className={`${pill(assunto.trim().toLowerCase() === chip.toLowerCase())} !text-xs`}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm text-slate-400">Modo</h2>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setModo('estudo')} className={pill(modo === 'estudo')}>Estudo (feedback imediato)</button>
                  <button type="button" onClick={() => setModo('simulado')} className={pill(modo === 'simulado')}>Prova (resultado no fim)</button>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm text-slate-400">Origem</h2>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSourceMode('local')} className={pill(sourceMode === 'local')}>Acervo local</button>
                  <button type="button" onClick={() => setSourceMode('ai')} className={pill(sourceMode === 'ai')}>Inéditas com IA</button>
                </div>
                {sourceMode === 'ai' && !hasApiKey && (
                  <p className="text-sm text-slate-400">Configure a chave do Gemini em Opções para gerar questões.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </form>
    </div>
  );
}
