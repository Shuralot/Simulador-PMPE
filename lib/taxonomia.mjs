import { normalizeText } from './texto.mjs';

// Taxonomia única de tópicos do edital. Palavras-chave já normalizadas (minúsculas, sem acento, sem pontuação).
export const TOPICOS_EDITAL = {
  'Língua Portuguesa': [
    { topico: 'Interpretação de Texto', palavras: ['interpretacao', 'ideia central', 'inferencia', 'tema do texto', 'tese', 'argumento do autor', 'segundo o texto', 'de acordo com o texto', 'compreensao', 'intencao do autor'] },
    { topico: 'Crase', palavras: ['crase', 'acento grave'] },
    { topico: 'Pontuação', palavras: ['virgula', 'ponto e virgula', 'travessao', 'aspas', 'pontuacao', 'dois pontos', 'reticencias'] },
    { topico: 'Concordância', palavras: ['concordancia', 'concorda', 'concordam'] },
    { topico: 'Regência', palavras: ['regencia', 'regente', 'preposicao exigida', 'transitivo'] },
    { topico: 'Coesão e Conectivos', palavras: ['coesao', 'conectivo', 'conjuncao', 'pronome relativo', 'referente', 'articulador', 'coesivo'] },
    { topico: 'Ortografia e Acentuação', palavras: ['ortografia', 'acentuacao', 'acento', 'grafia', 'hifen', 'grafada'] },
    { topico: 'Morfologia', palavras: ['substantivo', 'adjetivo', 'adverbio', 'classe gramatical', 'morfologia', 'formacao de palavras', 'prefixo', 'sufixo', 'pronome', 'verbo', 'locucao'] },
    { topico: 'Sintaxe', palavras: ['sujeito', 'predicado', 'oracao', 'complemento', 'adjunto', 'periodo', 'aposto', 'vocativo', 'subordinada'] },
    { topico: 'Semântica e Figuras', palavras: ['sinonimo', 'antonimo', 'figura de linguagem', 'metafora', 'ironia', 'denotacao', 'conotacao', 'polissemia', 'ambiguidade'] },
    { topico: 'Reescrita', palavras: ['reescrita', 'reescreva', 'substituicao', 'sem alteracao de sentido', 'equivalente'] },
    { topico: 'Redação Oficial', palavras: ['oficio', 'memorando', 'redacao oficial', 'pronome de tratamento', 'requerimento', 'manual de redacao'] }
  ],
  'História de Pernambuco': [
    { topico: 'Domínio Holandês', palavras: ['holandes', 'holandeses', 'nassau', 'neerlandes', 'insurreicao pernambucana', 'guararapes', 'companhia das indias', 'beberibe'] },
    { topico: 'Período Colonial e Açúcar', palavras: ['capitania', 'duarte coelho', 'acucar', 'engenho', 'donatario', 'colonial', 'colonizacao'] },
    { topico: 'Guerra dos Mascates', palavras: ['mascates', 'guerra dos mascates', '1710', '1711'] },
    { topico: 'Revolução de 1817', palavras: ['1817', 'revolucao pernambucana'] },
    { topico: 'Confederação do Equador', palavras: ['confederacao do equador', '1824', 'frei caneca'] },
    { topico: 'Praieira e Cabanos', palavras: ['praieira', 'cabanos', 'cabanada', '1848'] },
    { topico: 'Período Republicano', palavras: ['republica', 'coronelismo', 'ligas camponesas', 'getulio', '1930', 'estado novo', 'ditadura'] },
    { topico: 'Cultura e Patrimônio', palavras: ['frevo', 'maracatu', 'patrimonio', 'folclore', 'carnaval', 'cultura pernambucana', 'cavalo marinho'] },
    { topico: 'Geografia e Economia de PE', palavras: ['sertao', 'agreste', 'zona da mata', 'regiao metropolitana', 'municipio', 'fernando de noronha', 'suape', 'sao francisco'] }
  ],
  'Raciocínio Lógico-Matemático': [
    { topico: 'Lógica Proposicional', palavras: ['proposicao', 'proposicoes', 'negacao', 'equivalencia', 'tabela verdade', 'condicional', 'bicondicional', 'contradicao', 'tautologia', 'conectivo logico', 'se entao'] },
    { topico: 'Argumentação e Diagramas', palavras: ['silogismo', 'diagrama', 'conjunto', 'conjuntos', 'argumento valido', 'todo', 'algum', 'nenhum', 'premissa'] },
    { topico: 'Probabilidade', palavras: ['probabilidade', 'chance', 'sorteio', 'espaco amostral'] },
    { topico: 'Análise Combinatória', palavras: ['combinacao', 'arranjo', 'permutacao', 'anagrama', 'fatorial', 'principio multiplicativo', 'combinatoria'] },
    { topico: 'Porcentagem e Proporção', palavras: ['porcentagem', 'percentual', 'razao', 'proporcao', 'regra de tres', 'juros', 'desconto', 'proporcional'] },
    { topico: 'Sequências e Padrões', palavras: ['sequencia', 'progressao', 'padrao', 'termo geral', 'proximo termo'] },
    { topico: 'Geometria e Medidas', palavras: ['area', 'perimetro', 'volume', 'triangulo', 'angulo', 'circulo', 'retangulo', 'velocidade', 'litros', 'metros'] },
    { topico: 'Álgebra e Equações', palavras: ['equacao', 'sistema de equacoes', 'funcao', 'inequacao', 'raiz', 'incognita'] },
    { topico: 'Estatística', palavras: ['media', 'mediana', 'moda', 'desvio', 'grafico', 'estatistica'] }
  ],
  'Informática': [
    { topico: 'Segurança da Informação', palavras: ['malware', 'virus', 'phishing', 'firewall', 'criptografia', 'backup', 'antivirus', 'ransomware', 'senha', 'seguranca da informacao', 'worm', 'trojan', 'spyware'] },
    { topico: 'Windows', palavras: ['windows', 'explorador de arquivos', 'area de trabalho', 'painel de controle', 'gerenciador de tarefas'] },
    { topico: 'Editores de Texto', palavras: ['word', 'writer', 'documento de texto', 'formatacao de paragrafo', 'editor de texto'] },
    { topico: 'Planilhas', palavras: ['excel', 'calc', 'planilha', 'formula', 'celula', 'procv', 'soma'] },
    { topico: 'Redes e Internet', palavras: ['rede', 'redes', 'internet', 'navegador', 'protocolo', 'dns', 'http', 'https', 'email', 'nuvem', 'wifi', 'ip', 'lan', 'wan'] },
    { topico: 'Hardware e Software', palavras: ['hardware', 'memoria', 'processador', 'hd', 'ssd', 'software', 'sistema operacional', 'linux', 'ram'] },
    { topico: 'Apresentações', palavras: ['powerpoint', 'impress', 'slide', 'slides', 'apresentacao'] }
  ],
  'Direito Constitucional': [
    { topico: 'Direitos e Garantias Fundamentais', palavras: ['art 5', 'direitos individuais', 'garantias fundamentais', 'direitos e deveres', 'inviolabilidade', 'direitos fundamentais', 'liberdade'] },
    { topico: 'Remédios Constitucionais', palavras: ['habeas corpus', 'habeas data', 'mandado de seguranca', 'mandado de injuncao', 'acao popular'] },
    { topico: 'Direitos Sociais, Nacionalidade e Políticos', palavras: ['direitos sociais', 'nacionalidade', 'brasileiro nato', 'naturalizado', 'direitos politicos', 'partidos politicos', 'art 6', 'art 7'] },
    { topico: 'Segurança Pública', palavras: ['seguranca publica', 'art 144', 'policia militar', 'policia civil', 'bombeiro', 'policia federal', 'ordem publica', 'policias penais'] },
    { topico: 'Organização do Estado', palavras: ['uniao', 'estados', 'municipios', 'competencia', 'federacao', 'intervencao', 'bens da uniao', 'distrito federal'] },
    { topico: 'Poderes da República', palavras: ['poder legislativo', 'poder executivo', 'poder judiciario', 'congresso', 'presidente da republica', 'stf', 'ministerio publico', 'processo legislativo', 'senado', 'camara dos deputados'] },
    { topico: 'Defesa do Estado', palavras: ['estado de defesa', 'estado de sitio', 'forcas armadas', 'defesa do estado'] },
    { topico: 'Princípios e Aplicabilidade', palavras: ['principios fundamentais', 'art 1', 'art 3', 'eficacia', 'aplicabilidade', 'poder constituinte', 'emenda constitucional', 'supremacia'] },
    { topico: 'Administração Pública e Servidores', palavras: ['administracao publica', 'art 37', 'servidores publicos', 'militares dos estados', 'concurso publico'] }
  ],
  'Direitos Humanos e Legislação Extravagante': [
    { topico: 'Tortura', palavras: ['tortura', '9 455'] },
    { topico: 'Abuso de Autoridade', palavras: ['abuso de autoridade', '13 869'] },
    { topico: 'Lei Maria da Penha', palavras: ['maria da penha', 'violencia domestica', '11 340'] },
    { topico: 'Lei de Drogas', palavras: ['drogas', '11 343', 'entorpecente', 'trafico'] },
    { topico: 'Crimes Hediondos', palavras: ['hediondo', 'hediondos', '8 072'] },
    { topico: 'Estatuto dos Militares de PE', palavras: ['6 783', 'estatuto dos policiais militares', 'pmpe', 'disciplina militar', 'transgressao', 'hierarquia'] },
    { topico: 'Direitos Humanos', palavras: ['direitos humanos', 'declaracao universal', 'pacto de san jose', 'convencao americana', 'onu', 'dignidade da pessoa'] },
    { topico: 'ECA', palavras: ['eca', '8 069', 'crianca', 'adolescente', 'ato infracional'] },
    { topico: 'Estatuto do Desarmamento', palavras: ['10 826', 'arma de fogo', 'desarmamento', 'sinarm'] },
    { topico: 'Trânsito', palavras: ['transito', '9 503', 'ctb', 'habilitacao'] },
    { topico: 'Racismo, Idoso e Deficiência', palavras: ['racismo', '7 716', 'idoso', '10 741', 'pessoa com deficiencia', '13 146'] },
    { topico: 'Código Penal Militar', palavras: ['codigo penal militar', 'crime militar', '1 001'] }
  ]
};

const TOPICO_PADRAO = { 'Língua Portuguesa': 'Interpretação de Texto' };

function contarAcertos(normText, palavras) {
  const alvo = ` ${normText} `;
  let n = 0;
  for (const p of palavras) if (alvo.includes(` ${p} `)) n++;
  return n;
}

// Classifica uma questão em um tópico canônico do edital. `assunto` pesa 3x mais que o enunciado.
export function classificarTopico(disciplina, assunto = '', enunciado = '') {
  const lista = TOPICOS_EDITAL[disciplina];
  if (!lista) return 'Outros';
  const normAssunto = normalizeText(assunto);
  const normEnun = normalizeText(enunciado);
  let melhor = null;
  let melhorScore = 0;
  for (const t of lista) {
    const score = contarAcertos(normAssunto, t.palavras) * 3 + contarAcertos(normEnun, t.palavras);
    if (score > melhorScore) { melhorScore = score; melhor = t.topico; }
  }
  return melhor || TOPICO_PADRAO[disciplina] || 'Outros';
}

export function listarTopicos(disciplina) {
  return (TOPICOS_EDITAL[disciplina] || []).map((t) => t.topico);
}

export const DISCIPLINAS_EDITAL = Object.keys(TOPICOS_EDITAL);
