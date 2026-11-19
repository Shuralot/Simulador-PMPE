// Selo de confiança mostrado ao aluno: quanto dá para confiar no gabarito de cada questão.
export const SELOS = {
  oficial: { nivel: 'oficial', rotulo: 'Prova oficial', ajuda: 'Gabarito oficial da banca.' },
  realConferida: { nivel: 'conferida', rotulo: 'Banca real • gabarito conferido', ajuda: 'Questão real de concurso (da sua apostila). O gabarito da apostila foi confirmado por uma resolução independente da IA; não é o gabarito oficial.' },
  revisada: { nivel: 'revisada', rotulo: 'Revisada por você', ajuda: 'Você confirmou este gabarito.' },
  conferida: { nivel: 'conferida', rotulo: 'Inédita • com fonte', ajuda: 'Resolvida de forma independente pela IA, com base no texto da lei (artigo conferido) ou da sua apostila.' },
  ia: { nivel: 'ia', rotulo: 'Inédita • verificada pela IA', ajuda: 'Resolvida de forma independente pela IA, sem texto de apoio para conferir. Use com cautela.' },
  treino: { nivel: 'treino', rotulo: 'Inédita • treino', ajuda: 'Não verificada. Não decore o gabarito sem conferir na lei.' }
};

export function seloConfianca(q = {}) {
  const origem = String(q.origem || q.tipo || '').toUpperCase();
  if (origem.includes('REAL')) return (q.gabaritoFonte && !q.revisada) ? SELOS.realConferida : (q.revisada ? SELOS.revisada : SELOS.oficial);
  if (q.revisada) return SELOS.revisada;
  const verificada = Boolean(q.verificada) || q.verificacao === 'OK';
  if (verificada && (q.refConferida || q.ref_conferida)) return SELOS.conferida;
  if (verificada) return SELOS.ia;
  return SELOS.treino;
}
