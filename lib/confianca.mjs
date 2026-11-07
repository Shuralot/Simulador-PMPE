// Selo de confiança mostrado ao aluno: quanto dá para confiar no gabarito de cada questão.
export const SELOS = {
  oficial: { nivel: 'oficial', rotulo: 'Prova oficial', ajuda: 'Gabarito oficial da banca.' },
  revisada: { nivel: 'revisada', rotulo: 'Revisada por você', ajuda: 'Você confirmou este gabarito.' },
  conferida: { nivel: 'conferida', rotulo: 'Inédita • conferida', ajuda: 'Resolvida de forma independente pela IA e com o artigo citado conferido na lei.' },
  ia: { nivel: 'ia', rotulo: 'Inédita • verificada pela IA', ajuda: 'Resolvida de forma independente pela IA, sem texto de lei para conferir. Use com cautela.' },
  treino: { nivel: 'treino', rotulo: 'Inédita • treino', ajuda: 'Não verificada. Não decore o gabarito sem conferir na lei.' }
};

export function seloConfianca(q = {}) {
  const origem = String(q.origem || q.tipo || '').toUpperCase();
  if (origem.includes('REAL')) return SELOS.oficial;
  if (q.revisada) return SELOS.revisada;
  const verificada = Boolean(q.verificada) || q.verificacao === 'OK';
  if (verificada && (q.refConferida || q.ref_conferida)) return SELOS.conferida;
  if (verificada) return SELOS.ia;
  return SELOS.treino;
}
