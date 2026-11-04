import React, { useState } from 'react';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import { testApiKey, saveApiKey, removeApiKey, saveSelectedModel, DEFAULT_MODEL } from '../services/geminiService';
import { savePreferences, resetPreferences } from '../services/preferencesService';
import { saveApiKeyToDB } from '../services/api';

const MODELOS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (recomendado)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' }
];
const OUTRO = '__outro__';

const selectCls = 'rounded-lg bg-white/[0.05] border border-white/[0.1] px-3 py-2 text-base text-slate-100 focus:outline-none focus:border-indigo-400/70';

function Secao({ titulo, children }) {
  return (
    <section className="space-y-1">
      <h2 className="text-sm font-semibold text-slate-400 pb-2">{titulo}</h2>
      <div className="divide-y divide-white/[0.06]">{children}</div>
    </section>
  );
}

function Linha({ titulo, descricao, children }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-base text-slate-100">{titulo}</div>
        {descricao && <div className="text-sm text-slate-500 mt-0.5">{descricao}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Interruptor({ ativo, onChange, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ativo}
      aria-label={rotulo}
      onClick={() => onChange(!ativo)}
      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${ativo ? 'bg-indigo-500' : 'bg-white/[0.12]'}`}
    >
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${ativo ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function SettingsTab({ apiKey, setApiKey, model = DEFAULT_MODEL, setModel, preferences, setPreferences }) {
  const [inputKey, setInputKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [isEditingKey, setIsEditingKey] = useState(!apiKey);
  const [outroModelo, setOutroModelo] = useState('');

  const modeloConhecido = MODELOS.some((m) => m.id === model);

  const handlePrefChange = (field, value) => setPreferences(savePreferences({ [field]: value }));

  const escolherModelo = (id) => {
    if (id === OUTRO) {
      setOutroModelo(modeloConhecido ? '' : model);
      setModel('');
      return;
    }
    saveSelectedModel(id);
    setModel(id);
  };

  const aplicarOutroModelo = () => {
    const id = outroModelo.trim();
    if (!id) return;
    saveSelectedModel(id);
    setModel(id);
    setStatus({ type: 'success', message: `Modelo definido para ${id}` });
  };

  const handleSaveAndTest = async (e) => {
    e?.preventDefault();
    const cleanKey = inputKey.trim();
    if (!cleanKey) {
      setStatus({ type: 'error', message: 'Insira uma chave de API válida.' });
      return;
    }

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

    const activeModel = model || DEFAULT_MODEL;
    try {
      const result = await testApiKey(cleanKey, activeModel);
      const confirmedModel = result.usedModel || activeModel;
      saveSelectedModel(confirmedModel);
      setModel(confirmedModel);
      setStatus({
        type: 'success',
        message: result.isFallback
          ? `Chave salva. O ${result.originalRequested} estava indisponível, então a conexão foi confirmada via ${confirmedModel}.`
          : `Chave validada. Conexão ativa com ${confirmedModel}.`
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Falha ao validar a chave. Verifique a chave ou sua conexão.' });
      setIsEditingKey(true);
    } finally {
      setTesting(false);
    }
  };

  const handleRemoveKey = () => {
    if (window.confirm('Desconectar e remover sua chave de API?')) {
      removeApiKey();
      setApiKey('');
      setInputKey('');
      setIsEditingKey(true);
      setStatus({ type: 'success', message: 'Chave removida.' });
    }
  };

  const handleResetPreferences = () => {
    if (window.confirm('Restaurar todas as opções para o padrão?')) {
      setPreferences(resetPreferences());
      setModel(DEFAULT_MODEL);
      saveSelectedModel(DEFAULT_MODEL);
      setStatus({ type: 'success', message: 'Opções restauradas para o padrão.' });
    }
  };

  const mascara = apiKey ? `${apiKey.slice(0, 6)}••••••••${apiKey.slice(-4)}` : '';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 w-full space-y-10">
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">Opções</h1>

      {status && (
        <div
          role="status"
          className={`text-base ${status.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {status.message}
        </div>
      )}

      <Secao titulo="Inteligência artificial (opcional)">
        <div className="py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-base text-slate-100">Chave do Google Gemini</div>
              <div className="text-sm text-slate-500 mt-0.5">
                Só para gerar questões inéditas. Fica guardada neste computador.{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200">
                  Obter chave <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {!isEditingKey && apiKey ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-4 py-3">
              <span className="font-mono text-sm text-slate-300 truncate">{showKey ? apiKey : mascara}</span>
              <div className="flex items-center gap-3 shrink-0 text-sm">
                <button type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => setIsEditingKey(true)} className="text-slate-300 hover:text-white cursor-pointer">Trocar</button>
                <button type="button" onClick={handleRemoveKey} className="text-rose-400 hover:text-rose-300 cursor-pointer">Remover</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveAndTest} className="flex gap-2">
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="AIza..."
                autoComplete="off"
                className={`${selectCls} flex-1 font-mono text-sm`}
              />
              <button type="submit" disabled={testing} className="px-4 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-medium disabled:opacity-60 cursor-pointer">
                {testing ? 'Testando...' : 'Salvar e testar'}
              </button>
            </form>
          )}
        </div>

        <Linha titulo="Modelo">
          <div className="flex flex-col items-end gap-2">
            <select value={modeloConhecido ? model : OUTRO} onChange={(e) => escolherModelo(e.target.value)} className={selectCls}>
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              <option value={OUTRO}>Outro identificador...</option>
            </select>
            {!modeloConhecido && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={outroModelo}
                  onChange={(e) => setOutroModelo(e.target.value)}
                  placeholder="gemini-..."
                  className={`${selectCls} w-48 font-mono text-sm`}
                />
                <button type="button" onClick={aplicarOutroModelo} className="px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-slate-100 cursor-pointer">Aplicar</button>
              </div>
            )}
          </div>
        </Linha>
      </Secao>

      <Secao titulo="Questões geradas pela IA">
        <Linha titulo="Origem das questões" descricao="Quanto vem da IA e quanto vem de provas reais.">
          <select value={preferences.proporcao} onChange={(e) => handlePrefChange('proporcao', e.target.value)} className={selectCls}>
            <option value="3:1">75% inéditas, 25% reais</option>
            <option value="1:1">50% inéditas, 50% reais</option>
            <option value="100:0">Só inéditas</option>
            <option value="0:100">Só reais</option>
          </select>
        </Linha>
        <Linha titulo="Dificuldade">
          <select value={preferences.dificuldade} onChange={(e) => handlePrefChange('dificuldade', e.target.value)} className={selectCls}>
            <option value="mista">Variada</option>
            <option value="media">Padrão da prova</option>
            <option value="dificil">Difícil</option>
          </select>
        </Linha>
        <Linha titulo="Fidelidade à lei" descricao="Menor = mais literal; maior = cenários mais variados.">
          <select value={preferences.temperatura} onChange={(e) => handlePrefChange('temperatura', Number(e.target.value))} className={selectCls}>
            <option value={0.2}>Estrita</option>
            <option value={0.3}>Equilibrada</option>
            <option value={0.6}>Variada</option>
          </select>
        </Linha>
        <Linha titulo="Contexto de Pernambuco" descricao="Cenários com municípios de PE e a rotina da PMPE.">
          <Interruptor ativo={!!preferences.focoPMPE} onChange={(v) => handlePrefChange('focoPMPE', v)} rotulo="Contexto de Pernambuco" />
        </Linha>
      </Secao>

      <Secao titulo="Durante a resolução">
        <Linha titulo="Botão de dica" descricao="Mostra pistas sem revelar a resposta.">
          <Interruptor ativo={!!preferences.mostrarDica} onChange={(v) => handlePrefChange('mostrarDica', v)} rotulo="Botão de dica" />
        </Linha>
        <Linha titulo="Abrir justificativa ao responder" descricao="No modo estudo, mostra a fundamentação logo após a resposta.">
          <Interruptor ativo={!!preferences.autoExpandirMotivo} onChange={(v) => handlePrefChange('autoExpandirMotivo', v)} rotulo="Abrir justificativa ao responder" />
        </Linha>
        <Linha titulo="Tamanho do texto">
          <select value={preferences.tamanhoFonte} onChange={(e) => handlePrefChange('tamanhoFonte', e.target.value)} className={selectCls}>
            <option value="normal">Normal</option>
            <option value="grande">Médio</option>
            <option value="extragrande">Grande</option>
          </select>
        </Linha>
      </Secao>

      <div>
        <button type="button" onClick={handleResetPreferences} className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer">
          Restaurar padrões
        </button>
      </div>
    </div>
  );
}
