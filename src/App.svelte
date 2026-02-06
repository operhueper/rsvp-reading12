<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    parseText as parseTextUtil,
    getWordDelay as getWordDelayUtil,
    formatTimeRemaining,
    shouldPauseAtWord,
    extractWordFrame
  } from './lib/rsvp-utils.js';
  import { parseFile } from './lib/file-parsers.js';
  import {
    saveBook, loadBook, updateProgress, getLibrary, deleteBook,
    addBookmark, getBookmarks, deleteBookmark,
    hasLegacySession, migrateLegacySession
  } from './lib/progress-storage.js';
  import RSVPDisplay from './lib/components/RSVPDisplay.svelte';
  import Controls from './lib/components/Controls.svelte';
  import Settings from './lib/components/Settings.svelte';
  import TextInput from './lib/components/TextInput.svelte';
  import ProgressBar from './lib/components/ProgressBar.svelte';
  import SpeedControl from './lib/components/SpeedControl.svelte';

  // State
  let frameWordCount = 1;
  let text = `Rapid serial visual presentation (RSVP) is a scientific method for studying the timing of vision. In RSVP, a sequence of stimuli is shown to an observer at one location in their visual field. This technique has been adapted for speed reading applications, where words are displayed one at a time at a fixed point, eliminating the need for eye movements and potentially increasing reading speed significantly.`;
  let words = [];
  let currentWordIndex = 0;
  let isPlaying = false;
  let isPaused = false;
  let showSettings = false;
  let showTextInput = false;
  let showLibrary = false;
  let showBookmarks = false;
  let progress = 0;
  let isLoadingFile = false;
  let loadingMessage = '';
  let showJumpTo = false;
  let jumpToValue = '';

  let currentBookId = null;
  let currentBookTitle = '';
  let chapters = [];
  let library = [];
  let bookmarks = [];
  let newBookmarkLabel = '';
  let autoSaveInterval = null;

  // Settings
  let wordsPerMinute = 300;
  let fadeEnabled = true;
  let fadeDuration = 150;
  let pauseAfterWords = 0;
  let pauseDuration = 500;
  let pauseOnPunctuation = true;
  let punctuationPauseMultiplier = 2;
  let wordLengthWPMMultiplier = 5;

  // Animation
  let wordOpacity = 1;
  let intervalId = null;
  let fadeTimeoutId = null;

  $: currentWord = words[currentWordIndex - 1] || (words.length > 0 ? words[0] : '');
  $: wordFrame = extractWordFrame(words, Math.max(0, currentWordIndex - 1), frameWordCount);
  $: timeRemaining = formatTimeRemaining(words.length - currentWordIndex, wordsPerMinute);
  $: isFocusMode = isPlaying || isPaused;

  function parseText() { words = parseTextUtil(text); currentWordIndex = 0; progress = 0; }
  function getWordDelay(word) { return getWordDelayUtil(word, wordsPerMinute, pauseOnPunctuation, punctuationPauseMultiplier, wordLengthWPMMultiplier); }

  function showNextWord() {
    if (currentWordIndex >= words.length) { stop(); return; }
    if (shouldPauseAtWord(currentWordIndex, pauseAfterWords)) {
      isPaused = true;
      setTimeout(() => { if (isPlaying) { isPaused = false; scheduleNextWord(); } }, pauseDuration);
      return;
    }
    if (fadeEnabled) { wordOpacity = 0; fadeTimeoutId = setTimeout(() => { wordOpacity = 1; }, 10); }
    progress = ((currentWordIndex + 1) / words.length) * 100;
    currentWordIndex++;
    scheduleNextWord();
  }

  function scheduleNextWord() {
    if (!isPlaying || currentWordIndex >= words.length) return;
    const word = words[currentWordIndex - 1] || '';
    intervalId = setTimeout(showNextWord, getWordDelay(word));
  }

  function start() {
    if (words.length === 0) parseText();
    if (words.length === 0) return;
    isPlaying = true; isPaused = false;
    showSettings = false; showTextInput = false; showLibrary = false; showBookmarks = false;
    showNextWord();
  }
  function pause() { isPlaying = false; isPaused = true; if (intervalId) { clearTimeout(intervalId); intervalId = null; } }
  function resume() { if (currentWordIndex < words.length) { isPlaying = true; isPaused = false; scheduleNextWord(); } }
  function stop() { isPlaying = false; isPaused = false; currentWordIndex = 0; progress = 0; wordOpacity = 1; if (intervalId) { clearTimeout(intervalId); intervalId = null; } }
  function restart() { stop(); start(); }

  function handleSpeedChange(event) { wordsPerMinute = event.detail.wpm; }

  function handleTextApply(event) { text = event.detail.text; stop(); parseText(); showTextInput = false; currentBookId = null; currentBookTitle = ''; chapters = []; }

  async function handleFileSelect(event) {
    const file = event.detail.file;
    if (!file) return;
    isLoadingFile = true; loadingMessage = `Loading ${file.name}...`;
    try {
      const result = await parseFile(file);
      text = result.text; chapters = result.chapters || []; currentBookTitle = result.title || file.name;
      stop(); parseText(); showTextInput = false;
      currentBookId = await saveBook({ text, title: currentBookTitle, currentWordIndex: 0, totalWords: words.length, chapters, settings: getSettings() });
      await refreshLibrary(); loadingMessage = '';
    } catch (error) {
      console.error('Error parsing file:', error); loadingMessage = `Error: ${error.message}`;
      setTimeout(() => { loadingMessage = ''; }, 3000);
    } finally { isLoadingFile = false; }
  }

  function getSettings() { return { wordsPerMinute, fadeEnabled, fadeDuration, pauseOnPunctuation, punctuationPauseMultiplier, wordLengthWPMMultiplier, pauseAfterWords, pauseDuration, frameWordCount }; }

  function startAutoSave() { stopAutoSave(); autoSaveInterval = setInterval(async () => { if (currentBookId && words.length > 0) await updateProgress(currentBookId, currentWordIndex, getSettings()); }, 30000); }
  function stopAutoSave() { if (autoSaveInterval) { clearInterval(autoSaveInterval); autoSaveInterval = null; } }
  async function saveProgress() { if (currentBookId && words.length > 0) await updateProgress(currentBookId, currentWordIndex, getSettings()); }
  async function refreshLibrary() { library = await getLibrary(); }

  async function openBook(bookId) {
    const book = await loadBook(bookId);
    if (!book) return;
    text = book.text; parseText();
    currentWordIndex = book.currentWordIndex || 0;
    progress = words.length > 0 ? (currentWordIndex / words.length) * 100 : 0;
    chapters = book.chapters || []; currentBookId = book.id; currentBookTitle = book.title;
    if (book.settings) {
      wordsPerMinute = book.settings.wordsPerMinute ?? wordsPerMinute;
      fadeEnabled = book.settings.fadeEnabled ?? fadeEnabled;
      fadeDuration = book.settings.fadeDuration ?? fadeDuration;
      pauseOnPunctuation = book.settings.pauseOnPunctuation ?? pauseOnPunctuation;
      punctuationPauseMultiplier = book.settings.punctuationPauseMultiplier ?? punctuationPauseMultiplier;
      wordLengthWPMMultiplier = book.settings.wordLengthWPMMultiplier ?? wordLengthWPMMultiplier;
      pauseAfterWords = book.settings.pauseAfterWords ?? pauseAfterWords;
      pauseDuration = book.settings.pauseDuration ?? pauseDuration;
      frameWordCount = book.settings.frameWordCount ?? frameWordCount;
    }
    showLibrary = false; bookmarks = await getBookmarks(currentBookId);
  }

  async function removeBook(bookId) { await deleteBook(bookId); if (currentBookId === bookId) { currentBookId = null; currentBookTitle = ''; chapters = []; } await refreshLibrary(); }
  async function addCurrentBookmark() { if (!currentBookId) return; const preview = words.slice(Math.max(0, currentWordIndex - 3), currentWordIndex + 5).join(' '); await addBookmark(currentBookId, currentWordIndex, newBookmarkLabel || `Word ${currentWordIndex}`, preview); newBookmarkLabel = ''; bookmarks = await getBookmarks(currentBookId); }
  async function removeBookmarkItem(bmId) { await deleteBookmark(bmId); bookmarks = await getBookmarks(currentBookId); }
  function goToBookmark(wordIdx) { currentWordIndex = wordIdx; progress = (currentWordIndex / words.length) * 100; showBookmarks = false; }

  function jumpToWord(value) {
    if (!value || words.length === 0) return;
    let targetIndex; const trimmed = value.trim();
    if (trimmed.endsWith('%')) { const p = parseFloat(trimmed.slice(0, -1)); if (!isNaN(p)) targetIndex = Math.floor((Math.max(0, Math.min(100, p)) / 100) * words.length); }
    else { const n = parseInt(trimmed, 10); if (!isNaN(n)) targetIndex = Math.max(0, Math.min(words.length, n)); }
    if (targetIndex !== undefined) { currentWordIndex = targetIndex; progress = (currentWordIndex / words.length) * 100; }
    showJumpTo = false; jumpToValue = '';
  }

  function jumpToChapter(ch) { currentWordIndex = ch.wordIndex; progress = (currentWordIndex / words.length) * 100; }
  function handleProgressClick(event) { const p = event.detail.percentage; const t = Math.floor((p / 100) * words.length); currentWordIndex = Math.max(0, Math.min(words.length, t)); progress = (currentWordIndex / words.length) * 100; }

  function handleKeydown(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); if (isPlaying) pause(); else if (isPaused) resume(); else start(); break;
      case 'Escape':
        if (showJumpTo) { showJumpTo = false; jumpToValue = ''; }
        else if (showSettings || showTextInput || showLibrary || showBookmarks) { showSettings = false; showTextInput = false; showLibrary = false; showBookmarks = false; }
        else if (isPlaying || isPaused) { isPlaying = false; isPaused = false; if (intervalId) { clearTimeout(intervalId); intervalId = null; } saveProgress(); }
        break;
      case 'KeyG': if (!isPlaying && !showSettings && !showTextInput) { e.preventDefault(); showJumpTo = !showJumpTo; } break;
      case 'KeyS': if (e.ctrlKey || e.metaKey) { e.preventDefault(); saveProgress(); } break;
      case 'KeyB': if (!isPlaying && !showSettings && !showTextInput && currentBookId) { e.preventDefault(); addCurrentBookmark(); } break;
      case 'ArrowUp': e.preventDefault(); wordsPerMinute = Math.min(1000, wordsPerMinute + 25); break;
      case 'ArrowDown': e.preventDefault(); wordsPerMinute = Math.max(50, wordsPerMinute - 25); break;
      case 'ArrowLeft': e.preventDefault(); if (currentWordIndex > 1) { currentWordIndex = Math.max(0, currentWordIndex - 2); progress = (currentWordIndex / words.length) * 100; } break;
      case 'ArrowRight': e.preventDefault(); if (currentWordIndex < words.length) { progress = ((currentWordIndex + 1) / words.length) * 100; currentWordIndex++; } break;
    }
  }

  $: if (isPlaying) startAutoSave(); else { stopAutoSave(); }

  onMount(async () => {
    parseText(); window.addEventListener('keydown', handleKeydown);
    if (hasLegacySession()) { const bookId = await migrateLegacySession(); if (bookId) await openBook(bookId); }
    await refreshLibrary();
  });

  onDestroy(() => { if (intervalId) clearTimeout(intervalId); if (fadeTimeoutId) clearTimeout(fadeTimeoutId); stopAutoSave(); window.removeEventListener('keydown', handleKeydown); });
