import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Building2,
  Calendar,
  Sparkles,
  Layers,
  Search,
  Database,
  Zap,
  BookOpen
} from 'lucide-react';
import { parsePdfFile } from '../utils/pdfParser';
import { 
  addProva, 
  toggleProva, 
  deleteProva, 
  buscaCossenoProvas,
  fetchBaseStats,
  buscarBaseLegal,
  ingerirBaseLegal,
  removerBaseLegal,
  importarGabarito
} from '../services/api';
import FormattedLegalText from './FormattedLegalText';

// Detecção inteligente de banca e órgão a partir do texto do PDF
function detectBancaAndMetadata(text, fileName) {
  const lower = (text + ' ' + fileName).toLowerCase();

  let banca = 'Instituto AOCP';
  if (lower.includes('cebraspe') || lower.includes('cespe')) banca = 'Cebraspe';
  else if (lower.includes('fgv') || lower.includes('getulio vargas') || lower.includes('getúlio vargas')) banca = 'FGV';
  else if (lower.includes('fcc') || lower.includes('carlos chagas')) banca = 'FCC';
  else if (lower.includes('ibfc')) banca = 'IBFC';
  else if (lower.includes('vunesp')) banca = 'Vunesp';
  else if (lower.includes('idecan')) banca = 'IDECAN';
  else if (lower.includes('quadrix')) banca = 'Quadrix';
  else if (lower.includes('ibade')) banca = 'IBADE';

  const yearMatch = lower.match(/\b(201[89]|202[0-9])\b/);
  const ano = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  let orgao = 'PMPE';
  if (lower.includes('pmpe') || lower.includes('polícia militar de pernambuco') || lower.includes('policia militar de pernambuco')) orgao = 'PMPE';
  else if (lower.includes('pmdf')) orgao = 'PMDF';
  else if (lower.includes('pmba')) orgao = 'PMBA';
  else if (lower.includes('pmce')) orgao = 'PMCE';
  else if (lower.includes('pcgo') || lower.includes('polícia civil de goiás')) orgao = 'PC-GO';
  else if (lower.includes('pcpe')) orgao = 'PCPE';
  else if (lower.includes('prf') || lower.includes('rodoviária federal')) orgao = 'PRF';
  else if (lower.includes('pf') || lower.includes('polícia federal')) orgao = 'Polícia Federal';
  else orgao = 'Segurança Pública';

  let cargo = 'Soldado';
  if (lower.includes('agente')) cargo = 'Agente de Polícia';
  else if (lower.includes('escrivão') || lower.includes('escrivao')) cargo = 'Escrivão';
  else if (lower.includes('oficial')) cargo = 'Oficial PM';

  return { banca, ano, orgao, cargo };
}

