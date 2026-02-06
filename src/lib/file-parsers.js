/**
 * File parsing utilities for PDF, EPUB, FB2, and TXT files
 * Now with chapter/section detection
 */

/**
 * @typedef {Object} Chapter
 * @property {string} title - Chapter title
 * @property {number} wordIndex - Starting word index in the full text
 * @property {number} wordCount - Number of words in this chapter
 */

/**
 * @typedef {Object} ParseResult
 * @property {string} text - Full extracted text
 * @property {Chapter[]} chapters - Array of detected chapters
 * @property {string} title - Book title if available
 */

/**
 * Parse a PDF file and extract its text content
 * @param {File} file - The PDF file to parse
 * @returns {Promise<ParseResult>} The extracted text with chapters
 */
export async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  const pageBreaks = []; // Track page boundaries for chapter detection

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter(item => 'str' in item)
      .map(item => /** @type {{ str: string }} */ (item).str)
      .join(' ');

    pageBreaks.push({ page: i, charIndex: fullText.length });
    fullText += pageText + ' ';
  }

  const cleanedText = cleanText(fullText);
  const chapters = detectChapters(cleanedText);

  return {
    text: cleanedText,
    chapters,
    title: file.name.replace(/\.pdf$/i, '')
  };
}

/**
 * Parse an EPUB file and extract its text content with chapters
 * @param {File} file - The EPUB file to parse
 * @returns {Promise<ParseResult>} The extracted text with chapters
 */
export async function parseEPUB(file) {
  const ePub = (await import('epubjs')).default;

  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);

  await book.ready;
  await book.loaded.spine;

  let fullText = '';
  const chapters = [];
  let bookTitle = '';

  // Try to get book title
  try {
    const metadata = await book.loaded.metadata;
    bookTitle = metadata?.title || '';
  } catch (e) {
    // ignore
  }

  // Try to get TOC for chapter names
  let toc = [];
  try {
    const navigation = await book.loaded.navigation;
    toc = navigation?.toc || [];
  } catch (e) {
    // ignore
  }

  const spineItems = book.spine?.spineItems || book.spine?.items || [];

  // Build a map of href -> toc entry for chapter names
  const tocMap = new Map();
  function flattenToc(items) {
    for (const item of items) {
      if (item.href) {
        // Normalize href - remove fragment
        const baseHref = item.href.split('#')[0];
        tocMap.set(baseHref, item.label?.trim() || '');
      }
      if (item.subitems) flattenToc(item.subitems);
    }
  }
  flattenToc(toc);

  for (const item of spineItems) {
    try {
      const href = item.href || item.url;
      if (!href) continue;

      const contents = await book.load(href);
      if (contents) {
        let text = '';
        if (typeof contents === 'string') {
          const doc = new DOMParser().parseFromString(contents, 'text/html');
          text = doc.body?.textContent || '';
        } else if (contents.body) {
          text = contents.body.textContent || '';
        } else if (contents.documentElement) {
          text = contents.documentElement.textContent || '';
        }

        if (text.trim()) {
          // Check if this spine item corresponds to a TOC entry
          const baseHref = href.split('#')[0];
          const tocLabel = tocMap.get(baseHref);
          const wordIndex = fullText.trim().split(/\s+/).filter(w => w.length > 0).length;

          if (tocLabel) {
            chapters.push({
              title: tocLabel,
              wordIndex,
              wordCount: 0 // Will be calculated after
            });
          }

          fullText += text + ' ';
        }
      }
    } catch (e) {
      console.warn('Could not load section:', e);
    }
  }

  const cleanedText = cleanText(fullText);
  const allWords = cleanedText.split(/\s+/).filter(w => w.length > 0);

  // Calculate word counts for each chapter
  for (let i = 0; i < chapters.length; i++) {
    const nextStart = i + 1 < chapters.length ? chapters[i + 1].wordIndex : allWords.length;
    chapters[i].wordCount = nextStart - chapters[i].wordIndex;
  }

  // If no chapters detected from TOC, try auto-detection
  const finalChapters = chapters.length > 0 ? chapters : detectChapters(cleanedText);

  return {
    text: cleanedText,
    chapters: finalChapters,
    title: bookTitle || file.name.replace(/\.epub$/i, '')
  };
}

/**
 * Parse an FB2 file and extract its text content with chapters
 * @param {File} file - The FB2 file to parse
 * @returns {Promise<ParseResult>} The extracted text with chapters
 */
