import React, { useState, useEffect, useRef } from 'react';
import { Settings, BookOpen, BarChart3, Library } from 'lucide-react';

const PRINCIPAIS = [
  { id: 'quiz', label: 'Treinar', icone: BookOpen },
  { id: 'history', label: 'Desempenho', icone: BarChart3 },
  { id: 'vade', label: 'Vade Mecum', icone: Library }
];

export default function Navbar({ activeTab, setActiveTab, hasApiKey, examCount }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (e) => { if (!menuRef.current?.contains(e.target)) setMenuAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenuAberto(false); };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', esc);
    };
  }, [menuAberto]);

  const irPara = (id) => {
    setActiveTab(id);
    setMenuAberto(false);
  };

  const engrenagemAtiva = activeTab === 'exams' || activeTab === 'settings';

  return (
    <>
    <header className="sticky top-0 z-40 bg-[#0b0f19]/90 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <button type="button" onClick={() => irPara('quiz')} className="text-lg font-bold text-slate-100 tracking-tight cursor-pointer whitespace-nowrap">
          Simulador PMPE
        </button>

        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Em telas grandes as seções ficam no cabeçalho; no celular vão para a barra inferior */}
          <div className="hidden sm:flex items-center gap-2">
            {PRINCIPAIS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => irPara(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`px-4 py-2 text-base whitespace-nowrap rounded-lg transition-colors cursor-pointer ${
                  activeTab === item.id ? 'text-white font-semibold bg-white/[0.07]' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative ml-1" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuAberto(!menuAberto)}
              aria-label="Provas e opções"
              aria-expanded={menuAberto}
              className={`relative p-2.5 rounded-lg transition-colors cursor-pointer ${
                engrenagemAtiva ? 'text-white bg-white/[0.07]' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Settings className="w-5 h-5" />
              {!hasApiKey && <span className="absolute top-2 right-2 w-2 h-2 bg-amber-400 rounded-full" title="Chave da IA não configurada" />}
            </button>

            {menuAberto && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#121929] border border-white/[0.1] shadow-xl shadow-black/40 p-1.5 text-base">
                <button type="button" onClick={() => irPara('exams')} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-200 hover:bg-white/[0.06] cursor-pointer">
                  Provas
                  {examCount > 0 && <span className="text-sm text-slate-500 font-mono">{examCount}</span>}
                </button>
                <button type="button" onClick={() => irPara('settings')} className="w-full text-left px-3 py-2 rounded-lg text-slate-200 hover:bg-white/[0.06] cursor-pointer">
                  Opções
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>

    <nav aria-label="Seções" className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0b0f19]/95 backdrop-blur-md border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3">
        {PRINCIPAIS.map((item) => {
          const Icone = item.icone;
          const ativo = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => irPara(item.id)}
              aria-current={ativo ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs cursor-pointer ${ativo ? 'text-white font-semibold' : 'text-slate-400'}`}
            >
              <Icone className={`w-5 h-5 ${ativo ? 'text-indigo-400' : ''}`} />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
}
