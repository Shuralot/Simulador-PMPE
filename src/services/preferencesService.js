// Gerenciamento de Opções e Preferências do Usuário
const STORAGE_KEY_PREFS = 'simulador_pmpe_prefs';

export const DEFAULT_PREFERENCES = {
  // Proporção de questões
  proporcao: '3:1', // '3:1' (75% inéditas / 25% reais) | '1:1' (50/50) | '100:0' (apenas inéditas) | '0:100' (apenas reais)
  
  // Dificuldade padrão
  dificuldade: 'mista', // 'mista' | 'facil' | 'media' | 'dificil'
  
  // IA & Criatividade
  temperatura: 0.3, // 0.2 (Rigor estrito à lei) | 0.4 (Equilibrado) | 0.7 (Mais criativo)
  focoPMPE: true, // Contextualizar cenários com Pernambuco e PMPE
  
  // Interface e Estudo
  mostrarDica: true, // Exibir botão/dropdown de dica de estudo
  autoExpandirMotivo: true, // Abrir explicação automaticamente ao responder
  mostrarAnaliseDistratores: true, // Explicar o erro de cada uma das 4 alternativas erradas
  tamanhoFonte: 'normal', // 'normal' | 'grande' | 'extragrande'
};

export function getPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch (err) {
    console.error('Erro ao ler preferências:', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(newPrefs) {
  try {
    const current = getPreferences();
    const merged = { ...current, ...newPrefs };
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(merged));
    return merged;
  } catch (err) {
    console.error('Erro ao salvar preferências:', err);
    return DEFAULT_PREFERENCES;
  }
}

export function resetPreferences() {
  localStorage.removeItem(STORAGE_KEY_PREFS);
  return { ...DEFAULT_PREFERENCES };
}
