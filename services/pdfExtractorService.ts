/**
 * Client-Side PDF Text Extraction & Chapter Segmentation Service
 * Uses Mozilla pdf.js directly in the browser/client with 0 AI API cost.
 */

export interface ExtractedChapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  content: string;
  wordCount: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  wordCount: number;
}

export interface PDFExtractionResult {
  title: string;
  totalPages: number;
  totalWords: number;
  pages: ExtractedPage[];
  chapters: ExtractedChapter[];
  isScannedImageOnly: boolean;
}

/**
 * Initializes and retrieves the PDF.js library instance via dynamic script loading.
 */
async function getPdfJs(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('PDF extraction is only available in browser environments');
  }

  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }

  return new Promise((resolve, reject) => {
    // Check if script tag already exists
    let script = document.querySelector('script[data-pdfjs="true"]') as HTMLScriptElement;
    if (script) {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
      } else {
        script.addEventListener('load', () => {
          const lib = (window as any).pdfjsLib;
          if (lib) {
            lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve(lib);
          } else {
            reject(new Error('PDF.js failed to load'));
          }
        });
      }
      return;
    }

    script = document.createElement('script');
    script.setAttribute('data-pdfjs', 'true');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;

    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      } else {
        reject(new Error('PDF.js not found on window'));
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load PDF extraction engine'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Regular expressions for detecting chapter / section headings.
 */
const CHAPTER_REGEX_PATTERNS = [
  /^(?:chapter|unit|module|section|lesson|part)\s*([0-9ivxlcdm]+)[:.\s-]*(.*)$/i,
  /^([0-9]+(?:\.[0-9]+)*)\s+([A-Z][A-Za-z0-9\s,:'"-]{3,60})$/,
  /^([A-Z\s]{4,50})$/,
];

/**
 * Extracts clean text from an ArrayBuffer or Uint8Array of a PDF file.
 */
export async function extractTextFromPdf(
  fileData: ArrayBuffer | Uint8Array,
  fileName: string,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void
): Promise<PDFExtractionResult> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: fileData,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: ExtractedPage[] = [];
  let allTextAccumulator = '';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageLines: string[] = [];
    let lastY: number | null = null;
    let currentLine = '';

    for (const item of textContent.items as any[]) {
      if (!item.str) continue;
      const currentY = item.transform ? item.transform[5] : null;

      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
        if (currentLine.trim()) {
          pageLines.push(currentLine.trim());
        }
        currentLine = item.str;
      } else {
        currentLine += (currentLine.length > 0 && !currentLine.endsWith(' ') ? ' ' : '') + item.str;
      }
      lastY = currentY;
    }
    if (currentLine.trim()) {
      pageLines.push(currentLine.trim());
    }

    const pageText = pageLines.join('\n');
    const words = pageText.trim().split(/\s+/).filter(Boolean).length;

    pages.push({
      pageNumber: pageNum,
      text: pageText,
      wordCount: words,
    });

    allTextAccumulator += pageText + '\n';

    if (onProgress) {
      onProgress({
        current: pageNum,
        total: totalPages,
        percent: Math.round((pageNum / totalPages) * 100),
      });
    }
  }

  const totalWords = pages.reduce((acc, p) => acc + p.wordCount, 0);
  const isScannedImageOnly = totalWords < 30 && totalPages > 0;

  // Segment into chapters
  const chapters = segmentIntoChapters(pages, fileName);

  const cleanTitle = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();

  return {
    title: cleanTitle || 'Uploaded Material',
    totalPages,
    totalWords,
    pages,
    chapters,
    isScannedImageOnly,
  };
}

/**
 * Segments pages into structured chapters based on detected headings or page blocks.
 */
function segmentIntoChapters(pages: ExtractedPage[], fileName: string): ExtractedChapter[] {
  const detectedChapters: { title: string; startPage: number }[] = [];

  for (const page of pages) {
    const lines = page.text.split('\n').map((l) => l.trim()).filter(Boolean);
    const topLines = lines.slice(0, 8); // Look at top 8 lines of each page

    for (const line of topLines) {
      for (const pattern of CHAPTER_REGEX_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          const rawTitle = line.replace(/\s+/g, ' ').trim();
          if (rawTitle.length >= 4 && rawTitle.length <= 80) {
            // Avoid duplicate adjacent titles
            const last = detectedChapters[detectedChapters.length - 1];
            if (!last || last.title.toLowerCase() !== rawTitle.toLowerCase()) {
              detectedChapters.push({
                title: rawTitle,
                startPage: page.pageNumber,
              });
              break;
            }
          }
        }
      }
    }
  }

  // If no headings found, or only 1 chapter in a large document, chunk into standard ~5-page segments
  if (detectedChapters.length < 2 && pages.length > 5) {
    detectedChapters.length = 0;
    const PAGES_PER_CHUNK = 5;
    for (let i = 0; i < pages.length; i += PAGES_PER_CHUNK) {
      const start = i + 1;
      const end = Math.min(i + PAGES_PER_CHUNK, pages.length);
      detectedChapters.push({
        title: `Chapter ${Math.floor(i / PAGES_PER_CHUNK) + 1} (Pages ${start}-${end})`,
        startPage: start,
      });
    }
  } else if (detectedChapters.length === 0) {
    // Single short document
    detectedChapters.push({
      title: fileName.replace(/\.pdf$/i, '').trim() || 'Complete Material',
      startPage: 1,
    });
  }

  // Build chapter objects with endPages and accumulated content
  const result: ExtractedChapter[] = [];
  for (let idx = 0; idx < detectedChapters.length; idx++) {
    const current = detectedChapters[idx];
    const next = detectedChapters[idx + 1];
    const endPage = next ? next.startPage - 1 : pages.length;

    const chapterPages = pages.filter(
      (p) => p.pageNumber >= current.startPage && p.pageNumber <= endPage
    );

    const chapterContent = chapterPages.map((p) => p.text).join('\n\n');
    const wordCount = chapterPages.reduce((sum, p) => sum + p.wordCount, 0);

    result.push({
      id: `chap_${idx + 1}_${current.startPage}`,
      title: current.title,
      startPage: current.startPage,
      endPage,
      content: chapterContent,
      wordCount,
    });
  }

  return result;
}
