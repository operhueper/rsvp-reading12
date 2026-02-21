/**
 * Progress storage utilities using IndexedDB for large books
 * Supports: library of books, bookmarks, reading progress
 */

const DB_NAME = 'rsvp-reader-db';
const DB_VERSION = 1;
const BOOKS_STORE = 'books';
const BOOKMARKS_STORE = 'bookmarks';

// Legacy localStorage key for migration
const LEGACY_KEY = 'rsvp-reading-session';

/**
 * Open the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Books store - keyed by id
      if (!db.objectStoreNames.contains(BOOKS_STORE)) {
        const booksStore = db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
        booksStore.createIndex('lastRead', 'lastRead', { unique: false });
        booksStore.createIndex('title', 'title', { unique: false });
      }

      // Bookmarks store - keyed by id
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        const bookmarksStore = db.createObjectStore(BOOKMARKS_STORE, { keyPath: 'id' });
        bookmarksStore.createIndex('bookId', 'bookId', { unique: false });
      }
    };
  });
}

/**
 * Generate a simple unique ID
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate a hash for text content to identify books
 * @param {string} text - The text to hash
 * @returns {string} A simple hash
 */
function hashText(text) {
  let hash = 0;
  const sample = text.substring(0, 10000); // Use first 10K chars
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 'book_' + Math.abs(hash).toString(36);
}

// ==================== BOOK OPERATIONS ====================

/**
 * @typedef {Object} Book
 * @property {string} id - Unique book ID
 * @property {string} title - Book title
 * @property {string} text - Full text content
 * @property {number} currentWordIndex - Reading position
 * @property {number} totalWords - Total word count
 * @property {Object} chapters - Chapter data
 * @property {Object} settings - Reader settings
 * @property {number} lastRead - Timestamp of last read
 * @property {number} createdAt - Timestamp of creation
 */

/**
 * Save a book (create or update)
 * @param {Object} bookData
 * @returns {Promise<string>} The book ID
 */
export async function saveBook(bookData) {
  try {
    const db = await openDB();
    const tx = db.transaction(BOOKS_STORE, 'readwrite');
    const store = tx.objectStore(BOOKS_STORE);

    const book = {
      id: bookData.id || hashText(bookData.text),
      title: bookData.title || 'Untitled',
      text: bookData.text,
      currentWordIndex: bookData.currentWordIndex || 0,
      totalWords: bookData.totalWords || 0,
      chapters: bookData.chapters || [],
      settings: bookData.settings || {},
      lastRead: Date.now(),
      createdAt: bookData.createdAt || Date.now()
    };

    store.put(book);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(book.id);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to save book:', error);
    // Fallback to localStorage
    return saveSessionLegacy(bookData);
  }
}

/**
 * Load a book by ID
 * @param {string} bookId
 * @returns {Promise<Book|null>}
 */
