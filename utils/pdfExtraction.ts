/**
 * Extract text content from a PDF File or Blob
 */
export async function extractTextFromPDF(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  try {
    // Try browser-native pdfjs via CDN or global if available
    let pdfjsLib: any = typeof window !== 'undefined' ? (window as any).pdfjsLib : null;
    if (!pdfjsLib && typeof document !== 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      document.head.appendChild(script);
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load PDF.js script.'));
      });
      pdfjsLib = (window as any).pdfjsLib;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    }

    if (pdfjsLib) {
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;
      let fullText = '';
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n\n';
      }
      return fullText;
    }
  } catch (err) {
    console.warn('[PDF] Error extracting PDF text via PDF.js:', err);
  }

  // Fallback: extract plain text strings from Uint8Array
  const textDecoder = new TextDecoder('utf-8', { fatal: false });
  const rawString = textDecoder.decode(uint8Array);
  const matches = rawString.match(/\(([^()]+)\)T[jJ]/g) || rawString.match(/\[([^\[\]]+)\]TJ/g);
  if (matches && matches.length > 0) {
    return matches.map(m => m.replace(/[()[\]TjJ]/g, '')).join(' ');
  }
  return rawString.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ');
}
