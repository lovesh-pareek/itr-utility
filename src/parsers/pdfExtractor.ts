// PDF.js is loaded via CDN in production or via the npm package.
// We use a dynamic import to avoid bundling issues with the worker.

export interface PDFTextResult {
  pages: string[]
  fullText: string
  isScanned: boolean
  pageCount: number
}

const SCANNED_THRESHOLD_CHARS = 200  // total chars across all pages

/**
 * Dynamically load PDF.js. We use the legacy build to avoid worker complications.
 */
async function getPDFJS() {
  // pdfjs-dist ships its own worker — we set the workerSrc to the CDN version
  const pdfjsLib = await import('pdfjs-dist')

  // Set worker source — use unpkg CDN to avoid bundler worker complications
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }

  return pdfjsLib
}

/**
 * Extract all text content from a PDF File object.
 * Returns per-page text arrays and a scanned detection flag.
 */
export async function extractPDFText(file: File): Promise<PDFTextResult> {
  const pdfjsLib = await getPDFJS()

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  const pageCount = pdf.numPages
  const pages: string[] = []

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pages.push(pageText)
  }

  const fullText = pages.join('\n')
  const isScanned = fullText.replace(/\s/g, '').length < SCANNED_THRESHOLD_CHARS

  return { pages, fullText, isScanned, pageCount }
}

/**
 * Quick scanned check — heuristic only, before full parse.
 */
export function isScannedPDF(text: string): boolean {
  return text.replace(/\s/g, '').length < SCANNED_THRESHOLD_CHARS
}
