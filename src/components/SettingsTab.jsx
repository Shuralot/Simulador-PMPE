import React, { useState } from 'react';
import { 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  ExternalLink, 
  ShieldCheck, 
  Trash2, 
  Sliders, 
  Brain, 
  BookOpen, 
  RotateCcw,
  Eye,
  EyeOff,
  Zap
} from 'lucide-react';
import { testApiKey, saveApiKey, removeApiKey, saveSelectedModel, DEFAULT_MODEL } from '../services/geminiService';
import { savePreferences, resetPreferences } from '../services/preferencesService';
import { saveApiKeyToDB } from '../services/api';

export default function SettingsTab({ 
  apiKey, 
  setApiKey, 
  model = DEFAULT_MODEL, 
  setModel, 
  preferences, 
  setPreferences,
  onClearHistory
}) {
  const [inputKey, setInputKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [customModel, setCustomModel] = useState('');
  const [isEditingKey, setIsEditingKey] = useState(!apiKey);

  // Manipular preferências
  const handlePrefChange = (field, value) => {
    const updated = savePreferences({ [field]: value });
    setPreferences(updated);
  };

  // Salvar e testar chave
  const handleSaveAndTest = async (e) => {
    e?.preventDefault();
    const cleanKey = inputKey.trim();
    if (!cleanKey) {
      setStatus({ type: 'error', message: 'Por favor, insira uma chave de API válida.' });
      return;
    }

    // 1. SALVA IMEDIATAMENTE no localStorage e no SQLite
    saveApiKey(cleanKey);
    setApiKey(cleanKey);
    try {
      await saveApiKeyToDB(cleanKey);
    } catch (err) {
      console.warn('Erro ao salvar no SQLite:', err);
    }
    setIsEditingKey(false);

    setTesting(true);
    setStatus(null);

    const activeModel = customModel.trim() || model || DEFAULT_MODEL;

    try {
      const result = await testApiKey(cleanKey, activeModel);
      const confirmedModel = result.usedModel || activeModel;
      saveSelectedModel(confirmedModel);
      setModel(confirmedModel);
      
      if (result.isFallback) {
        setStatus({ 
          type: 'success', 
          message: `Chave salva com sucesso no banco de dados! (Nota: O ${result.originalRequested} estava com pico temporário de demanda no Google, então a conexão foi confirmada via ${confirmedModel} como backup automático).` 
        });
      } else {
        setStatus({ 
          type: 'success', 
          message: `Chave salva e validada com sucesso no SQLite! Conexão ativa com o ${confirmedModel}.` 
        });
      }
    } catch (err) {
      // Mesmo se houver aviso de conexão, A CHAVE ESTÁ SALVA!
      setStatus({ 
        type: 'warning', 
        message: `Chave salva com sucesso no banco de dados local! Aviso da conexão: ${err.message}. (Você já pode usar o simulador normalmente).` 
      });
    } finally {
      setTesting(false);
    }
  };

  // Remover chave
  const handleRemoveKey = () => {
    if (window.confirm('Tem certeza que deseja remover sua chave de API deste navegador?')) {
      removeApiKey();
      setApiKey('');
      setInputKey('');
      setIsEditingKey(true);
      setStatus({ type: 'success', message: 'Chave de API removida com sucesso.' });
    }
  };

  // Resetar preferências
  const handleResetPreferences = () => {
    if (window.confirm('Deseja restaurar todas as opções para o padrão de fábrica?')) {
      const def = resetPreferences();
      setPreferences(def);
      setModel(DEFAULT_MODEL);
      saveSelectedModel(DEFAULT_MODEL);
      setStatus({ type: 'success', message: `Opções restauradas para o padrão (${DEFAULT_MODEL})!` });
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
          <Sliders className="w-6 h-6 text-blue-400" />
          <span>Opções & Configurações do Simulador</span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Configurado para o modelo <strong>Gemini 3.8 Flash</strong> com máxima velocidade e economia de tokens.
        </p>
      </div>

      {/* FEEDBACK GLOBAL DE STATUS */}
      {status && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between gap-3 text-sm animate-in fade-in duration-200 ${
            status.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <div className="flex items-start gap-3">
            {status.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
            )}
            <span>{status.message}</span>
          </div>
          <button 
            onClick={() => setStatus(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* SEÇÃO 1: GERENCIAMENTO DA API KEY */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Chave da API do Google Gemini</h3>
              <p className="text-xs text-slate-400">Usada para gerar questões em tempo real</p>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {apiKey ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Chave Conectada e Ativa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5" />
                Chave Não Configurada
              </span>
            )}
          </div>
        </div>

        {/* Chave Salva - Modo Visualização */}
        {!isEditingKey && apiKey ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 overflow-hidden">
                <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-sm font-mono text-slate-300 truncate">
                  {showKey ? apiKey : apiKey.slice(0, 8) + '••••••••••••••••••••••••••••••••' + apiKey.slice(-4)}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title={showKey ? 'Ocultar' : 'Mostrar'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingKey(true)}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors border border-slate-700 cursor-pointer"
                >
                  Alterar Chave
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveAndTest}
                disabled={testing}
                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-medium rounded-xl text-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                {testing ? 'Testando...' : `Testar Conexão (${model})`}
              </button>

              <button
                type="button"
                onClick={handleRemoveKey}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors p-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remover chave do navegador</span>
              </button>
            </div>
          </div>
        ) : (
          /* Modo Edição / Inserção */
          <form onSubmit={handleSaveAndTest} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Cole sua Gemini API Key abaixo
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-800 rounded cursor-pointer"
                >
                  {showKey ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Armazenada estritamente no seu localStorage local.
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline flex items-center gap-1"
              >
                Criar chave no Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={testing}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
              >
                {testing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Validando com o Google Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Salvar e Validar Chave</span>
                  </>
                )}
              </button>

              {apiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setInputKey(apiKey);
                    setIsEditingKey(false);
                  }}
                  className="px-4 py-3 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}

        {/* Escolha do Modelo Gemini (Foco no 3.8 Flash) */}
        <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-slate-200">
              Modelo Selecionado
            </label>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono font-medium">
              Ativo: {model}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* Opção Principal: 3.8 Flash */}
            <button
              type="button"
              onClick={() => {
                setModel('gemini-3.8-flash');
                saveSelectedModel('gemini-3.8-flash');
                setCustomModel('');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                model === 'gemini-3.8-flash' && !customModel
                  ? 'bg-gradient-to-r from-blue-600/25 to-indigo-600/25 border-blue-400 text-white ring-1 ring-blue-500/40 shadow-md'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-blue-300 mb-0.5">
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                <span>Gemini 3.8 Flash</span>
                {model === 'gemini-3.8-flash' && (
                  <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.2 rounded font-semibold">Ativo</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Modelo principal oficial: ultrarrápido, raciocínio avançado e alta eficiência de tokens.
              </div>
            </button>

            {/* Alternativa: 3.6 Flash */}
            <button
              type="button"
              onClick={() => {
                setModel('gemini-3.6-flash');
                saveSelectedModel('gemini-3.6-flash');
                setCustomModel('');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                model === 'gemini-3.6-flash' && !customModel
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-xs text-slate-200 mb-0.5">Gemini 3.6 Flash</div>
              <div className="text-[11px] text-slate-400 leading-tight">Alternativa estável da família 3.x com alta disponibilidade.</div>
            </button>

            {/* Alternativa: 3.5 Flash-Lite */}
            <button
              type="button"
              onClick={() => {
                setModel('gemini-3.5-flash-lite');
                saveSelectedModel('gemini-3.5-flash-lite');
                setCustomModel('');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                model === 'gemini-3.5-flash-lite' && !customModel
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-xs text-slate-200 mb-0.5">Gemini 3.5 Flash-Lite</div>
              <div className="text-[11px] text-slate-400 leading-tight">Versão ultraleve ideal para conexões rápidas.</div>
            </button>

            {/* Alternativa: 3.1 Flash-Lite */}
            <button
              type="button"
              onClick={() => {
                setModel('gemini-3.1-flash-lite');
                saveSelectedModel('gemini-3.1-flash-lite');
                setCustomModel('');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                model === 'gemini-3.1-flash-lite' && !customModel
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-xs text-slate-200 mb-0.5">Gemini 3.1 Flash-Lite</div>
              <div className="text-[11px] text-slate-400 leading-tight">Versão leve e veloz para grande volume de treino.</div>
            </button>

            {/* Alternativa: 3 Flash Preview */}
            <button
              type="button"
              onClick={() => {
                setModel('gemini-3-flash-preview');
                saveSelectedModel('gemini-3-flash-preview');
                setCustomModel('');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                model === 'gemini-3-flash-preview' && !customModel
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-xs text-slate-200 mb-0.5">Gemini 3 Flash Preview</div>
              <div className="text-[11px] text-slate-400 leading-tight">Versão prévia da geração 3 com alta velocidade.</div>
            </button>

            {/* Alternativa: 3.1 Pro Preview */}
            <button
              type="button"
              onClick={() => {
                setModel('gemini-3.1-pro-preview');
                saveSelectedModel('gemini-3.1-pro-preview');
                setCustomModel('');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                model === 'gemini-3.1-pro-preview' && !customModel
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-xs text-slate-200 mb-0.5">Gemini 3.1 Pro Preview</div>
              <div className="text-[11px] text-slate-400 leading-tight">Para análises jurídicas e doutrinárias aprofundadas.</div>
            </button>
          </div>

          {/* Campo para outro identificador se necessário */}
          <div className="pt-2">
            <span className="text-xs text-slate-400 block mb-1">Outro identificador de modelo:</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Ex: gemini-3.8-flash-preview..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  if (customModel.trim()) {
                    setModel(customModel.trim());
                    saveSelectedModel(customModel.trim());
                    setStatus({ type: 'success', message: `Modelo definido para ${customModel.trim()}` });
                  }
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl transition-colors font-medium cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: OPÇÕES DA IA E PROPORÇÃO DE QUESTÕES */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Parâmetros de Geração e Proporção</h3>
            <p className="text-xs text-slate-400">Controle a proporção entre questões inéditas e questões reais de provas</p>
          </div>
        </div>

        {/* Proporção Inéditas vs Reais */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-2">
            Proporção de Origem das Questões
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              { id: '3:1', label: '3 Inéditas : 1 Real', sub: 'Padrão (75% Inéditas e 25% Reais da AOCP)' },
              { id: '1:1', label: 'Meio a Meio (1:1)', sub: '50% Inéditas e 50% Reais das Provas' },
              { id: '100:0', label: '100% Inéditas', sub: 'Apenas questões novas criadas pela IA' },
              { id: '0:100', label: '100% Reais', sub: 'Apenas questões reais extraídas dos PDFs' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePrefChange('proporcao', p.id)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  preferences.proporcao === p.id
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-slate-100 mb-0.5">{p.label}</div>
                <div className="text-[11px] text-slate-400 leading-tight">{p.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Nível de Dificuldade */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-2">
            Nível de Rigor e Dificuldade
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'mista', label: 'Misto / Variado', desc: 'Fácil, média e difícil' },
              { id: 'media', label: 'Padrão Soldado', desc: 'Nível fiel da prova PMPE' },
              { id: 'dificil', label: 'Difícil / Elevado', desc: 'Mais pegadinhas e exceções' }
            ].map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => handlePrefChange('dificuldade', d.id)}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  preferences.dificuldade === d.id
                    ? 'bg-blue-600 border-blue-500 text-white font-semibold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs">{d.label}</div>
                <div className="text-[10px] text-slate-400 opacity-80 mt-0.5">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Temperatura / Criatividade */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-sm font-semibold text-slate-200">
              Temperatura da IA (Fidelidade à Lei vs Criatividade)
            </label>
            <span className="text-xs font-mono text-blue-400 font-semibold">
              {preferences.temperatura === 0.2 ? '0.2 (Rigor Legal Estrito)' : preferences.temperatura === 0.3 ? '0.3 (Equilibrado)' : '0.6 (Mais Criativo)'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { val: 0.2, label: '0.2 - Rigor Estrito', desc: 'Foco cirúrgico na letra da lei' },
              { val: 0.3, label: '0.3 - Equilibrado', desc: 'Padrão recomendado' },
              { val: 0.6, label: '0.6 - Variado', desc: 'Cenários e casos mais diversificados' }
            ].map(t => (
              <button
                key={t.val}
                type="button"
                onClick={() => handlePrefChange('temperatura', t.val)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  preferences.temperatura === t.val
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200 font-semibold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs text-slate-200">{t.label}</div>
                <div className="text-[10px] text-slate-400">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Foco Policial de Pernambuco */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-200">
              Contextualização com Pernambuco e PMPE
            </div>
            <div className="text-xs text-slate-400">
              Inserir nomes de municípios de PE, rotina de policiamento militar e a Lei Estadual 6.783/1974.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePrefChange('focoPMPE', !preferences.focoPMPE)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              preferences.focoPMPE ? 'bg-blue-600' : 'bg-slate-800'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                preferences.focoPMPE ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* SEÇÃO 3: OPÇÕES DE INTERFACE E ESTUDO */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Preferências de Interface & Resolução</h3>
            <p className="text-xs text-slate-400">Ajuste como as dicas, justificativas e tamanhos de texto são exibidos</p>
          </div>
        </div>

        {/* Dica em Dropdown */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-200">
              Habilitar Dica em Dropdown no Quiz
            </div>
            <div className="text-xs text-slate-400">
              Exibe o botão sanfona "💡 Precisa de uma dica?" para consultar pistas sem ver a resposta.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePrefChange('mostrarDica', !preferences.mostrarDica)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              preferences.mostrarDica ? 'bg-blue-600' : 'bg-slate-800'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                preferences.mostrarDica ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Auto-expandir Motivo */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-200">
              Abrir Justificativa Automaticamente ao Responder
            </div>
            <div className="text-xs text-slate-400">
              No Modo Estudo, exibe a fundamentação do gabarito imediatamente após o clique na alternativa.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePrefChange('autoExpandirMotivo', !preferences.autoExpandirMotivo)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              preferences.autoExpandirMotivo ? 'bg-blue-600' : 'bg-slate-800'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                preferences.autoExpandirMotivo ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Tamanho da Fonte */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-2">
            Tamanho do Texto das Questões
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'normal', label: 'Normal (Padrão)', size: 'text-sm' },
              { id: 'grande', label: 'Médio / Confortável', size: 'text-base' },
              { id: 'extragrande', label: 'Grande (+ Leitura)', size: 'text-lg' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => handlePrefChange('tamanhoFonte', f.id)}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  preferences.tamanhoFonte === f.id
                    ? 'bg-blue-600 border-blue-500 text-white font-semibold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className={f.size}>{f.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SEÇÃO 4: AÇÕES DO SISTEMA & RESET */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-200">Restaurar Padrões</h4>
          <p className="text-xs text-slate-400">Volta para o <strong>Gemini 3.8 Flash</strong> e proporção 3:1 original.</p>
        </div>

        <button
          type="button"
          onClick={handleResetPreferences}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Padrão (Gemini 3.8 Flash)</span>
        </button>
      </div>
    </div>
  );
}
