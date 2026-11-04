import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Interruptor from './Interruptor';
import { parsePdfFile } from '../utils/pdfParser';
import { 
  addProva, 
  toggleProva, 
  deleteProva, 
  buscaCossenoProvas,
  importarGabarito
} from '../services/api';

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

  // Busca vetorial por cosseno
  const [cossenoQuery, setCossenoQuery] = useState('');
  const [cossenoResults, setCossenoResults] = useState([]);
  const [cossenoSearching, setCossenoSearching] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [cossenoBuscou, setCossenoBuscou] = useState(false);
  const [cossenoAberta, setCossenoAberta] = useState(null);

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

  const handleCossenoSearch = async (e) => {
    e?.preventDefault();
    if (!cossenoQuery.trim()) return;
    setCossenoSearching(true);
    try {
      const res = await buscaCossenoProvas({ query: cossenoQuery.trim(), limite: 6 });
      setCossenoResults(res.questoes || []);
      setCossenoBuscou(true);
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

  const campo = 'w-full rounded-lg bg-white/[0.05] border border-white/[0.1] px-3 py-2 text-base text-slate-100 focus:outline-none focus:border-indigo-400/70';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">Provas</h1>
        <p className="text-slate-500">
          {exams.length} cadastradas, {exams.filter((e) => e.ativo).length} ativas. As questões extraídas daqui alimentam os treinos.
        </p>
      </div>

      {/* Lista */}
      <section>
        <ul className="divide-y divide-white/[0.06]">
          {exams.map((exam) => {
            const completa = exam.total_questoes > 0 && exam.total_gabaritadas >= exam.total_questoes;
            return (
              <li key={exam.id} className={`py-5 transition-opacity ${exam.ativo ? '' : 'opacity-50'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-lg text-slate-100 sm:truncate">{exam.nome}</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {exam.banca} · {exam.orgao} · {exam.cargo} · {exam.ano} · {exam.total_questoes || 0} questões ·{' '}
                      <span className={completa ? 'text-emerald-400' : 'text-amber-400'}>
                        {exam.total_gabaritadas || 0}/{exam.total_questoes || 0} com gabarito
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 text-sm">
                    <button
                      type="button"
                      onClick={() => { setGabaritoAberto(gabaritoAberto === exam.id ? null : exam.id); setGabaritoMsg(null); setGabaritoTexto(''); }}
                      className="text-slate-400 hover:text-slate-100 cursor-pointer"
                    >
                      Gabarito
                    </button>
                    {!exam.is_padrao && (
                      <button type="button" onClick={() => handleDelete(exam.id, exam.nome)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                        Remover
                      </button>
                    )}
                    <Interruptor ativo={!!exam.ativo} onChange={() => handleToggle(exam.id)} rotulo={exam.ativo ? `Desativar ${exam.nome}` : `Ativar ${exam.nome}`} />
                  </div>
                </div>

                {gabaritoAberto === exam.id && (
                  <div className="mt-4 space-y-3 max-w-2xl">
                    <p className="text-sm text-slate-500">Cole o gabarito no formato <code className="text-slate-300">1-A 2-B 3-C...</code> ou JSON.</p>
                    <textarea
                      value={gabaritoTexto}
                      onChange={(e) => setGabaritoTexto(e.target.value)}
                      rows={3}
                      className={`${campo} font-mono text-sm`}
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleImportarGabarito(exam.id)}
                        disabled={!gabaritoTexto.trim()}
                        className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-medium cursor-pointer"
                      >
                        Gravar gabarito
                      </button>
                      {gabaritoMsg && <span className={`text-sm ${gabaritoMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{gabaritoMsg.text}</span>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Importar */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">Importar prova</h2>
        <label className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-dashed border-white/[0.15] hover:border-indigo-400/70 hover:bg-white/[0.02] px-5 py-5 cursor-pointer transition-colors">
          <span>
            <span className="block text-base text-slate-200">
              {uploading ? 'Extraindo questões e identificando a banca...' : 'Escolher um PDF de prova'}
            </span>
            <span className="block text-sm text-slate-500 mt-0.5">As questões são extraídas e classificadas por matéria automaticamente.</span>
          </span>
          <span className="shrink-0 self-start sm:self-auto px-4 py-2 rounded-lg bg-white/[0.08] text-slate-100 text-sm font-medium">Selecionar</span>
          <input type="file" accept="application/pdf" onChange={handleFileUpload} disabled={uploading} className="hidden" />
        </label>
        {statusMsg && <p className={`text-sm ${statusMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{statusMsg.text}</p>}
      </section>

      {/* Buscar questões parecidas */}
      <section className="pt-6 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => setBuscaAberta(!buscaAberta)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          Buscar questões parecidas nas provas
          <ChevronDown className={`w-4 h-4 transition-transform ${buscaAberta ? 'rotate-180' : ''}`} />
        </button>

        {buscaAberta && (
          <div className="mt-4 space-y-4">
            <form onSubmit={handleCossenoSearch} className="flex gap-2">
              <input
                type="text"
                value={cossenoQuery}
                onChange={(e) => { setCossenoQuery(e.target.value); setCossenoBuscou(false); }}
                placeholder="crase facultativa, inviolabilidade do domicílio, negação..."
                aria-label="Buscar questões parecidas"
                className={campo}
              />
              <button
                type="submit"
                disabled={cossenoSearching || !cossenoQuery.trim()}
                className="px-5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-medium cursor-pointer whitespace-nowrap"
              >
                {cossenoSearching ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {cossenoBuscou && cossenoResults.length === 0 && (
              <p className="text-sm text-slate-500">Nenhuma questão parecida nas provas ativas. Tente outras palavras.</p>
            )}

            {cossenoResults.length > 0 && (
              <ul className="divide-y divide-white/[0.06]">
                {cossenoResults.map((item) => {
                  const aberta = cossenoAberta === item.id;
                  return (
                    <li key={item.id} className="py-4 space-y-2">
                      <div className="text-sm text-slate-500">
                        {item.prova_nome} · questão {item.numero} · {item.disciplina}
                      </div>
                      <p className="text-base text-slate-200 leading-relaxed">{item.enunciado}</p>
                      <button type="button" onClick={() => setCossenoAberta(aberta ? null : item.id)} className="text-sm text-indigo-300 hover:text-indigo-200 cursor-pointer">
                        {aberta ? 'Ocultar alternativas' : 'Ver alternativas e gabarito'}
                      </button>
                      {aberta && (
                        <ul className="space-y-1.5 text-base">
                          {Object.entries(item.alternativas || {}).map(([letra, texto]) => (
                            <li key={letra} className={letra === item.gabarito ? 'text-emerald-400' : 'text-slate-300'}>
                              <strong className="font-semibold">{letra})</strong> {texto}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Confirmação da prova detectada */}
      {pendingExam && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Confirmar prova" className="bg-[#121929] border border-white/[0.1] rounded-2xl p-6 sm:p-7 max-w-lg w-full space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-slate-100">Confirmar prova</h3>
              <p className="text-sm text-slate-500 mt-1">Confira os dados detectados antes de gravar. {pendingExam.total_paginas} páginas, {(pendingExam.tamanho_caracteres / 1000).toFixed(0)}k caracteres.</p>
            </div>

            <div className="space-y-3 text-sm text-slate-400">
              <label className="block">Título
                <input type="text" value={pendingExam.nome} onChange={(e) => setPendingExam({ ...pendingExam, nome: e.target.value })} className={`${campo} mt-1`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">Banca
                  <input type="text" value={pendingExam.banca} onChange={(e) => setPendingExam({ ...pendingExam, banca: e.target.value })} className={`${campo} mt-1`} />
                </label>
                <label className="block">Ano
                  <input type="number" value={pendingExam.ano} onChange={(e) => setPendingExam({ ...pendingExam, ano: parseInt(e.target.value) || 2024 })} className={`${campo} mt-1`} />
                </label>
                <label className="block">Órgão
                  <input type="text" value={pendingExam.orgao} onChange={(e) => setPendingExam({ ...pendingExam, orgao: e.target.value })} className={`${campo} mt-1`} />
                </label>
                <label className="block">Cargo
                  <input type="text" value={pendingExam.cargo} onChange={(e) => setPendingExam({ ...pendingExam, cargo: e.target.value })} className={`${campo} mt-1`} />
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={handleConfirmAddExam} className="flex-1 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-medium cursor-pointer">
                Gravar prova
              </button>
              <button type="button" onClick={() => setPendingExam(null)} className="px-5 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 cursor-pointer">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
