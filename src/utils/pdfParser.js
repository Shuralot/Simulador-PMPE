import * as pdfjsLib from 'pdfjs-dist';
import { linhasDaPagina } from './linhasPdf';

// Configura o worker do pdfjs para funcionar no browser via Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export async function parsePdfFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  let fullText = '';
  const numPages = pdfDoc.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += `\n--- PÁGINA ${pageNum} ---\n` + linhasDaPagina(textContent.items);
  }

  const caracteresPorPagina = fullText.length / Math.max(1, numPages);
  const quebras = (fullText.match(/\n/g) || []).length;
  let aviso = null;
  if (caracteresPorPagina < 300) {
    aviso = 'O PDF parece ser escaneado (quase sem texto selecionável). Será necessário OCR para extrair as questões.';
  } else if (quebras < numPages * 5) {
    aviso = 'O PDF não preservou as quebras de linha; a extração de questões pode ser incompleta.';
  }

  return {
    nome: file.name.replace(/\.[^/.]+$/, ''),
    totalPaginas: numPages,
    tamanhoCaracteres: fullText.length,
    texto: fullText,
    aviso
  };
}