export async function loadBook(bookId) {
  try {
    const db = await openDB();
    const tx = db.transaction(BOOKS_STORE, 'readonly');
    const store = tx.objectStore(BOOKS_STORE);
    const request = store.get(bookId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load book:', error);
    return null;
  }
}

/**
 * Update reading progress for a book
 * @param {string} bookId
 * @param {number} currentWordIndex
 * @param {Object} [settings]
 * @returns {Promise<boolean>}
 */
export async function updateProgress(bookId, currentWordIndex, settings) {
  try {
    const book = await loadBook(bookId);
    if (!book) return false;

    book.currentWordIndex = currentWordIndex;
    book.lastRead = Date.now();
    if (settings) book.settings = settings;

    await saveBook(book);
    return true;
  } catch (error) {
    console.error('Failed to update progress:', error);
    return false;
  }
}

/**
 * Get all books sorted by last read
 * @returns {Promise<Array>} Array of book summaries (without full text)
 */
export async function getLibrary() {
  try {
    const db = await openDB();
    const tx = db.transaction(BOOKS_STORE, 'readonly');
    const store = tx.objectStore(BOOKS_STORE);
    const index = store.index('lastRead');
    const request = index.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const books = (request.result || [])
          .sort((a, b) => b.lastRead - a.lastRead)
          .map(book => ({
            id: book.id,
            title: book.title,
            currentWordIndex: book.currentWordIndex,
            totalWords: book.totalWords,
            chapters: book.chapters,
            lastRead: book.lastRead,
            createdAt: book.createdAt,
            progress: book.totalWords > 0
              ? Math.round((book.currentWordIndex / book.totalWords) * 100)
              : 0
          }));
        resolve(books);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get library:', error);
    return [];
  }
}

/**
 * Delete a book and its bookmarks
 * @param {string} bookId
 * @returns {Promise<boolean>}
 */
export async function deleteBook(bookId) {
  try {
    const db = await openDB();

    // Delete book
    const tx1 = db.transaction(BOOKS_STORE, 'readwrite');
    tx1.objectStore(BOOKS_STORE).delete(bookId);
    await new Promise((resolve, reject) => {
      tx1.oncomplete = () => resolve();
      tx1.onerror = () => reject(tx1.error);
    });

    // Delete associated bookmarks
    const bookmarks = await getBookmarks(bookId);
    if (bookmarks.length > 0) {
      const tx2 = db.transaction(BOOKMARKS_STORE, 'readwrite');
      const store = tx2.objectStore(BOOKMARKS_STORE);
      for (const bm of bookmarks) {
        store.delete(bm.id);
      }
      await new Promise((resolve, reject) => {
        tx2.oncomplete = () => resolve();
        tx2.onerror = () => reject(tx2.error);
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to delete book:', error);
    return false;
  }
}

// ==================== BOOKMARK OPERATIONS ====================

/**
 * @typedef {Object} Bookmark
 * @property {string} id - Unique bookmark ID
 * @property {string} bookId - Associated book ID
 * @property {number} wordIndex - Word position
 * @property {string} label - User label/note
 * @property {string} preview - Preview text around bookmark
 * @property {number} createdAt - Timestamp
 */

/**
 * Add a bookmark
 * @param {string} bookId
 * @param {number} wordIndex
 * @param {string} label
 * @param {string} [preview]
 * @returns {Promise<string>} Bookmark ID
 */
export async function addBookmark(bookId, wordIndex, label, preview = '') {
  try {
    const db = await openDB();
    const tx = db.transaction(BOOKMARKS_STORE, 'readwrite');
    const store = tx.objectStore(BOOKMARKS_STORE);

    const bookmark = {
      id: generateId(),
      bookId,
      wordIndex,
      label: label || `Position ${wordIndex}`,
      preview,
      createdAt: Date.now()
    };

    store.put(bookmark);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(bookmark.id);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to add bookmark:', error);
    return '';
  }
}

/**
 * Get all bookmarks for a book
 * @param {string} bookId
 * @returns {Promise<Bookmark[]>}
 */
export async function getBookmarks(bookId) {
  try {
    const db = await openDB();
    const tx = db.transaction(BOOKMARKS_STORE, 'readonly');
    const store = tx.objectStore(BOOKMARKS_STORE);
    const index = store.index('bookId');
    const request = index.getAll(bookId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const bookmarks = (request.result || [])
          .sort((a, b) => a.wordIndex - b.wordIndex);
        resolve(bookmarks);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get bookmarks:', error);
    return [];
  }
}

/**
 * Delete a bookmark
 * @param {string} bookmarkId
 * @returns {Promise<boolean>}
 */
export async function deleteBookmark(bookmarkId) {
  try {
    const db = await openDB();
    const tx = db.transaction(BOOKMARKS_STORE, 'readwrite');
    tx.objectStore(BOOKMARKS_STORE).delete(bookmarkId);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to delete bookmark:', error);
    return false;
  }
}

// ==================== LEGACY COMPAT ====================

/**
 * Check if there's a legacy localStorage session to migrate
 * @returns {boolean}
 */
export function hasLegacySession() {
  try {
    return localStorage.getItem(LEGACY_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Migrate legacy session to IndexedDB
 * @returns {Promise<string|null>} New book ID or null
 */
export async function migrateLegacySession() {
  try {
    const data = localStorage.getItem(LEGACY_KEY);
    if (!data) return null;

    const session = JSON.parse(data);
    const bookId = await saveBook({
      text: session.text,
      title: 'Imported Session',
      currentWordIndex: session.currentWordIndex,
      totalWords: session.totalWords,
      settings: session.settings,
      chapters: []
    });

    // Remove legacy data after successful migration
    localStorage.removeItem(LEGACY_KEY);
    return bookId;
  } catch (error) {
    console.error('Failed to migrate legacy session:', error);
    return null;
  }
}

// Legacy compatibility functions
function saveSessionLegacy(session) {
  try {
    const data = {
      text: session.text,
      currentWordIndex: session.currentWordIndex,
      totalWords: session.totalWords,
      settings: session.settings,
      savedAt: Date.now()
    };
    localStorage.setItem(LEGACY_KEY, JSON.stringify(data));
    return session.id || 'legacy';
  } catch (error) {
    console.error('Failed to save session:', error);
    return null;
  }
}

// Keep old API for backward compatibility
export function saveSession(session) {
  return saveBook(session);
}

export function loadSession() {
  try {
    const data = localStorage.getItem(LEGACY_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function hasSession() {
  return hasLegacySession();
}

export function clearSession() {
  try {
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getSessionSummary() {
  try {
    const data = localStorage.getItem(LEGACY_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return {
      currentWordIndex: parsed.currentWordIndex,
      totalWords: parsed.totalWords,
      savedAt: parsed.savedAt,
      hasText: !!parsed.text
    };
  } catch {
    return null;
  }
}

/**
 * Convert percentage to word index
 * @param {number} percentage - Percentage from 0 to 100
 * @param {number} totalWords - Total number of words
 * @returns {number} The corresponding word index
 */
export function percentageToWordIndex(percentage, totalWords) {
  if (totalWords <= 0) return 0;
  const p = Math.max(0, Math.min(100, percentage));
  return Math.floor((p / 100) * totalWords);
}

/**
 * Convert word index to percentage
 * @param {number} wordIndex - Current word index
 * @param {number} totalWords - Total number of words
 * @returns {number} Percentage from 0 to 100
 */
export function wordIndexToPercentage(wordIndex, totalWords) {
  if (totalWords <= 0) return 0;
  return Math.round((wordIndex / totalWords) * 100);
}