export async function parseFB2(file) {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  let bookTitle = '';
  const chapters = [];
  let fullText = '';

  // Extract title
  const titleInfo = doc.querySelector('title-info');
  if (titleInfo) {
    const bookTitleEl = titleInfo.querySelector('book-title');
    if (bookTitleEl) {
      bookTitle = bookTitleEl.textContent?.trim() || '';
    }
  }

  // Extract body sections (chapters)
  const body = doc.querySelector('body');
  if (body) {
    const sections = body.querySelectorAll(':scope > section');

    if (sections.length > 0) {
      for (const section of sections) {
        const titleEl = section.querySelector('title');
        const chapterTitle = titleEl ? titleEl.textContent?.trim().replace(/\s+/g, ' ') : '';

        const wordIndex = fullText.trim().split(/\s+/).filter(w => w.length > 0).length;

        // Extract all paragraphs from section
        const paragraphs = section.querySelectorAll('p');
        let sectionText = '';
        for (const p of paragraphs) {
          sectionText += p.textContent?.trim() + ' ';
        }

        if (sectionText.trim()) {
          if (chapterTitle) {
            chapters.push({
              title: chapterTitle,
              wordIndex,
              wordCount: 0
            });
          }
          fullText += sectionText;
        }
      }
    } else {
      // No sections, just get all text
      fullText = body.textContent || '';
    }
  }

  const cleanedText = cleanText(fullText);
  const allWords = cleanedText.split(/\s+/).filter(w => w.length > 0);

  // Calculate word counts
  for (let i = 0; i < chapters.length; i++) {
    const nextStart = i + 1 < chapters.length ? chapters[i + 1].wordIndex : allWords.length;
    chapters[i].wordCount = nextStart - chapters[i].wordIndex;
  }

  const finalChapters = chapters.length > 0 ? chapters : detectChapters(cleanedText);

  return {
    text: cleanedText,
    chapters: finalChapters,
    title: bookTitle || file.name.replace(/\.fb2$/i, '')
  };
}

/**
 * Parse a TXT file
 * @param {File} file - The TXT file to parse
 * @returns {Promise<ParseResult>} The extracted text with chapters
 */
export async function parseTXT(file) {
  const text = await file.text();
  const cleanedText = cleanText(text);
  const chapters = detectChapters(cleanedText);

  return {
    text: cleanedText,
    chapters,
    title: file.name.replace(/\.txt$/i, '')
  };
}

/**
 * Auto-detect chapters from text content
 * Looks for patterns like "Chapter 1", "Глава 1", "PART ONE", etc.
 * @param {string} text - The full text
 * @returns {Chapter[]} Detected chapters
 */
function detectChapters(text) {
  const chapters = [];
  const words = text.split(/\s+/).filter(w => w.length > 0);

  // Common chapter patterns (EN + RU)
  const chapterPatterns = [
    /^(chapter|глава|часть|part|раздел|section)\s+[\dIVXLCDMivxlcdm]+/i,
    /^(chapter|глава|часть|part|раздел|section)\s+\S+/i,
  ];

  let currentPos = 0;
  const lines = text.split(/\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentPos += 1;
      continue;
    }

    const lineWords = trimmed.split(/\s+/).filter(w => w.length > 0);

    for (const pattern of chapterPatterns) {
      if (pattern.test(trimmed) && lineWords.length <= 8) {
        // Find word index for this position
        const textBefore = text.substring(0, text.indexOf(trimmed, currentPos));
        const wordIndex = textBefore.split(/\s+/).filter(w => w.length > 0).length;

        chapters.push({
          title: trimmed,
          wordIndex,
          wordCount: 0
        });
        break;
      }
    }

    currentPos += trimmed.length + 1;
  }

  // Calculate word counts
  for (let i = 0; i < chapters.length; i++) {
    const nextStart = i + 1 < chapters.length ? chapters[i + 1].wordIndex : words.length;
    chapters[i].wordCount = nextStart - chapters[i].wordIndex;
  }

  return chapters;
}

/**
 * Clean and normalize extracted text
 * @param {string} text - The raw text to clean
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\1+/g, '$1')
    .trim();
}

/**
 * Detect file type and parse accordingly
 * @param {File} file - The file to parse
 * @returns {Promise<ParseResult>} The extracted text with chapters
 */
export async function parseFile(file) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.pdf')) {
    return parsePDF(file);
  } else if (fileName.endsWith('.epub')) {
    return parseEPUB(file);
  } else if (fileName.endsWith('.fb2')) {
    return parseFB2(file);
  } else if (fileName.endsWith('.txt')) {
    return parseTXT(file);
  } else {
    throw new Error(`Unsupported file type: ${fileName}. Supported: PDF, EPUB, FB2, TXT`);
  }
}

/**
 * Get supported file extensions
 * @returns {string} Comma-separated list of supported extensions
 */
export function getSupportedExtensions() {
  return '.pdf,.epub,.fb2,.txt';
}
