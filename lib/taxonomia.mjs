import { normalizeText } from './texto.mjs';

// Taxonomia única de tópicos 100% alinhada ao Edital Soldado PMPE 2026 (Cargo 201 - Praça QPMG - Anexo II).
// Palavras-chave já normalizadas (minúsculas, sem acento, sem pontuação).
export const TOPICOS_EDITAL = {
  'Língua Portuguesa': [
    { topico: 'Interpretação de Texto', palavras: ['interpretacao', 'ideia central', 'inferencia', 'tema do texto', 'tese', 'argumento do autor', 'segundo o texto', 'de acordo com o texto', 'compreensao', 'intencao do autor'] },
    { topico: 'Tipologias e Gêneros Textuais', palavras: ['tipologia', 'genero textual', 'generos textuais', 'narrativo', 'dissertativo', 'injuntivo', 'descritivo', 'cronica', 'editorial', 'artigo de opiniao', 'variacao linguistica', 'colloquial', 'norma padrao'] },
    { topico: 'Crase', palavras: ['crase', 'acento grave'] },
    { topico: 'Pontuação', palavras: ['virgula', 'ponto e virgula', 'travessao', 'aspas', 'pontuacao', 'dois pontos', 'reticencias'] },
    { topico: 'Concordância', palavras: ['concordancia', 'concorda', 'concordam'] },
    { topico: 'Regência', palavras: ['regencia', 'regente', 'preposicao exigida', 'transitivo'] },
    { topico: 'Colocação Pronominal e Funções do Que/Se', palavras: ['colocacao pronominal', 'proclise', 'mesoclise', 'enclise', 'pronome oblíquo', 'funcao do que', 'funcoes do que', 'funcao do se', 'particula apassivadora', 'indice de indeterminacao'] },
    { topico: 'Coesão e Relações Semânticas', palavras: ['coesao', 'conectivo', 'conjuncao', 'pronome relativo', 'referente', 'articulador', 'coesivo', 'oposicao', 'concessao', 'causalidade', 'conclusao', 'contraste'] },
    { topico: 'Ortografia e Acentuação', palavras: ['ortografia', 'acentuacao', 'acento', 'grafia', 'hifen', 'grafada'] },
    { topico: 'Morfologia e Formação de Palavras', palavras: ['substantivo', 'adjetivo', 'adverbio', 'classe gramatical', 'classes de palavras', 'morfologia', 'formacao de palavras', 'prefixo', 'sufixo', 'pronome', 'verbo', 'locucao', 'derivacao', 'composicao'] },
    { topico: 'Sintaxe da Oração e do Período', palavras: ['sujeito', 'predicado', 'oracao', 'complemento', 'adjunto', 'periodo', 'aposto', 'vocativo', 'subordinada', 'coordenada', 'termos essenciais', 'termos integrantes'] },
    { topico: 'Semântica, Figuras e Reescrita', palavras: ['sinonimo', 'antonimo', 'significacao', 'figura de linguagem', 'metafora', 'ironia', 'denotacao', 'conotacao', 'polissemia', 'ambiguidade', 'reescrita', 'reescreva', 'substituicao', 'sem alteracao de sentido', 'equivalente'] }
  ],
  'História de Pernambuco': [
    { topico: 'Ocupação, Colonização e Açúcar', palavras: ['capitania', 'capitanias', 'duarte coelho', 'acucar', 'engenho', 'donatario', 'colonial', 'colonizacao', 'indigena', 'nativo', 'olinda e recife', 'formacao de olinda'] },
    { topico: 'Domínio Holandês e Insurreição (1654)', palavras: ['holandes', 'holandeses', 'nassau', 'mauricio de nassau', 'neerlandes', 'insurreicao pernambucana', '1654', 'guararapes', 'companhia das indias', 'wic'] },
    { topico: 'Guerra dos Mascates (1710)', palavras: ['mascates', 'guerra dos mascates', '1710', '1711', 'pelourinho', 'bernardo vieira'] },
    { topico: 'Revolução Pernambucana (1817)', palavras: ['1817', 'revolucao pernambucana', 'domingos jose martins', 'padre roma', 'leao coroado'] },
    { topico: 'Confederação do Equador (1824)', palavras: ['confederacao do equador', '1824', 'frei caneca', 'cipriano barata', 'outorgada'] },
    { topico: 'Guerra dos Cabanos e Praieira', palavras: ['praieira', 'revolucao praieira', '1848', 'cabanos', 'guerra dos cabanos', '1835', 'cabanada', 'diario novo', 'nunes machado'] },
    { topico: 'Pernambuco Republicano', palavras: ['republica', 'republicano', 'coronelismo', 'ligas camponesas', 'agamenon', 'getulio', '1930', 'estado novo', 'ditadura', 'miguel arraes', 'francisco juliao'] },
    { topico: 'Cultura Popular e Matriz Afro-Brasileira', palavras: ['frevo', 'maracatu', 'patrimonio', 'folclore', 'carnaval', 'cultura pernambucana', 'culinaria', 'festas populares', 'quilombo', 'quilombos', 'palmares', 'zumbi', 'afro brasileiro', 'afro brasileiros'] }
  ],
  'Raciocínio Lógico-Matemático': [
    { topico: 'Lógica Proposicional e Conectivos', palavras: ['proposicao', 'proposicoes', 'tabela verdade', 'condicional', 'bicondicional', 'conjuncao logica', 'disjuncao', 'tautologia', 'contradicao', 'contingencia', 'conectivo', 'se entao'] },
    { topico: 'Negação, Equivalência e Quantificadores', palavras: ['negacao', 'equivalencia', 'equivalente', 'quantificador', 'quantificadores', 'todo', 'algum', 'nenhum', 'pelo menos um', 'falacia', 'falacias', 'contrapositiva'] },
    { topico: 'Lógica de Argumentação e Dedução', palavras: ['argumentacao', 'argumento valido', 'inferencia', 'deducao', 'deducoes', 'analogia', 'premissa', 'premissas', 'conclusao', 'silogismo', 'implicacao logica'] },
    { topico: 'Diagramas Lógicos', palavras: ['diagrama', 'diagramas logicos', 'conjunto', 'conjuntos', 'intersecao', 'uniao de conjuntos', 'venn'] },
    { topico: 'Princípios de Contagem e Combinatória', palavras: ['combinacao', 'arranjo', 'permutacao', 'anagrama', 'fatorial', 'principio multiplicativo', 'combinatoria', 'contagem', 'maneiras distintas'] },
    { topico: 'Probabilidade', palavras: ['probabilidade', 'chance', 'sorteio', 'espaco amostral', 'evento aleatorio', 'dado', 'urna', 'moeda', 'porcentagem', 'razao', 'proporcao'] }
  ],
  'Informática': [
    { topico: 'Internet, Intranet e Nuvem', palavras: ['internet', 'intranet', 'navegador', 'browser', 'chrome', 'edge', 'firefox', 'protocolo', 'dns', 'http', 'https', 'email', 'nuvem', 'cloud', 'saas', 'iaas', 'paas', 'rede', 'redes'] },
    { topico: 'Segurança da Informação', palavras: ['malware', 'virus', 'phishing', 'firewall', 'criptografia', 'antivirus', 'ransomware', 'senha', 'autenticacao', 'seguranca da informacao', 'worm', 'trojan', 'spyware', 'ameaca', 'vulnerabilidade'] },
    { topico: 'Armazenamento e Backup', palavras: ['backup', 'copia de seguranca', 'incremental', 'diferencial', 'restauracao', 'armazenamento', 'pendrive', 'ssd', 'hd', 'raid'] },
    { topico: 'Arquivos, Hardware e Periféricos', palavras: ['hardware', 'memoria', 'processador', 'cpu', 'ram', 'rom', 'periferico', 'perifericos', 'entrada e saida', 'arquivo', 'arquivos', 'pasta', 'pastas', 'extensao'] },
    { topico: 'Windows 11 e Prompt de Comando', palavras: ['windows', 'windows 11', 'explorador de arquivos', 'area de trabalho', 'painel de controle', 'gerenciador de tarefas', 'prompt de comando', 'cmd', 'atalho'] },
    { topico: 'Word 2019 e LibreOffice Writer', palavras: ['word', 'writer', 'libreoffice writer', 'documento de texto', 'formatacao de paragrafo', 'editor de texto', 'mala direta', 'odt', 'docx'] },
    { topico: 'Excel 2019 e LibreOffice Calc', palavras: ['excel', 'calc', 'libreoffice calc', 'planilha', 'formula', 'funcao', 'celula', 'procv', 'soma', 'se', 'cont se', 'ods', 'xlsx'] },
    { topico: 'PowerPoint 2019 e LibreOffice Impress', palavras: ['powerpoint', 'impress', 'libreoffice impress', 'slide', 'slides', 'apresentacao', 'transicao', 'animacao', 'odp', 'pptx'] }
  ],
  'Direito Constitucional': [
    { topico: 'Princípios Fundamentais', palavras: ['principios fundamentais', 'fundamentos da republica', 'objetivos fundamentais', 'relacoes internacionais', 'soberania', 'cidadania', 'pluralismo', 'art 1', 'art 2', 'art 3', 'art 4', 'artigo 1', 'artigo 2', 'artigo 3', 'artigo 4'] },
    { topico: 'Direitos e Garantias Fundamentais', palavras: ['art 5', 'artigo 5', 'art 5o', 'artigo 5o', 'direitos individuais', 'garantias fundamentais', 'direitos e deveres', 'inviolabilidade', 'direitos fundamentais', 'liberdade', 'propriedade', 'igualdade', 'domicilio', 'sumula vinculante 14'] },
    { topico: 'Remédios Constitucionais', palavras: ['habeas corpus', 'habeas data', 'mandado de seguranca', 'mandado de injuncao', 'acao popular', 'remedios constitucionais'] },
    { topico: 'Direitos Sociais, Nacionalidade e Políticos', palavras: ['direitos sociais', 'nacionalidade', 'brasileiro nato', 'naturalizado', 'direitos politicos', 'partidos politicos', 'alistamento', 'inelegibilidade', 'art 6', 'art 7', 'art 8', 'art 12', 'art 14', 'art 17', 'artigo 6', 'artigo 12', 'artigo 14'] },
    { topico: 'Organização do Estado', palavras: ['organizacao do estado', 'politico administrativa', 'reparticao de competencias', 'competencia privativa', 'competencia concorrente', 'competencia comum', 'uniao', 'estados federados', 'municipios', 'intervencao', 'bens da uniao', 'art 18', 'art 21', 'art 22', 'art 23', 'art 24', 'art 29', 'art 30'] },
    { topico: 'Administração Pública e Servidores', palavras: ['administracao publica', 'art 37', 'artigo 37', 'art 38', 'art 39', 'art 40', 'art 41', 'art 42', 'artigo 42', 'servidores publicos', 'militares dos estados', 'concurso publico', 'acumulacao de cargos', 'improbidade', 'estabilidade'] },
    { topico: 'Poderes da República e Funções Essenciais', palavras: ['organizacao dos poderes', 'poder legislativo', 'poder executivo', 'poder judiciario', 'congresso nacional', 'presidente da republica', 'stf', 'stj', 'cnj', 'ministerio publico', 'defensoria publica', 'advocacia publica', 'funcoes essenciais', 'processo legislativo', 'senado', 'camara dos deputados', 'art 44', 'art 84', 'art 92', 'art 127', 'art 134'] },
    { topico: 'Defesa do Estado e Forças Armadas', palavras: ['estado de defesa', 'estado de sitio', 'forcas armadas', 'defesa do estado', 'art 136', 'art 137', 'art 142', 'artigo 136', 'artigo 142'] },
    { topico: 'Segurança Pública', palavras: ['seguranca publica', 'art 144', 'artigo 144', 'policia militar', 'policia civil', 'bombeiro', 'policia federal', 'policia rodoviaria', 'ordem publica', 'policias penais', 'guardas municipais', 'algemas', 'sumula vinculante 11', 'sv 11'] }
  ],
  'Direitos Humanos e Legislação Extravagante': [
    { topico: 'Direitos Humanos e Tratados Internacionais', palavras: ['direitos humanos', 'teoria geral', 'geracoes de direitos', 'declaracao universal', 'dudh', '1948', 'pacto de san jose', 'convencao americana', '678', 'onu', 'tratados internacionais', 'supralegal', 'equivalente a emenda'] },
    { topico: 'ECA (Atuação Policial e Ato Infracional)', palavras: ['eca', '8 069', '8069', 'estatuto da crianca', 'crianca', 'adolescente', 'ato infracional', 'conselho tutelar', 'apreensao de adolescente', 'medida socioeducativa'] },
    { topico: 'Abuso de Autoridade', palavras: ['abuso de autoridade', 'abuso', '13 869', '13869', 'lei de abuso'] },
    { topico: 'Tortura', palavras: ['tortura', '9 455', '9455', 'lei de tortura'] },
    { topico: 'Lei Maria da Penha', palavras: ['maria da penha', 'violencia domestica', '11 340', '11340', 'medida protetiva', 'violencia familiar', 'violencia domestica e familiar', 'henry borel', '14 344', '14344', '13 344'] },
    { topico: 'Crimes de Preconceito de Raça ou de Cor', palavras: ['racismo', 'preconceito de raca', 'injuria racial', '7 716', '7716', 'discriminacao racial'] },
    { topico: 'Crimes Ambientais', palavras: ['crimes ambientais', 'crime ambiental', '9 605', '9605', 'meio ambiente', 'fauna', 'flora', 'poluicao'] },
    { topico: 'Crimes Hediondos', palavras: ['hediondo', 'hediondos', '8 072', '8072', 'crimes hediondos', 'equiparados', 'inafiançavel', 'insuscetivel de graca', 'sumula vinculante 26'] },
    { topico: 'Lei de Drogas', palavras: ['drogas', '11 343', '11343', 'entorpecente', 'trafico', 'uso de drogas', 'sisnad', 'lei de drogas'] },
    { topico: 'Estatuto dos Policiais Militares de PE', palavras: ['6 783', '6783', 'estatuto dos policiais militares', 'estatuto dos militares', 'pmpe', 'disciplina militar', 'hierarquia', 'agregacao', 'reforma', 'reserva remunerada', 'licenca especial', 'valor policial militar', 'etica policial militar'] },
    { topico: 'Estatuto da Pessoa Idosa', palavras: ['idoso', 'pessoa idosa', 'estatuto da pessoa idosa', 'estatuto do idoso', '10 741', '10741', 'sessenta anos'] },
    { topico: 'Estatuto da Juventude', palavras: ['estatuto da juventude', 'juventude', 'jovem', 'jovens', '12 852', '12852', '15 e 29 anos', '18 926', '18926'] }
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
