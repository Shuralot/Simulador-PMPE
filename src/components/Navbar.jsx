import React from 'react';
import { BookOpen, FileText, BarChart3, Sliders, Shield } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, hasApiKey, examCount, model = 'gemini-3.8-flash' }) {
  const modelShortName = model.includes('3.8') ? '3.8 Flash' : model.replace('gemini-', '');

  const navItems = [
    { id: 'quiz', label: 'Simulador', icon: BookOpen },
    { id: 'exams', label: 'Provas', icon: FileText, count: examCount },
    { id: 'history', label: 'Desempenho', icon: BarChart3 },
    { id: 'settings', label: 'Opções', icon: Sliders, badge: !hasApiKey },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0b0f19]/90 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-18">
          {/* Brand */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 flex-shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-lg sm:text-xl text-slate-100 tracking-tight">
                  Simulador PMPE
                </span>
                <span className="text-xs font-semibold tracking-wide px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Banca AOCP
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Soldado da Polícia Militar de Pernambuco</p>
            </div>
          </div>

          {/* Navigation - Segmented Pills */}
          <nav className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-sm sm:text-base font-medium transition-all duration-200 cursor-pointer relative ${
                    isActive
                      ? 'bg-white/10 text-white shadow-md font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">{item.label}</span>

                  {item.count !== undefined && item.count > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-xs bg-white/[0.08] text-slate-300 border border-white/[0.1] font-mono">
                      {item.count}
                    </span>
                  )}

                  {item.badge && (
                    <span className="w-2 h-2 bg-amber-400 rounded-full" title="Configuração pendente" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
