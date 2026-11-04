import React, { useState } from 'react';
import { salvarNotasCaderno } from '../services/api';

// Anotação livre + tipo de armadilha de um item do Caderno de Erros
export function NotasItem({ item, tipos, onSalvo }) {
  const [anotacao, setAnotacao] = useState(item.anotacao || '');
  const [tipo, setTipo] = useState(item.tipo_armadilha || '');
  const [estado, setEstado] = useState('');

  const salvar = async () => {
    setEstado('salvando');
    try {
      await salvarNotasCaderno(item.id, { anotacao, tipo_armadilha: tipo });
      setEstado('salvo');
      onSalvo?.();
    } catch {
      setEstado('erro');
    }
  };

  return (
    <div className="pt-3 border-t border-white/[0.06] space-y-2">
      <select
        value={tipo}
        onChange={(e) => { setTipo(e.target.value); setEstado(''); }}
        className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-xs text-slate-200"
      >
        <option value="">Por que errei? (tipo de armadilha)</option>
        {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <textarea
        value={anotacao}
        onChange={(e) => { setAnotacao(e.target.value); setEstado(''); }}
        maxLength={2000}
        rows={2}
        placeholder="Minha anotação: errei porque confundi X com Y..."
        className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-xs sm:text-sm text-slate-100 placeholder:text-slate-500"
      />
      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={salvar} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer">Salvar anotação</button>
        {estado === 'salvando' && <span className="text-slate-400">Salvando...</span>}
        {estado === 'salvo' && <span className="text-emerald-400">Salvo</span>}
        {estado === 'erro' && <span className="text-rose-400">Falha ao salvar</span>}
      </div>
    </div>
  );
}

// Padrão dos seus erros por tipo de armadilha
export function ResumoArmadilhas({ armadilhas }) {
  if (!armadilhas || armadilhas.length === 0) return null;
  const maximo = Math.max(...armadilhas.map((a) => a.total));
  return (
    <div className="p-5 rounded-2xl bg-[#121929] border border-white/[0.08] space-y-2.5">
      <h3 className="text-sm font-bold text-slate-100">Por que você erra</h3>
      {armadilhas.map((a) => (
        <div key={a.tipo} className="text-xs text-slate-300">
          <div className="flex justify-between mb-1"><span>{a.tipo}</span><span className="font-mono">{a.total}</span></div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${(a.total / maximo) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Abre uma página só com o caderno (com gabarito e anotações) pronta para "Salvar como PDF" ou imprimir
export function imprimirCaderno(itens) {
  const blocos = itens.map((q, i) => `
    <section>
      <h3>${i + 1}. ${esc(q.disciplina)}${q.assunto ? ' — ' + esc(q.assunto) : ''} <small>(Caixa ${q.caixa_leitner})</small></h3>
      <p>${esc(q.enunciado)}</p>
      <ol type="A">${(q.alternativas || []).map((a) => `<li${a.letra === q.gabarito ? ' class="ok"' : ''}>${esc(a.texto)}</li>`).join('')}</ol>
      <p><b>Gabarito: ${esc(q.gabarito)}</b>${q.explicacao?.correta ? ' — ' + esc(q.explicacao.correta) : ''}</p>
      ${q.tipo_armadilha ? `<p><i>Armadilha: ${esc(q.tipo_armadilha)}</i></p>` : ''}
      ${q.anotacao ? `<p class="nota">Anotação: ${esc(q.anotacao)}</p>` : ''}
    </section>`).join('');
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Caderno de Erros</title>
    <style>body{font:13px/1.5 Georgia,serif;max-width:760px;margin:24px auto;color:#111}section{break-inside:avoid;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #ccc}
    h3{font-size:14px;margin:0 0 6px}small{font-weight:400;color:#555}li.ok{font-weight:700}.nota{background:#fff8d6;padding:6px 8px}</style></head>
    <body><h2>Caderno de Erros — ${new Date().toLocaleDateString('pt-BR')}</h2>${blocos}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}