export default function ExamManager({ exams, onRefreshExams }) {
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  
  // Modal de confirmação/edição da prova detectada
  const [pendingExam, setPendingExam] = useState(null);

  // Importação de gabarito oficial por prova
  const [gabaritoAberto, setGabaritoAberto] = useState(null);
  const [gabaritoTexto, setGabaritoTexto] = useState('');
  const [gabaritoMsg, setGabaritoMsg] = useState(null);

  // Base legal (leis/edital) usada como fonte primária pela IA
  const [baseStats, setBaseStats] = useState([]);
  const [baseFonte, setBaseFonte] = useState('');
  const [baseDisciplina, setBaseDisciplina] = useState('');
  const [baseTexto, setBaseTexto] = useState('');
  const [baseMsg, setBaseMsg] = useState(null);
  const [baseSalvando, setBaseSalvando] = useState(false);

  // Busca vetorial por cosseno
  const [cossenoQuery, setCossenoQuery] = useState('');
  const [cossenoResults, setCossenoResults] = useState([]);
  const [cossenoSearching, setCossenoSearching] = useState(false);

  // Consulta rápida na Base Oficial Soldado PMPE 2026 (FTS5 + BM25)
  const [vadeQuery, setVadeQuery] = useState('');
  const [vadeDisciplina, setVadeDisciplina] = useState('');
  const [vadeResults, setVadeResults] = useState([]);
  const [vadeSearching, setVadeSearching] = useState(false);

  const fontesAgrupadas = React.useMemo(() => {
    const map = new Map();
    for (const item of baseStats) {
      const atual = map.get(item.fonte) || {
        fonte: item.fonte,
        disciplina: item.disciplina || '',
        trechos: 0,
        topicos: new Set()
      };
      atual.trechos += Number(item.trechos || 0);
      if (item.topico) atual.topicos.add(item.topico);
      if (!atual.disciplina && item.disciplina) atual.disciplina = item.disciplina;
      map.set(item.fonte, atual);
    }
    return Array.from(map.values());
  }, [baseStats]);

  const totalTrechosBase = React.useMemo(
    () => fontesAgrupadas.reduce((acc, f) => acc + f.trechos, 0),
    [fontesAgrupadas]
  );

  const executarBuscaVade = async (termo, disc = vadeDisciplina) => {
    if (!termo.trim() && !disc) return;
    setVadeSearching(true);
    try {
      const res = await buscarBaseLegal({
        q: termo.trim(),
        disciplina: disc,
        limite: 6
      });
      setVadeResults(res || []);
    } finally {
      setVadeSearching(false);
    }
  };

  const handleVadeSearch = (e) => {
    e?.preventDefault();
    executarBuscaVade(vadeQuery, vadeDisciplina);
  };

  const carregarBase = async () => {
    try {
      const stats = await fetchBaseStats();
      setBaseStats(stats || []);
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => { 
    carregarBase(); 
  }, []);

  const handleImportarGabarito = async (provaId) => {
    try {
      const r = await importarGabarito(provaId, gabaritoTexto);
      setGabaritoMsg({ type: 'success', text: `${r.itensLidos} itens lidos. ${r.questoesSemGabarito} questão(ões) ainda sem gabarito.` });
      setGabaritoTexto('');
      await onRefreshExams();
    } catch (err) {
      setGabaritoMsg({ type: 'error', text: err.message });
    }
  };

  const handleIngerirBase = async () => {
    setBaseSalvando(true);
    setBaseMsg(null);
    try {
      const r = await ingerirBaseLegal({ fonte: baseFonte, disciplina: baseDisciplina, texto: baseTexto });
      setBaseMsg({ type: 'success', text: `${r.trechos} trechos gravados (por artigo/súmula).` });
      setBaseTexto('');
      await carregarBase();
    } catch (err) {
      setBaseMsg({ type: 'error', text: err.message });
    } finally {
      setBaseSalvando(false);
    }
  };

  const handleRemoverBase = async (fonte) => {
    if (!window.confirm(`Remover todos os trechos de "${fonte}"?`)) return;
    try {
      await removerBaseLegal(fonte);
      await carregarBase();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCossenoSearch = async (e) => {
    e?.preventDefault();
    if (!cossenoQuery.trim()) return;
    setCossenoSearching(true);
    try {
      const res = await buscaCossenoProvas({ query: cossenoQuery.trim(), limite: 6 });
      setCossenoResults(res.resultados || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCossenoSearching(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setStatusMsg({ type: 'error', text: 'Por favor, selecione um arquivo em formato PDF.' });
      return;
    }

    setUploading(true);
    setStatusMsg(null);

    try {
      const parsed = await parsePdfFile(file);
      const detected = detectBancaAndMetadata(parsed.texto.slice(0, 5000), file.name);
      if (parsed.aviso) setStatusMsg({ type: 'error', text: parsed.aviso });

      setPendingExam({
        id: 'prova_' + Date.now(),
        nome: file.name.replace('.pdf', ''),
        banca: detected.banca,
        ano: detected.ano,
        orgao: detected.orgao,
        cargo: detected.cargo,
        total_paginas: parsed.totalPaginas,
        tamanho_caracteres: parsed.tamanhoCaracteres,
        texto: parsed.texto
      });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Erro ao processar o arquivo PDF. Certifique-se de que não está protegido.' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleConfirmAddExam = async () => {
    if (!pendingExam) return;
    try {
      await addProva(pendingExam);
      await onRefreshExams();
      setStatusMsg({ 
        type: 'success', 
        text: `Prova "${pendingExam.nome}" gravada no SQLite.` 
      });
      setPendingExam(null);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Falha ao gravar prova.' });
    }
  };

  const handleToggle = async (id) => {
    try {
      await toggleProva(id);
      await onRefreshExams();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id, nome) => {
    if (window.confirm(`Tem certeza que deseja excluir a prova "${nome}"?`)) {
      try {
        await deleteProva(id);
        await onRefreshExams();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const getBancaBadgeColor = (banca) => {
    const b = (banca || '').toLowerCase();
    if (b.includes('aocp')) return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    if (b.includes('cebraspe') || b.includes('cespe')) return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    if (b.includes('fgv')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (b.includes('fcc')) return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 w-full space-y-6">
      {/* Header Padronizado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-indigo-400" />
            <span>Banco de Provas & Acervo Oficial</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Cadernos de provas reais salvos no SQLite com extração de itens e busca semântica
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 px-3.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <Database className="w-4 h-4 text-emerald-400" />
          <span><strong>{exams.length} provas</strong> cadastradas ({exams.filter(e => e.ativo).length} ativas)</span>
        </div>
      </div>

      {/* Upload de Novo PDF */}
      <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-5 sm:p-7 shadow-xl shadow-black/30">
        <h2 className="text-sm sm:text-base font-bold text-slate-100 mb-1 flex items-center gap-2">
          <UploadCloud className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
          <span>Importar Nova Prova (PDF)</span>
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          O sistema extrai o texto e classifica as questões por disciplina do edital automaticamente.
        </p>

        <label className="border-2 border-dashed border-white/[0.1] hover:border-indigo-500/60 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/[0.01] hover:bg-white/[0.03] group">
          <UploadCloud className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition-colors mb-2" />
          <span className="text-xs sm:text-sm font-semibold text-slate-200">
            {uploading ? 'Extraindo questões e identificando banca...' : 'Clique para selecionar ou arraste uma prova em PDF'}
          </span>
          <span className="text-xs text-slate-500 mt-1">
            Suporta Instituto AOCP, PMPE, PMDF, PC-GO e outras carreiras
          </span>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>

        {statusMsg && (
          <div
            className={`mt-4 p-3 rounded-xl border flex items-center gap-2 text-xs sm:text-sm ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Modal de Confirmação da Prova Detectada */}
      {pendingExam && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121929] border border-white/[0.1] rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 pb-3 border-b border-white/[0.08]">
              <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">Prova Identificada</h3>
                <p className="text-xs text-slate-400">Confirme ou edite os dados antes de gravar no SQLite</p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Título da Prova</label>
                <input
                  type="text"
                  value={pendingExam.nome}
                  onChange={(e) => setPendingExam({ ...pendingExam, nome: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500/60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Banca</label>
                  <input
                    type="text"
                    value={pendingExam.banca}
                    onChange={(e) => setPendingExam({ ...pendingExam, banca: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Ano</label>
                  <input
                    type="number"
                    value={pendingExam.ano}
                    onChange={(e) => setPendingExam({ ...pendingExam, ano: parseInt(e.target.value) || 2024 })}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Órgão</label>
                  <input
                    type="text"
                    value={pendingExam.orgao}
                    onChange={(e) => setPendingExam({ ...pendingExam, orgao: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Cargo</label>
                  <input
                    type="text"
                    value={pendingExam.cargo}
                    onChange={(e) => setPendingExam({ ...pendingExam, cargo: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500/60"
                  />
                </div>
              </div>

              <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-xs text-slate-400 flex items-center justify-between">
                <span>{pendingExam.total_paginas} páginas</span>
                <span>{(pendingExam.tamanho_caracteres / 1000).toFixed(0)}k caracteres</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                onClick={handleConfirmAddExam}
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
              >
                Gravar no Banco SQLite
              </button>
              <button
                onClick={() => setPendingExam(null)}
                className="py-2.5 px-4 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Busca Semântica por Cosseno */}
      <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-5 sm:p-7 shadow-xl shadow-black/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-100">
              Busca Semântica por Cosseno nos PDFs (RAG Atômico)
            </h2>
            <p className="text-xs text-slate-400">
              Calcule o ângulo vetorial cos(θ) entre qualquer termo e todas as questões das provas oficiais.
            </p>
          </div>
        </div>

        <form onSubmit={handleCossenoSearch} className="flex flex-col sm:flex-row gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={cossenoQuery}
              onChange={(e) => setCossenoQuery(e.target.value)}
              placeholder="Digite um conceito (ex: crase facultativa, inviolabilidade domicílio, nassau, negação condicional)..."
              className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-indigo-500/60"
            />
          </div>
          <button
            type="submit"
            disabled={cossenoSearching || !cossenoQuery.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {cossenoSearching ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>Buscar por Similaridade</span>
            )}
          </button>
        </form>

        {/* Resultados */}
        {cossenoResults.length > 0 && (
          <div className="mt-4 space-y-2.5 pt-4 border-t border-white/[0.06]">
            <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Questões reais encontradas por proximidade:</span>
              <span className="text-xs text-indigo-400 font-mono">cos(θ) decrescente</span>
            </div>

            <div className="grid gap-2.5">
              {cossenoResults.map((item) => (
                <div key={item.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-slate-200">
                        {item.prova_nome} • Questão {item.numero}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                        {item.disciplina}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      cos(θ) = {item.cosseno}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-2">
                    {item.enunciado}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lista de Provas no SQLite */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold text-slate-100">
            Provas Gravadas no SQLite ({exams.length})
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            {exams.filter(e => e.ativo).length} ativas para geração
          </span>
        </div>

        <div className="grid gap-2.5">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className={`p-4 rounded-2xl border transition-all flex flex-wrap items-center justify-between gap-3 ${
                exam.ativo
                  ? 'bg-[#121929] border-white/[0.08]'
                  : 'bg-white/[0.01] border-white/[0.04] opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${exam.ativo ? 'bg-indigo-500/15 text-indigo-400' : 'bg-white/[0.04] text-slate-500'}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-100 text-xs sm:text-sm">{exam.nome}</span>
                    <span className={`text-xs uppercase font-bold px-2.5 py-0.5 rounded-full border ${getBancaBadgeColor(exam.banca)}`}>
                      {exam.banca}
                    </span>
                    {exam.is_padrao === 1 && (
                      <span className="text-xs uppercase font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        Oficial PMPE
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                    <span>{exam.orgao} • {exam.cargo}</span>
                    <span>•</span>
                    <span>{exam.ano}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      {exam.total_questoes || 0} questões
                    </span>
                    <span>•</span>
                    <span className={exam.total_gabaritadas >= exam.total_questoes && exam.total_questoes > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                      {exam.total_gabaritadas || 0}/{exam.total_questoes || 0} gabaritadas
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setGabaritoAberto(gabaritoAberto === exam.id ? null : exam.id); setGabaritoMsg(null); setGabaritoTexto(''); }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-colors cursor-pointer"
                >
                  Gabarito
                </button>
                <button
                  onClick={() => handleToggle(exam.id)}
                  title={exam.ativo ? 'Desativar prova' : 'Ativar prova'}
                  className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {exam.ativo ? (
                    <ToggleRight className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-600" />
                  )}
                </button>

                {!exam.is_padrao && (
                  <button
                    onClick={() => handleDelete(exam.id, exam.nome)}
                    title="Remover prova do SQLite"
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {gabaritoAberto === exam.id && (
                <div className="w-full mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                  <p className="text-xs text-slate-400">
                    Cole o gabarito no formato <code>1-A 2-B 3-C...</code> ou JSON.
                  </p>
                  <textarea
                    value={gabaritoTexto}
                    onChange={(e) => setGabaritoTexto(e.target.value)}
                    rows={3}
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 text-xs font-mono focus:outline-none focus:border-indigo-500/60"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleImportarGabarito(exam.id)}
                      disabled={!gabaritoTexto.trim()}
                      className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg cursor-pointer"
                    >
                      Gravar Gabarito
                    </button>
                    {gabaritoMsg && (
                      <span className={`text-xs ${gabaritoMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{gabaritoMsg.text}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Base Legal & Consulta Rápida Soldado PMPE 2026 */}
      <div className="bg-[#121929] border border-white/[0.08] rounded-3xl p-5 sm:p-7 shadow-xl shadow-black/30 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              <span>Vade Mecum & Fichas Oficiais — Soldado PMPE 2026</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Consulta instantânea offline (SQLite FTS5 + BM25) na legislação atualizada, súmulas STF/STJ e fichas de História de PE e Informática.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 self-start sm:self-auto">
            {totalTrechosBase} dispositivos em {fontesAgrupadas.length} fontes
          </span>
        </div>

        {/* Busca Rápida Offline */}
        <div className="space-y-3">
          <form onSubmit={handleVadeSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={vadeQuery}
                onChange={(e) => setVadeQuery(e.target.value)}
                placeholder="Ex: Art. 5 XI, Lei 6783 art 28, Súmula 11, Revolução 1817, Backup incremental..."
                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <select
              value={vadeDisciplina}
              onChange={(e) => setVadeDisciplina(e.target.value)}
              className="bg-slate-900 border border-white/[0.08] rounded-xl px-3 py-2.5 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-emerald-500/60"
            >
              <option value="">Todas as disciplinas</option>
              <option value="Direito Constitucional">Direito Constitucional</option>
              <option value="Direitos Humanos e Legislação Extravagante">DH e Legislação Extravagante</option>
              <option value="História de Pernambuco">História de Pernambuco</option>
              <option value="Informática">Informática</option>
            </select>
            <button
              type="submit"
              disabled={vadeSearching || (!vadeQuery.trim() && !vadeDisciplina)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            >
              {vadeSearching ? 'Buscando...' : 'Consultar'}
            </button>
          </form>

          {/* Atalhos rápidos */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 mr-1">Atalhos:</span>
            {[
              { label: 'CF Art. 5º XI', q: 'Art. 5 XI domicílio', disc: 'Direito Constitucional' },
              { label: 'Estatuto PMPE (Lei 6.783)', q: 'Art. 28 valor policial-militar', disc: 'Direitos Humanos e Legislação Extravagante' },
              { label: 'SV 11 Algemas', q: 'Súmula Vinculante 11 algemas', disc: 'Direitos Humanos e Legislação Extravagante' },
              { label: 'Insurreição 1645 / Guararapes', q: 'Guararapes 1648 Tabocas', disc: 'História de Pernambuco' },
              { label: 'Excel 2019 vs Calc', q: 'PROCV SOMASES Calc', disc: 'Informática' }
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setVadeQuery(chip.q);
                  setVadeDisciplina(chip.disc);
                  executarBuscaVade(chip.q, chip.disc);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-slate-300 transition-colors cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {vadeResults.length > 0 && (
            <div className="grid gap-2.5 pt-2 max-h-96 overflow-y-auto pr-1">
              {vadeResults.map((r) => (
                <div key={r.id} className="p-4 sm:p-5 rounded-2xl bg-[#090d16] border border-emerald-500/25 space-y-3 shadow-lg shadow-black/20">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-emerald-300">
                        {r.fonte}
                      </span>
                      {r.referencia && (
                        <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-300 border border-white/[0.08]">
                          {r.referencia}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {r.disciplina && (
                        <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/[0.06] text-[11px] font-medium">
                          {r.disciplina}
                        </span>
                      )}
                      {r.topico && (
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 text-[11px] font-medium">
                          {r.topico}
                        </span>
                      )}
                    </div>
                  </div>
                  <FormattedLegalText text={r.texto} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adicionar nova fonte manual */}
        <div className="pt-5 border-t border-white/[0.06]">
          <h3 className="text-xs sm:text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Adicionar Lei ou Resumo Customizado na Base</span>
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Cole trechos adicionais de legislação ou resumos para indexação automática por artigo/súmula no FTS5.
          </p>
          <div className="grid sm:grid-cols-2 gap-2.5 mb-2.5">
            <input
              type="text"
              placeholder="Fonte (ex: Lei Estadual PE nº 6.783/1974)"
              value={baseFonte}
              onChange={(e) => setBaseFonte(e.target.value)}
              className="bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-indigo-500/60"
            />
            <select
              value={baseDisciplina}
              onChange={(e) => setBaseDisciplina(e.target.value)}
              className="bg-slate-900 border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-indigo-500/60"
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
            value={baseTexto}
            onChange={(e) => setBaseTexto(e.target.value)}
            rows={3}
            placeholder="Cole aqui o texto dos artigos da lei ou ficha de estudo..."
            className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-100 text-xs font-mono focus:outline-none focus:border-indigo-500/60"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleIngerirBase}
              disabled={baseSalvando || !baseFonte.trim() || baseTexto.trim().length < 50}
              className="px-4 py-2 text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl cursor-pointer"
            >
              {baseSalvando ? 'Gravando...' : 'Gravar na Base Legal'}
            </button>
            {baseMsg && (
              <span className={`text-xs ${baseMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{baseMsg.text}</span>
            )}
          </div>

          {fontesAgrupadas.length > 0 && (
            <ul className="mt-4 grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {fontesAgrupadas.map((b) => (
                <li key={b.fonte} className="flex items-center justify-between gap-2 text-xs text-slate-300 bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-200 block truncate">{b.fonte}</span>
                    <span className="text-slate-500 text-[11px]">
                      {b.trechos} trechos{b.topicos.size > 0 ? ` • ${b.topicos.size} tópico(s)` : ''}{b.disciplina ? ` • ${b.disciplina}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoverBase(b.fonte)}
                    title={`Remover ${b.fonte}`}
                    className="text-slate-500 hover:text-rose-400 cursor-pointer shrink-0 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
