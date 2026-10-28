import { getAllExams, saveExam, deleteExam } from './db';
import initialExams from '../data/initialExams.json';

export async function initExamDatabase() {
  const existing = await getAllExams();
  if (existing.length === 0) {
    console.log('Populando base de provas com provas iniciais (PMPE, PMDF, PC-GO)...');
    for (const exam of initialExams) {
      await saveExam({
        ...exam,
        ativo: true,
        isPadrao: true,
        dataAdicionado: new Date().toISOString()
      });
    }
    return await getAllExams();
  }
  return existing;
}

export async function addCustomExam(parsedPdf, metadata = {}) {
  const newExam = {
    id: 'exam_' + Date.now(),
    nome: metadata.nome || parsedPdf.nome,
    banca: metadata.banca || 'Instituto AOCP',
    ano: metadata.ano || new Date().getFullYear(),
    totalPaginas: parsedPdf.totalPaginas,
    tamanhoCaracteres: parsedPdf.tamanhoCaracteres,
    texto: parsedPdf.texto,
    ativo: true,
    isPadrao: false,
    dataAdicionado: new Date().toISOString()
  };
  await saveExam(newExam);
  return newExam;
}

export async function toggleExamStatus(id, currentStatus) {
  const all = await getAllExams();
  const target = all.find(e => e.id === id);
  if (target) {
    target.ativo = !currentStatus;
    await saveExam(target);
  }
  return await getAllExams();
}

export async function removeExam(id) {
  await deleteExam(id);
  return await getAllExams();
}

// Extrai trechos relevantes das provas ativas para alimentar o prompt do Gemini
export function getContextSnippets(exams, disciplina, assunto, maxChars = 20000) {
  const activeExams = exams.filter(e => e.ativo);
  if (activeExams.length === 0) return '';

  let snippets = '';
  const searchTerms = [
    disciplina.toLowerCase(),
    assunto ? assunto.toLowerCase() : ''
  ].filter(Boolean);

  for (const exam of activeExams) {
    if (snippets.length >= maxChars) break;

    // Procura por termos da disciplina no texto da prova
    const pages = exam.texto.split('--- PÁGINA ');
    for (const page of pages) {
      if (!page.trim()) continue;
      const lower = page.toLowerCase();
      const matches = searchTerms.some(term => lower.includes(term));
      
      if (matches || pages.length < 5) {
        const header = `\n[EXEMPLO REAL DE PROVA: ${exam.nome} (${exam.banca} - ${exam.ano})]\n`;
        snippets += header + page.slice(0, 3000) + '\n';
        if (snippets.length >= maxChars) break;
      }
    }
  }

  // Se por acaso não achar por palavra-chave específica, pega amostras representativas das provas
  if (snippets.length < 1000 && activeExams.length > 0) {
    for (const exam of activeExams.slice(0, 2)) {
      snippets += `\n[EXEMPLO REAL DE PROVA: ${exam.nome}]\n` + exam.texto.slice(0, 4000) + '\n';
    }
  }

  return snippets;
}