</script>

<main class:focus-mode={isFocusMode}>
  {#if !isFocusMode}
    <header>
      <div class="header-left">
        <h1>RSVP Reader</h1>
        {#if currentBookTitle}<span class="book-title">{currentBookTitle}</span>{/if}
      </div>
      <div class="header-actions">
        {#if currentBookId}
          <button class="icon-btn" on:click={() => { showBookmarks = !showBookmarks; showSettings = false; showTextInput = false; showLibrary = false; showJumpTo = false; }} title="Bookmarks" class:active={showBookmarks}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
          </button>
        {/if}
        <button class="icon-btn" on:click={() => { showLibrary = !showLibrary; showSettings = false; showTextInput = false; showBookmarks = false; showJumpTo = false; }} title="Library" class:active={showLibrary}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>
        </button>
        <button class="icon-btn" on:click={() => { showJumpTo = !showJumpTo; showSettings = false; showTextInput = false; showLibrary = false; showBookmarks = false; }} title="Jump to (G)" class:active={showJumpTo}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
        </button>
        <button class="icon-btn" on:click={() => { showTextInput = !showTextInput; showSettings = false; showJumpTo = false; showLibrary = false; showBookmarks = false; }} title="Load Content" class:active={showTextInput}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>
        </button>
        <button class="icon-btn" on:click={() => { showSettings = !showSettings; showTextInput = false; showJumpTo = false; showLibrary = false; showBookmarks = false; }} title="Settings" class:active={showSettings}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
      </div>
    </header>
  {/if}

  <!-- Overlay Panels -->
  {#if showTextInput && !isFocusMode}
    <div class="panel-overlay" on:click|self={() => showTextInput = false} role="presentation">
      <TextInput {text} isLoading={isLoadingFile} {loadingMessage} on:apply={handleTextApply} on:fileselect={handleFileSelect} on:close={() => showTextInput = false} />
    </div>
  {/if}

  {#if showSettings && !isFocusMode}
    <div class="panel-overlay" on:click|self={() => showSettings = false} role="presentation">
      <Settings bind:wordsPerMinute bind:fadeEnabled bind:fadeDuration bind:pauseOnPunctuation bind:punctuationPauseMultiplier bind:wordLengthWPMMultiplier bind:pauseAfterWords bind:pauseDuration bind:frameWordCount on:close={() => showSettings = false} />
    </div>
  {/if}

  {#if showJumpTo && !isFocusMode}
    <div class="panel-overlay" on:click|self={() => showJumpTo = false} role="presentation">
      <div class="modal-panel">
        <h3>Jump to position</h3>
        <p class="hint">Enter word number or percentage (e.g., 50%)</p>
        <form on:submit|preventDefault={() => jumpToWord(jumpToValue)}>
          <input type="text" bind:value={jumpToValue} placeholder="Word # or %" autofocus />
          <div class="modal-actions">
            <button type="button" class="btn-sec" on:click={() => showJumpTo = false}>Cancel</button>
            <button type="submit" class="btn-pri">Go</button>
          </div>
        </form>
        <div class="quick-jumps">
          <button on:click={() => jumpToWord('0')}>Start</button>
          <button on:click={() => jumpToWord('25%')}>25%</button>
          <button on:click={() => jumpToWord('50%')}>50%</button>
          <button on:click={() => jumpToWord('75%')}>75%</button>
        </div>
        {#if chapters.length > 0}
          <div class="chapter-list">
            <h4>Chapters</h4>
            <div class="chapter-scroll">
              {#each chapters as ch}
                <button class="chapter-btn" on:click={() => { jumpToChapter(ch); showJumpTo = false; }}>
                  <span class="ch-title">{ch.title}</span>
                  <span class="ch-pct">{Math.round((ch.wordIndex / words.length) * 100)}%</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showLibrary && !isFocusMode}
    <div class="panel-overlay" on:click|self={() => showLibrary = false} role="presentation">
      <div class="modal-panel wide">
        <div class="modal-header"><h3>📚 Library</h3><button class="close-x" on:click={() => showLibrary = false}>✕</button></div>
        {#if library.length === 0}
          <p class="empty">No books yet. Upload a file to get started!</p>
        {:else}
          <div class="book-list">
            {#each library as book}
              <div class="book-item" class:active={currentBookId === book.id}>
                <button class="book-info" on:click={() => openBook(book.id)}>
                  <span class="book-name">{book.title}</span>
                  <div class="book-meta"><span>{book.progress}%</span><span>•</span><span>{book.totalWords.toLocaleString()} words</span></div>
                  <div class="mini-bar"><div class="mini-fill" style="width:{book.progress}%"></div></div>
                </button>
                <button class="del-btn" on:click|stopPropagation={() => removeBook(book.id)} title="Delete">✕</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showBookmarks && !isFocusMode}
    <div class="panel-overlay" on:click|self={() => showBookmarks = false} role="presentation">
      <div class="modal-panel">
        <div class="modal-header"><h3>🔖 Bookmarks</h3><button class="close-x" on:click={() => showBookmarks = false}>✕</button></div>
        <div class="add-bm">
          <input type="text" bind:value={newBookmarkLabel} placeholder="Name (optional)" />
          <button class="btn-pri" on:click={addCurrentBookmark}>+ Word {currentWordIndex}</button>
        </div>
        {#if bookmarks.length === 0}
          <p class="empty">No bookmarks yet.</p>
        {:else}
          {#each bookmarks as bm}
            <div class="bm-item">
              <button class="bm-info" on:click={() => goToBookmark(bm.wordIndex)}>
                <span class="bm-label">{bm.label}</span>
                <span class="bm-preview">{bm.preview}</span>
              </button>
              <button class="del-btn" on:click|stopPropagation={() => removeBookmarkItem(bm.id)}>✕</button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Main Display -->
  <div class="display-area">
    <RSVPDisplay word={currentWord} wordGroup={wordFrame.subset} highlightIndex={wordFrame.centerOffset} opacity={wordOpacity} {fadeDuration} {fadeEnabled} multiWordEnabled={frameWordCount > 1} />
  </div>

  <!-- Live Speed Control (visible during focus mode) -->
  <SpeedControl wpm={wordsPerMinute} visible={isFocusMode} on:change={handleSpeedChange} />

  <!-- Bottom Bar -->
  <div class="bottom-bar" class:minimal={isFocusMode}>
    <ProgressBar {progress} currentWord={currentWordIndex} totalWords={words.length} wpm={wordsPerMinute} {timeRemaining} minimal={isFocusMode} clickable={!isPlaying} {chapters} on:seek={handleProgressClick} />
    <div class="controls-area">
      <Controls {isPlaying} {isPaused} canPlay={words.length > 0} minimal={isFocusMode} on:play={start} on:pause={pause} on:resume={resume} on:stop={stop} on:restart={restart} />
    </div>
    {#if !isFocusMode}
      <div class="shortcuts desktop-only">
        <kbd>Space</kbd> Play <kbd>Esc</kbd> Exit <kbd>↑↓</kbd> Speed <kbd>←→</kbd> Skip <kbd>G</kbd> Jump <kbd>B</kbd> Bookmark
      </div>
      <div class="touch-controls mobile-only">
        <button class="touch-btn" on:click={() => currentWordIndex = Math.max(0, currentWordIndex - 10)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <button class="touch-btn" on:click={() => wordsPerMinute = Math.max(50, wordsPerMinute - 50)}>−WPM</button>
        <span class="wpm-show">{wordsPerMinute}</span>
        <button class="touch-btn" on:click={() => wordsPerMinute = Math.min(1000, wordsPerMinute + 50)}>+WPM</button>
        <button class="touch-btn" on:click={() => currentWordIndex = Math.min(words.length, currentWordIndex + 10)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
        </button>
      </div>
    {/if}
  </div>
</main>

<style>
  :global(body) { background-color: #000 !important; margin: 0; padding: 0; overflow: hidden; position: fixed; width: 100%; height: 100%; }

  main { height: 100vh; height: 100dvh; display: flex; flex-direction: column; background-color: #000; color: #fff; font-family: 'Segoe UI', system-ui, sans-serif; padding: 1.5rem; box-sizing: border-box; transition: padding 0.3s ease; overflow: hidden; padding-top: calc(1.5rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); padding-left: calc(1.5rem + env(safe-area-inset-left, 0px)); padding-right: calc(1.5rem + env(safe-area-inset-right, 0px)); }
  main.focus-mode { padding: 0.75rem; padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px)); }

  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-shrink: 0; gap: 0.5rem; }
  .header-left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
  h1 { font-size: 1.1rem; font-weight: 400; color: #555; margin: 0; white-space: nowrap; }
  .book-title { color: #888; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .header-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }

  .icon-btn { background: transparent; border: 1px solid #333; color: #555; padding: 0.45rem; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; }
  .icon-btn:hover { border-color: #555; color: #fff; }
  .icon-btn.active { border-color: #ff4444; color: #ff4444; }
  .icon-btn svg { width: 18px; height: 18px; }

  .panel-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }

  .display-area { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; overflow: hidden; }

  .bottom-bar { flex-shrink: 0; display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.75rem; transition: all 0.3s ease; }
  .bottom-bar.minimal { gap: 0.4rem; padding-top: 0.4rem; }
  .controls-area { display: flex; justify-content: center; }

  .shortcuts { display: flex; justify-content: center; gap: 1.25rem; color: #444; font-size: 0.75rem; }
  kbd { background: #1a1a1a; padding: 0.1rem 0.35rem; border-radius: 3px; font-family: monospace; color: #666; margin-right: 0.2rem; }

  .touch-controls { display: none; justify-content: center; align-items: center; gap: 0.4rem; }
  .touch-btn { background: #1a1a1a; border: 1px solid #333; color: #888; padding: 0.5rem 0.65rem; border-radius: 6px; font-size: 0.75rem; cursor: pointer; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .touch-btn:active { background: #333; color: #fff; }
  .touch-btn svg { width: 20px; height: 20px; }
  .wpm-show { color: #ff4444; font-family: monospace; font-size: 0.85rem; min-width: 3rem; text-align: center; }

  .mobile-only { display: none; }
  .desktop-only { display: flex; }

  /* Modal panels */
  .modal-panel { background: #111; border: 1px solid #333; border-radius: 16px; padding: 1.5rem; max-width: 400px; width: 100%; max-height: 80vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .modal-panel.wide { max-width: 480px; }
  .modal-panel h3 { margin: 0 0 0.75rem 0; color: #fff; font-size: 1.15rem; }
  .modal-panel h4 { margin: 1rem 0 0.5rem; color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .hint { color: #666; font-size: 0.85rem; margin: 0 0 1rem; }
  .empty { color: #555; text-align: center; padding: 2rem 0; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .close-x { background: none; border: none; color: #666; font-size: 1.2rem; cursor: pointer; padding: 0.25rem; }
  .close-x:hover { color: #fff; }

  .modal-panel input[type="text"] { width: 100%; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 1rem; margin-bottom: 0.75rem; box-sizing: border-box; }
  .modal-panel input:focus { outline: none; border-color: #ff4444; }

  .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn-pri { padding: 0.6rem 1rem; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9rem; background: #ff4444; color: #fff; transition: background 0.2s; white-space: nowrap; }
  .btn-pri:hover { background: #ff6666; }
  .btn-sec { padding: 0.6rem 1rem; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9rem; background: #333; color: #fff; }
  .btn-sec:hover { background: #444; }

  .quick-jumps { display: flex; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #222; }
  .quick-jumps button { flex: 1; padding: 0.5rem; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; color: #888; cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
  .quick-jumps button:hover { background: #333; color: #fff; }

  .chapter-list { margin-top: 0.75rem; }
  .chapter-scroll { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .chapter-btn { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0.6rem 0.75rem; background: #1a1a1a; border: none; border-radius: 6px; color: #ccc; cursor: pointer; font-size: 0.85rem; text-align: left; transition: background 0.15s; }
  .chapter-btn:hover { background: #2a2a2a; }
  .ch-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .ch-pct { color: #666; font-family: monospace; font-size: 0.75rem; margin-left: 0.5rem; flex-shrink: 0; }

  /* Library */
  .book-list { display: flex; flex-direction: column; gap: 4px; }
  .book-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.15rem; border-radius: 8px; transition: background 0.15s; }
  .book-item:hover { background: #1a1a1a; }
  .book-item.active { background: #1a1a1a; border-left: 3px solid #ff4444; }
  .book-info { flex: 1; background: none; border: none; color: #fff; cursor: pointer; text-align: left; padding: 0.6rem; }
  .book-name { display: block; font-size: 0.95rem; margin-bottom: 0.25rem; }
  .book-meta { display: flex; gap: 0.35rem; color: #666; font-size: 0.75rem; margin-bottom: 0.35rem; }
  .mini-bar { height: 3px; background: #222; border-radius: 2px; overflow: hidden; }
  .mini-fill { height: 100%; background: #ff4444; transition: width 0.3s; }
  .del-btn { background: none; border: none; color: #444; cursor: pointer; padding: 0.5rem; font-size: 0.9rem; border-radius: 6px; }
  .del-btn:hover { color: #ff4444; background: #1a1a1a; }

  /* Bookmarks */
  .add-bm { display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }
  .add-bm input { flex: 1; margin-bottom: 0; }
  .bm-item { display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid #1a1a1a; }
  .bm-info { flex: 1; background: none; border: none; color: #fff; cursor: pointer; text-align: left; padding: 0.6rem 0; }
  .bm-label { display: block; font-size: 0.9rem; }
  .bm-preview { display: block; color: #555; font-size: 0.75rem; margin-top: 0.15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }

  @media (max-width: 600px) {
    main { padding: 0.75rem; padding-top: calc(0.75rem + env(safe-area-inset-top, 0px)); padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px)); }
    main.focus-mode { padding: 0.5rem; padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px)); }
    .panel-overlay { padding: 0.75rem; }
    .desktop-only { display: none; }
    .mobile-only { display: flex; }
    h1 { font-size: 1rem; }
    .book-title { max-width: 120px; font-size: 0.75rem; }
    .header-actions { gap: 0.25rem; }
    .icon-btn { padding: 0.4rem; min-width: 34px; min-height: 34px; }
    .icon-btn svg { width: 16px; height: 16px; }
    .modal-panel { padding: 1.25rem; border-radius: 12px; }
    .add-bm { flex-direction: column; }
    .add-bm .btn-pri { width: 100%; }
  }
</style>
