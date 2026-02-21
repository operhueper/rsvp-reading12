<script>
  import { onMount, onDestroy } from "svelte";
  import {
    parseText as parseTextUtil,
    getWordDelay as getWordDelayUtil,
    formatTimeRemaining,
    shouldPauseAtWord,
    extractWordFrame,
  } from "./lib/rsvp-utils.js";
  import { parseFile } from "./lib/file-parsers.js";
  import {
    saveBook,
    loadBook,
    updateProgress,
    getLibrary,
    deleteBook,
    addBookmark,
    getBookmarks,
    deleteBookmark,
    hasLegacySession,
    migrateLegacySession,
  } from "./lib/progress-storage.js";
  import RSVPDisplay from "./lib/components/RSVPDisplay.svelte";
  import Controls from "./lib/components/Controls.svelte";
  import Settings from "./lib/components/Settings.svelte";
  import TextInput from "./lib/components/TextInput.svelte";
  import ProgressBar from "./lib/components/ProgressBar.svelte";
  import SpeedControl from "./lib/components/SpeedControl.svelte";

  let frameWordCount = 1;
  let text = "";
  let words = [];
  let currentWordIndex = 0;
  let isPlaying = false;
  let isPaused = false;
  let showSettings = false;
  let showTextInput = false;
  let showChapters = false;
  let showLibrary = false;
  let showBookmarks = false;
  let progress = 0;
  let isLoadingFile = false;
  let loadingMessage = "";
  let showJumpTo = false;
  let jumpToValue = "";
  let currentBookId = null;
  let currentBookTitle = "";
  let chapters = [];
  let library = [];
  let bookmarks = [];
  let newBookmarkLabel = "";
  let autoSaveInterval = null;

  let wordsPerMinute = 300;
  let fadeEnabled = true;
  let fadeDuration = 150;
  let pauseAfterWords = 0;
  let pauseDuration = 500;
  let pauseOnPunctuation = true;
  let punctuationPauseMultiplier = 2;
  let wordLengthWPMMultiplier = 5;

  let wordOpacity = 1;
  let intervalId = null;
  let fadeTimeoutId = null;

  let demoWord = "";
  let demoWords = ["Читай", "быстрее.", "Одно", "слово", "за", "раз."];
  let demoIndex = 0;
  let demoInterval = null;

  $: currentWord =
    words[currentWordIndex - 1] || (words.length > 0 ? words[0] : "");
  $: wordFrame = extractWordFrame(
    words,
    Math.max(0, currentWordIndex - 1),
    frameWordCount,
  );
  $: timeRemaining = formatTimeRemaining(
    words.length - currentWordIndex,
    wordsPerMinute,
  );
  $: isFocusMode = isPlaying || isPaused;
  $: isWelcome = words.length === 0 && !isFocusMode;

  function parseText() {
    words = parseTextUtil(text);
    currentWordIndex = 0;
    progress = 0;
  }
  function getWordDelay(word) {
    return getWordDelayUtil(
      word,
      wordsPerMinute,
      pauseOnPunctuation,
      punctuationPauseMultiplier,
      wordLengthWPMMultiplier,
    );
  }

  function showNextWord() {
    if (currentWordIndex >= words.length) {
      stop();
      return;
    }
    if (shouldPauseAtWord(currentWordIndex, pauseAfterWords)) {
      isPaused = true;
      setTimeout(() => {
        if (isPlaying) {
          isPaused = false;
          scheduleNextWord();
        }
      }, pauseDuration);
      return;
    }
    if (fadeEnabled) {
      wordOpacity = 0;
      fadeTimeoutId = setTimeout(() => {
        wordOpacity = 1;
      }, 10);
    }
    progress = ((currentWordIndex + 1) / words.length) * 100;
    currentWordIndex++;
    scheduleNextWord();
  }

  function scheduleNextWord() {
    if (!isPlaying || currentWordIndex >= words.length) return;
    const word = words[currentWordIndex - 1] || "";
    intervalId = setTimeout(showNextWord, getWordDelay(word));
  }

  function start() {
    if (words.length === 0) parseText();
    if (words.length === 0) return;
    stopDemo();
    isPlaying = true;
    isPaused = false;
    showSettings = false;
    showTextInput = false;
    showLibrary = false;
    showBookmarks = false;
    showNextWord();
  }
  function pause() {
    isPlaying = false;
    isPaused = true;
    if (intervalId) {
      clearTimeout(intervalId);
      intervalId = null;
    }
  }
  function resume() {
    if (currentWordIndex < words.length) {
      isPlaying = true;
      isPaused = false;
      scheduleNextWord();
    }
  }
  function stop() {
    isPlaying = false;
    isPaused = false;
    wordOpacity = 1;
    if (intervalId) {
      clearTimeout(intervalId);
      intervalId = null;
    }
    // Save progress instead of resetting
    saveProgress();
  }
  function resetToStart() {
    currentWordIndex = 0;
    progress = 0;
    wordOpacity = 1;
  }
  function restart() {
    resetToStart();
    start();
  }
  function handleSpeedChange(event) {
    wordsPerMinute = event.detail.wpm;
  }

  function handleTextApply(event) {
    text = event.detail.text;
    stop();
    parseText();
    showTextInput = false;
    currentBookId = null;
    currentBookTitle = "";
    chapters = [];
  }

  async function handleFileSelect(event) {
    const file = event.detail.file;
    if (!file) return;
    isLoadingFile = true;
    loadingMessage = `Загрузка ${file.name}...`;
    try {
      const result = await parseFile(file);
      text = result.text;
      chapters = result.chapters || [];
      currentBookTitle = result.title || file.name;
      stop();
      parseText();
      showTextInput = false;
      stopDemo();
      currentBookId = await saveBook({
        text,
        title: currentBookTitle,
        currentWordIndex: 0,
        totalWords: words.length,
        chapters,
        settings: getSettings(),
      });
      await refreshLibrary();
      loadingMessage = "";
    } catch (error) {
      console.error("Error parsing file:", error);
      loadingMessage = `Ошибка: ${error.message}`;
      setTimeout(() => {
        loadingMessage = "";
      }, 3000);
    } finally {
      isLoadingFile = false;
    }
  }

  function getSettings() {
    return {
      wordsPerMinute,
      fadeEnabled,
      fadeDuration,
      pauseOnPunctuation,
      punctuationPauseMultiplier,
      wordLengthWPMMultiplier,
      pauseAfterWords,
      pauseDuration,
      frameWordCount,
    };
  }
  function startAutoSave() {
    stopAutoSave();
    autoSaveInterval = setInterval(async () => {
      if (currentBookId && words.length > 0)
        await updateProgress(currentBookId, currentWordIndex, getSettings());
    }, 30000);
  }
  function stopAutoSave() {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }
  }
  async function saveProgress() {
    if (currentBookId && words.length > 0)
      await updateProgress(currentBookId, currentWordIndex, getSettings());
  }
  async function refreshLibrary() {
    library = await getLibrary();
  }

  async function openBook(bookId) {
    const book = await loadBook(bookId);
    if (!book) return;
    text = book.text;
    parseText();
    stopDemo();
    currentWordIndex = book.currentWordIndex || 0;
    progress = words.length > 0 ? (currentWordIndex / words.length) * 100 : 0;
    chapters = book.chapters || [];
    currentBookId = book.id;
    currentBookTitle = book.title;
    if (book.settings) {
      wordsPerMinute = book.settings.wordsPerMinute ?? wordsPerMinute;
      fadeEnabled = book.settings.fadeEnabled ?? fadeEnabled;
      fadeDuration = book.settings.fadeDuration ?? fadeDuration;
      pauseOnPunctuation =
        book.settings.pauseOnPunctuation ?? pauseOnPunctuation;
      punctuationPauseMultiplier =
        book.settings.punctuationPauseMultiplier ?? punctuationPauseMultiplier;
      wordLengthWPMMultiplier =
        book.settings.wordLengthWPMMultiplier ?? wordLengthWPMMultiplier;
      pauseAfterWords = book.settings.pauseAfterWords ?? pauseAfterWords;
      pauseDuration = book.settings.pauseDuration ?? pauseDuration;
      frameWordCount = book.settings.frameWordCount ?? frameWordCount;
    }
    showLibrary = false;
    bookmarks = await getBookmarks(currentBookId);
  }

  async function removeBook(bookId) {
    await deleteBook(bookId);
    if (currentBookId === bookId) {
      currentBookId = null;
      currentBookTitle = "";
      chapters = [];
    }
    await refreshLibrary();
  }
  async function addCurrentBookmark() {
    if (!currentBookId) return;
    const preview = words
      .slice(Math.max(0, currentWordIndex - 3), currentWordIndex + 5)
      .join(" ");
    await addBookmark(
      currentBookId,
      currentWordIndex,
      newBookmarkLabel || `Word ${currentWordIndex}`,
      preview,
    );
    newBookmarkLabel = "";
    bookmarks = await getBookmarks(currentBookId);
  }
  async function removeBookmarkItem(bmId) {
    await deleteBookmark(bmId);
    bookmarks = await getBookmarks(currentBookId);
  }
  function goToBookmark(wordIdx) {
    currentWordIndex = wordIdx;
    progress = (currentWordIndex / words.length) * 100;
    showBookmarks = false;
  }

  function jumpToWord(value) {
    if (!value || words.length === 0) return;
    let targetIndex;
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
      const p = parseFloat(trimmed.slice(0, -1));
      if (!isNaN(p))
        targetIndex = Math.floor(
          (Math.max(0, Math.min(100, p)) / 100) * words.length,
        );
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n)) targetIndex = Math.max(0, Math.min(words.length, n));
    }
    if (targetIndex !== undefined) {
      currentWordIndex = targetIndex;
      progress = (currentWordIndex / words.length) * 100;
    }
    showJumpTo = false;
    jumpToValue = "";
  }

  function jumpToChapter(ch) {
    currentWordIndex = ch.wordIndex;
    progress = (currentWordIndex / words.length) * 100;
    showChapters = false;
    showJumpTo = false;
  }
  function handleProgressClick(event) {
    const p = event.detail.percentage;
    const t = Math.floor((p / 100) * words.length);
    currentWordIndex = Math.max(0, Math.min(words.length, t));
    progress = (currentWordIndex / words.length) * 100;
  }

  function startDemo() {
    demoIndex = 0;
    demoWord = demoWords[0];
    demoInterval = setInterval(() => {
      demoIndex = (demoIndex + 1) % demoWords.length;
      demoWord = demoWords[demoIndex];
    }, 400);
  }
  function stopDemo() {
    if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
    }
  }

  function handleKeydown(e) {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    switch (e.code) {
      case "Space":
        e.preventDefault();
        if (isPlaying) pause();
        else if (isPaused) resume();
        else if (words.length > 0) start();
        break;
      case "Escape":
        if (showJumpTo) {
          showJumpTo = false;
          jumpToValue = "";
        } else if (showChapters) {
          showChapters = false;
        } else if (
          showSettings ||
          showTextInput ||
          showLibrary ||
          showBookmarks
        ) {
          showSettings = false;
          showTextInput = false;
          showLibrary = false;
          showBookmarks = false;
        } else if (isPlaying || isPaused) {
          stop();
        }
        break;
      case "KeyG":
        if (!isPlaying && !showSettings && !showTextInput) {
          e.preventDefault();
          showJumpTo = !showJumpTo;
        }
        break;
      case "KeyS":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          saveProgress();
        }
        break;
      case "KeyB":
        if (!isPlaying && !showSettings && !showTextInput && currentBookId) {
          e.preventDefault();
          addCurrentBookmark();
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        wordsPerMinute = Math.min(1000, wordsPerMinute + 25);
        break;
      case "ArrowDown":
        e.preventDefault();
        wordsPerMinute = Math.max(50, wordsPerMinute - 25);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (currentWordIndex > 1) {
          currentWordIndex = Math.max(0, currentWordIndex - 2);
          progress = (currentWordIndex / words.length) * 100;
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        if (currentWordIndex < words.length) {
          progress = ((currentWordIndex + 1) / words.length) * 100;
          currentWordIndex++;
        }
        break;
    }
  }

  $: if (isPlaying) startAutoSave();
  else {
    stopAutoSave();
  }

  onMount(async () => {
    window.addEventListener("keydown", handleKeydown);
    if (hasLegacySession()) {
      const bookId = await migrateLegacySession();
      if (bookId) await openBook(bookId);
    }
    await refreshLibrary();
    if (words.length === 0) startDemo();
  });

  onDestroy(() => {
    if (intervalId) clearTimeout(intervalId);
    if (fadeTimeoutId) clearTimeout(fadeTimeoutId);
    stopAutoSave();
    stopDemo();
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

<main class:focus-mode={isFocusMode}>
  {#if !isFocusMode}
    <header>
      <div class="header-left">
        <h1>RSVP Reader</h1>
        {#if currentBookTitle}<span class="book-title">{currentBookTitle}</span
          >{/if}
      </div>
      <div class="header-actions">
        {#if chapters.length > 0}<button
            class="icon-btn"
            on:click={() => {
              showChapters = !showChapters;
              showBookmarks = false;
              showSettings = false;
              showTextInput = false;
              showLibrary = false;
              showJumpTo = false;
            }}
            title="Оглавление"
            class:active={showChapters}
            ><svg viewBox="0 0 24 24" fill="currentColor"
              ><path
                d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
              /></svg
            ></button
          >{/if}
        {#if currentBookId}<button
            class="icon-btn"
            on:click={() => {
              showBookmarks = !showBookmarks;
              showChapters = false;
              showSettings = false;
              showTextInput = false;
              showLibrary = false;
              showJumpTo = false;
            }}
            title="Закладки"
            class:active={showBookmarks}
            ><svg viewBox="0 0 24 24" fill="currentColor"
              ><path
                d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"
              /></svg
            ></button
          >{/if}
        {#if library.length > 0}<button
            class="icon-btn"
            on:click={() => {
              showLibrary = !showLibrary;
              showChapters = false;
              showSettings = false;
              showTextInput = false;
              showBookmarks = false;
              showJumpTo = false;
            }}
            title="Библиотека"
            class:active={showLibrary}
            ><svg viewBox="0 0 24 24" fill="currentColor"
              ><path
                d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"
              /></svg
            ></button
          >{/if}
        {#if words.length > 0}<button
            class="icon-btn"
            on:click={() => {
              showJumpTo = !showJumpTo;
              showChapters = false;
              showSettings = false;
              showTextInput = false;
              showLibrary = false;
              showBookmarks = false;
            }}
            title="Перейти (G)"
            class:active={showJumpTo}
            ><svg viewBox="0 0 24 24" fill="currentColor"
              ><path
                d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"
              /></svg
            ></button
          >{/if}
        <button
          class="icon-btn"
          on:click={() => {
            showTextInput = !showTextInput;
            showSettings = false;
            showJumpTo = false;
            showLibrary = false;
            showBookmarks = false;
          }}
          title="Загрузить"
          class:active={showTextInput}
          ><svg viewBox="0 0 24 24" fill="currentColor"
            ><path
              d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"
            /></svg
          ></button
        >
        <button
          class="icon-btn"
          on:click={() => {
            showSettings = !showSettings;
            showTextInput = false;
            showJumpTo = false;
            showLibrary = false;
            showBookmarks = false;
          }}
          title="Настройки"
          class:active={showSettings}
          ><svg viewBox="0 0 24 24" fill="currentColor"
            ><path
              d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"
            /></svg
          ></button
        >
      </div>
    </header>
  {/if}

  {#if showTextInput && !isFocusMode}<div
      class="panel-overlay"
      on:click|self={() => (showTextInput = false)}
      role="presentation"
    >
      <TextInput
        {text}
        isLoading={isLoadingFile}
        {loadingMessage}
        on:apply={handleTextApply}
        on:fileselect={handleFileSelect}
        on:close={() => (showTextInput = false)}
      />
    </div>{/if}
  {#if showSettings && !isFocusMode}<div
      class="panel-overlay"
      on:click|self={() => (showSettings = false)}
      role="presentation"
    >
      <Settings
        bind:wordsPerMinute
        bind:fadeEnabled
        bind:fadeDuration
        bind:pauseOnPunctuation
        bind:punctuationPauseMultiplier
        bind:wordLengthWPMMultiplier
        bind:pauseAfterWords
        bind:pauseDuration
        bind:frameWordCount
        on:close={() => (showSettings = false)}
      />
    </div>{/if}

  {#if showJumpTo && !isFocusMode}
    <div
      class="panel-overlay"
      on:click|self={() => (showJumpTo = false)}
      role="presentation"
    >
      <div class="modal-panel">
        <h3>Перейти к позиции</h3>
        <p class="hint">Введите номер слова или процент (напр., 50%)</p>
        <form on:submit|preventDefault={() => jumpToWord(jumpToValue)}>
          <input
            type="text"
            bind:value={jumpToValue}
            placeholder="Слово № или %"
            autofocus
          />
          <div class="modal-actions">
            <button
              type="button"
              class="btn-sec"
              on:click={() => (showJumpTo = false)}>Отмена</button
            ><button type="submit" class="btn-pri">Перейти</button>
          </div>
        </form>
        <div class="quick-jumps">
          <button on:click={() => jumpToWord("0")}>Начало</button><button
            on:click={() => jumpToWord("25%")}>25%</button
          ><button on:click={() => jumpToWord("50%")}>50%</button><button
            on:click={() => jumpToWord("75%")}>75%</button
          >
        </div>
      </div>
    </div>
  {/if}

  {#if showLibrary && !isFocusMode}
    <div
      class="panel-overlay"
      on:click|self={() => (showLibrary = false)}
      role="presentation"
    >
      <div class="modal-panel wide">
        <div class="modal-header">
          <h3>📚 Библиотека</h3>
          <button class="close-x" on:click={() => (showLibrary = false)}
            >✕</button
          >
        </div>
        {#if library.length === 0}<p class="empty">Книг пока нет.</p>
        {:else}<div class="book-list">
            {#each library as book}<div
                class="book-item"
                class:active={currentBookId === book.id}
              >
                <button class="book-info" on:click={() => openBook(book.id)}
                  ><span class="book-name">{book.title}</span>
                  <div class="book-meta">
                    <span>{book.progress}%</span><span>•</span><span
                      >{book.totalWords.toLocaleString()} слов</span
                    >
                  </div>
                  <div class="mini-bar">
                    <div class="mini-fill" style="width:{book.progress}%"></div>
                  </div></button
                ><button
                  class="del-btn"
                  on:click|stopPropagation={() => removeBook(book.id)}>✕</button
                >
              </div>{/each}
          </div>{/if}
      </div>
    </div>
  {/if}

  {#if showBookmarks && !isFocusMode}
    <div
      class="panel-overlay"
      on:click|self={() => (showBookmarks = false)}
      role="presentation"
    >
      <div class="modal-panel">
        <div class="modal-header">
          <h3>🔖 Закладки</h3>
          <button class="close-x" on:click={() => (showBookmarks = false)}
            >✕</button
          >
        </div>
        <div class="add-bm">
          <input
            type="text"
            bind:value={newBookmarkLabel}
            placeholder="Название (необязательно)"
          /><button class="btn-pri" on:click={addCurrentBookmark}
            >+ Слово {currentWordIndex}</button
          >
        </div>
        {#if bookmarks.length === 0}<p class="empty">Закладок пока нет.</p>
        {:else}{#each bookmarks as bm}<div class="bm-item">
              <button
                class="bm-info"
                on:click={() => goToBookmark(bm.wordIndex)}
                ><span class="bm-label">{bm.label}</span><span
                  class="bm-preview">{bm.preview}</span
                ></button
              ><button
                class="del-btn"
                on:click|stopPropagation={() => removeBookmarkItem(bm.id)}
                >✕</button
              >
            </div>{/each}{/if}
      </div>
    </div>
  {/if}

  {#if showChapters && !isFocusMode}
    <div
      class="panel-overlay"
      on:click|self={() => (showChapters = false)}
      role="presentation"
    >
      <div class="modal-panel wide toc-panel">
        <div class="modal-header">
          <h3>📑 Оглавление</h3>
          <button class="close-x" on:click={() => (showChapters = false)}
            >✕</button
          >
        </div>
        {#if chapters.length === 0}
          <p class="empty">Глав не найдено в этом документе.</p>
        {:else}
          <div class="toc-list">
            {#each chapters as ch, i}
              {@const chStart = ch.wordIndex}
              {@const chEnd =
                i < chapters.length - 1
                  ? chapters[i + 1].wordIndex
                  : words.length}
              {@const chProgress =
                chEnd > chStart
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        ((currentWordIndex - chStart) / (chEnd - chStart)) *
                          100,
                      ),
                    )
                  : 0}
              {@const isCurrent =
                currentWordIndex >= chStart && currentWordIndex < chEnd}
              <button
                class="toc-item"
                class:toc-current={isCurrent}
                class:toc-read={currentWordIndex >= chEnd}
                on:click={() => jumpToChapter(ch)}
              >
                <div class="toc-number">{i + 1}</div>
                <div class="toc-content">
                  <span class="toc-title">{ch.title}</span>
                  <div class="toc-meta">
                    <span
                      >{Math.round((ch.wordIndex / words.length) * 100)}%</span
                    >
                    <span>·</span>
                    <span>{(chEnd - chStart).toLocaleString()} слов</span>
                    {#if isCurrent}
                      <span class="toc-reading-badge">▶ сейчас</span>
                    {/if}
                  </div>
                  {#if isCurrent}
                    <div class="toc-chapter-bar">
                      <div
                        class="toc-chapter-fill"
                        style="width:{chProgress}%"
                      ></div>
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- WELCOME SCREEN -->
  {#if isWelcome}
    <div class="welcome">
      <div class="demo-container">
        <div class="demo-marker"></div>
        <span class="demo-word" key={demoWord}>{demoWord}</span>
      </div>
      <h2>Читай быстрее</h2>
      <p class="welcome-sub">
        RSVP показывает слова по одному в фиксированной точке — глаза не
        двигаются, мозг читает быстрее.
      </p>
      <button
        class="cta-btn"
        on:click={() => {
          showTextInput = true;
          stopDemo();
        }}
        ><svg viewBox="0 0 24 24" fill="currentColor"
          ><path
            d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15.01l1.41 1.41L11 14.84V19h2v-4.16l1.59 1.59L16 15.01 12.01 11 8 15.01z"
          /></svg
        >Загрузить книгу</button
      >
      <p class="formats-hint">PDF, EPUB, FB2, TXT</p>

      {#if library.length > 0}
        <div class="continue-reading">
          <h4>Продолжить чтение</h4>
          {#each library.slice(0, 3) as book}<button
              class="continue-btn"
              on:click={() => openBook(book.id)}
              ><div class="continue-info">
                <span class="continue-title">{book.title}</span><span
                  class="continue-meta"
                  >{book.progress}% · {book.totalWords.toLocaleString()} слов</span
                >
              </div>
              <div class="continue-bar">
                <div class="continue-fill" style="width:{book.progress}%"></div>
              </div></button
            >{/each}
        </div>
      {/if}

      <div class="features">
        <div class="feature">
          <div class="feature-icon">⚡</div>
          <div class="feature-text">
            <strong>300–1000 сл/мин</strong><span
              >Меняй скорость прямо во время чтения</span
            >
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">🎯</div>
          <div class="feature-text">
            <strong>ORP-подсветка</strong><span
              >Красная буква — оптимальная точка фокуса</span
            >
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">📑</div>
          <div class="feature-text">
            <strong>Главы и закладки</strong><span
              >Навигация по главам, сохранение позиции</span
            >
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">💾</div>
          <div class="feature-text">
            <strong>Автосохранение</strong><span
              >Продолжай с того места, где остановился</span
            >
          </div>
        </div>
      </div>

      <div class="how-to">
        <h4>Как пользоваться</h4>
        <div class="steps">
          <div class="step">
            <span class="step-num">1</span><span
              >Загрузи книгу или вставь текст</span
            >
          </div>
          <div class="step">
            <span class="step-num">2</span><span
              >Нажми <kbd>Space</kbd> или кнопку Старт</span
            >
          </div>
          <div class="step">
            <span class="step-num">3</span><span
              >Используй <kbd>↑</kbd><kbd>↓</kbd> или свайп для скорости</span
            >
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="display-area">
      <RSVPDisplay
        word={currentWord}
        wordGroup={wordFrame.subset}
        highlightIndex={wordFrame.centerOffset}
        opacity={wordOpacity}
        {fadeDuration}
        {fadeEnabled}
        multiWordEnabled={frameWordCount > 1}
      />
    </div>
  {/if}

  <SpeedControl
    wpm={wordsPerMinute}
    visible={isFocusMode}
    on:change={handleSpeedChange}
  />

  {#if words.length > 0}
    <div class="bottom-bar" class:minimal={isFocusMode}>
      <ProgressBar
        {progress}
        currentWord={currentWordIndex}
        totalWords={words.length}
        wpm={wordsPerMinute}
        {timeRemaining}
        minimal={isFocusMode}
        clickable={!isPlaying}
        {chapters}
        on:seek={handleProgressClick}
      />
      <div class="controls-area">
        <Controls
          {isPlaying}
          {isPaused}
          canPlay={words.length > 0}
          minimal={isFocusMode}
          on:play={start}
          on:pause={pause}
          on:resume={resume}
          on:stop={stop}
          on:restart={restart}
        />{#if !isFocusMode && currentWordIndex > 0 && !isPlaying && !isPaused}<button
            class="reset-btn"
            on:click={resetToStart}
            title="Сбросить в начало"
            ><svg viewBox="0 0 24 24" fill="currentColor"
              ><path
                d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
              /></svg
            ></button
          >{/if}
      </div>
      {#if !isFocusMode}
        <div class="shortcuts desktop-only">
          <kbd>Space</kbd> Старт <kbd>Esc</kbd> Выход <kbd>↑↓</kbd> Скорость
          <kbd>←→</kbd>
          Пропуск <kbd>G</kbd> Перейти <kbd>B</kbd> Закладка
        </div>
        <div class="touch-controls mobile-only">
          <button
            class="touch-btn"
            on:click={() =>
              (currentWordIndex = Math.max(0, currentWordIndex - 10))}
            ><svg viewBox="0 0 24 24" fill="currentColor"
              ><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg
            ></button
          >
          <button
            class="touch-btn"
            on:click={() =>
              (wordsPerMinute = Math.max(50, wordsPerMinute - 50))}>−WPM</button
          >
          <span class="wpm-show">{wordsPerMinute}</span>
          <button
            class="touch-btn"
            on:click={() =>
              (wordsPerMinute = Math.min(1000, wordsPerMinute + 50))}
            >+WPM</button
          >
          <button
            class="touch-btn"
            on:click={() =>
              (currentWordIndex = Math.min(
                words.length,
                currentWordIndex + 10,
              ))}
            ><svg viewBox="0 0 24 24" fill="currentColor"
              ><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" /></svg
            ></button
          >
        </div>
      {/if}
    </div>
  {/if}
</main>

<style>
  :global(body) {
    background-color: #000 !important;
    margin: 0;
    padding: 0;
    overflow: hidden;
    position: fixed;
    width: 100%;
    height: 100%;
  }
  main {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background-color: #000;
    color: #fff;
    font-family: "Segoe UI", system-ui, sans-serif;
    padding: 1.5rem;
    box-sizing: border-box;
    transition: padding 0.3s ease;
    overflow: hidden;
    padding-top: calc(1.5rem + env(safe-area-inset-top, 0px));
    padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    padding-left: calc(1.5rem + env(safe-area-inset-left, 0px));
    padding-right: calc(1.5rem + env(safe-area-inset-right, 0px));
  }
  main.focus-mode {
    padding: 0.75rem;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    flex-shrink: 0;
    gap: 0.5rem;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  h1 {
    font-size: 1.1rem;
    font-weight: 400;
    color: #555;
    margin: 0;
    white-space: nowrap;
  }
  .book-title {
    color: #888;
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .header-actions {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
  }
  .icon-btn {
    background: transparent;
    border: 1px solid #333;
    color: #555;
    padding: 0.45rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
  }
  .icon-btn:hover {
    border-color: #555;
    color: #fff;
  }
  .icon-btn.active {
    border-color: #ff4444;
    color: #ff4444;
  }
  .icon-btn svg {
    width: 18px;
    height: 18px;
  }
  .panel-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .display-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }

  /* WELCOME */
  .welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 1rem 0;
    gap: 0;
  }
  .demo-container {
    position: relative;
    margin-bottom: 1.5rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .demo-marker {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: 100%;
  }
  .demo-marker::before,
  .demo-marker::after {
    content: "";
    position: absolute;
    left: 0;
    width: 100%;
    height: 12px;
    background: #ff4444;
  }
  .demo-marker::before {
    top: 0;
    mask-image: linear-gradient(to bottom, #000, transparent);
    -webkit-mask-image: linear-gradient(to bottom, #000, transparent);
  }
  .demo-marker::after {
    bottom: 0;
    mask-image: linear-gradient(to top, #000, transparent);
    -webkit-mask-image: linear-gradient(to top, #000, transparent);
  }
  .demo-word {
    font-family: "SF Mono", "Monaco", "Consolas", monospace;
    font-size: clamp(2.5rem, 8vw, 4rem);
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.02em;
  }
  .welcome h2 {
    font-size: clamp(1.5rem, 5vw, 2.2rem);
    font-weight: 700;
    margin: 0 0 0.5rem;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .welcome-sub {
    color: #777;
    font-size: clamp(0.85rem, 2.5vw, 1rem);
    max-width: 420px;
    line-height: 1.5;
    margin: 0 0 1.5rem;
  }
  .cta-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.9rem 2rem;
    background: #ff4444;
    border: none;
    border-radius: 12px;
    color: #fff;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .cta-btn:hover {
    background: #ff5555;
    transform: translateY(-1px);
  }
  .cta-btn:active {
    transform: scale(0.97);
  }
  .cta-btn svg {
    width: 22px;
    height: 22px;
  }
  .formats-hint {
    color: #555;
    font-size: 0.8rem;
    margin: 0.5rem 0 0;
  }
  .continue-reading {
    width: 100%;
    max-width: 400px;
    margin-top: 1.5rem;
  }
  .continue-reading h4 {
    color: #666;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.5rem;
  }
  .continue-btn {
    width: 100%;
    background: #111;
    border: 1px solid #222;
    border-radius: 10px;
    padding: 0.75rem 1rem;
    cursor: pointer;
    text-align: left;
    color: #fff;
    margin-bottom: 0.4rem;
    transition: all 0.15s;
  }
  .continue-btn:hover {
    background: #1a1a1a;
    border-color: #333;
  }
  .continue-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .continue-title {
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 65%;
  }
  .continue-meta {
    color: #666;
    font-size: 0.75rem;
    font-family: monospace;
  }
  .continue-bar {
    height: 3px;
    background: #222;
    border-radius: 2px;
    overflow: hidden;
  }
  .continue-fill {
    height: 100%;
    background: #ff4444;
  }
  .features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    width: 100%;
    max-width: 440px;
    margin-top: 1.5rem;
  }
  .feature {
    display: flex;
    gap: 0.6rem;
    text-align: left;
    padding: 0.6rem;
    background: #0a0a0a;
    border-radius: 10px;
    border: 1px solid #1a1a1a;
  }
  .feature-icon {
    font-size: 1.3rem;
    flex-shrink: 0;
    width: 2rem;
    text-align: center;
  }
  .feature-text {
    display: flex;
    flex-direction: column;
  }
  .feature-text strong {
    color: #ddd;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .feature-text span {
    color: #555;
    font-size: 0.7rem;
    line-height: 1.3;
  }
  .how-to {
    margin-top: 1.25rem;
    width: 100%;
    max-width: 400px;
  }
  .how-to h4 {
    color: #666;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.6rem;
  }
  .steps {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #666;
    font-size: 0.8rem;
  }
  .step-num {
    width: 20px;
    height: 20px;
    background: #1a1a1a;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    color: #ff4444;
    font-weight: 700;
    flex-shrink: 0;
  }
  .step kbd {
    background: #1a1a1a;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.7rem;
    color: #888;
  }

  /* BOTTOM BAR */
  .bottom-bar {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.75rem;
    transition: all 0.3s ease;
  }
  .bottom-bar.minimal {
    gap: 0.4rem;
    padding-top: 0.4rem;
  }
  .controls-area {
    display: flex;
    justify-content: center;
  }
  .shortcuts {
    display: flex;
    justify-content: center;
    gap: 1.25rem;
    color: #444;
    font-size: 0.75rem;
  }
  kbd {
    background: #1a1a1a;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-family: monospace;
    color: #666;
    margin-right: 0.2rem;
  }
  .touch-controls {
    display: none;
    justify-content: center;
    align-items: center;
    gap: 0.4rem;
  }
  .touch-btn {
    background: #1a1a1a;
    border: 1px solid #333;
    color: #888;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  .touch-btn:active {
    background: #333;
    color: #fff;
  }
  .touch-btn svg {
    width: 20px;
    height: 20px;
  }
  .wpm-show {
    color: #ff4444;
    font-family: monospace;
    font-size: 0.85rem;
    min-width: 3rem;
    text-align: center;
  }
  .mobile-only {
    display: none;
  }
  .desktop-only {
    display: flex;
  }

  /* MODALS */
  .modal-panel {
    background: #111;
    border: 1px solid #333;
    border-radius: 16px;
    padding: 1.5rem;
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .modal-panel.wide {
    max-width: 480px;
  }
  .modal-panel h3 {
    margin: 0 0 0.75rem 0;
    color: #fff;
    font-size: 1.15rem;
  }
  .hint {
    color: #666;
    font-size: 0.85rem;
    margin: 0 0 1rem;
  }
  .empty {
    color: #555;
    text-align: center;
    padding: 2rem 0;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .close-x {
    background: none;
    border: none;
    color: #666;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }
  .close-x:hover {
    color: #fff;
  }
  .modal-panel input[type="text"] {
    width: 100%;
    padding: 0.75rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 8px;
    color: #fff;
    font-size: 1rem;
    margin-bottom: 0.75rem;
    box-sizing: border-box;
  }
  .modal-panel input:focus {
    outline: none;
    border-color: #ff4444;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .btn-pri {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    background: #ff4444;
    color: #fff;
    transition: background 0.2s;
    white-space: nowrap;
  }
  .btn-pri:hover {
    background: #ff6666;
  }
  .btn-sec {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    background: #333;
    color: #fff;
  }
  .btn-sec:hover {
    background: #444;
  }
  .quick-jumps {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #222;
  }
  .quick-jumps button {
    flex: 1;
    padding: 0.5rem;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #888;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }
  .quick-jumps button:hover {
    background: #333;
    color: #fff;
  }
  /* Table of Contents */
  .toc-panel {
    max-width: 520px;
  }
  .toc-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 60vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-right: 0.25rem;
  }
  .toc-list::-webkit-scrollbar {
    width: 4px;
  }
  .toc-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .toc-list::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 2px;
  }
  .toc-item {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    width: 100%;
    padding: 0.75rem;
    background: #0d0d0d;
    border: 1px solid #1a1a1a;
    border-radius: 10px;
    color: #aaa;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }
  .toc-item:hover {
    background: #1a1a1a;
    border-color: #333;
    color: #fff;
  }
  .toc-item.toc-current {
    background: #1a0a0a;
    border-color: #ff4444;
    color: #fff;
  }
  .toc-item.toc-read .toc-number {
    background: #1a2a1a;
    color: #4a8;
  }
  .toc-number {
    width: 28px;
    height: 28px;
    background: #1a1a1a;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: #666;
    flex-shrink: 0;
    margin-top: 0.1rem;
    transition: all 0.2s;
  }
  .toc-current .toc-number {
    background: #ff4444;
    color: #fff;
  }
  .toc-content {
    flex: 1;
    min-width: 0;
  }
  .toc-title {
    display: block;
    font-size: 0.9rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toc-meta {
    display: flex;
    gap: 0.4rem;
    color: #555;
    font-size: 0.75rem;
    font-family: monospace;
    margin-top: 0.25rem;
  }
  .toc-reading-badge {
    color: #ff4444;
    font-weight: 600;
    animation: pulse-badge 2s ease-in-out infinite;
  }
  @keyframes pulse-badge {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .toc-chapter-bar {
    height: 3px;
    background: #222;
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.4rem;
  }
  .toc-chapter-fill {
    height: 100%;
    background: linear-gradient(90deg, #ff4444, #ff6666);
    border-radius: 2px;
    transition: width 0.3s;
  }
  /* Reset button */
  .reset-btn {
    background: none;
    border: 1px solid #333;
    color: #666;
    padding: 0.5rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.5rem;
  }
  .reset-btn:hover {
    border-color: #ff4444;
    color: #ff4444;
  }
  .reset-btn svg {
    width: 18px;
    height: 18px;
  }
  .book-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .book-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.15rem;
    border-radius: 8px;
    transition: background 0.15s;
  }
  .book-item:hover {
    background: #1a1a1a;
  }
  .book-item.active {
    background: #1a1a1a;
    border-left: 3px solid #ff4444;
  }
  .book-info {
    flex: 1;
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    text-align: left;
    padding: 0.6rem;
  }
  .book-name {
    display: block;
    font-size: 0.95rem;
    margin-bottom: 0.25rem;
  }
  .book-meta {
    display: flex;
    gap: 0.35rem;
    color: #666;
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }
  .mini-bar {
    height: 3px;
    background: #222;
    border-radius: 2px;
    overflow: hidden;
  }
  .mini-fill {
    height: 100%;
    background: #ff4444;
    transition: width 0.3s;
  }
  .del-btn {
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 0.5rem;
    font-size: 0.9rem;
    border-radius: 6px;
  }
  .del-btn:hover {
    color: #ff4444;
    background: #1a1a1a;
  }
  .add-bm {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    align-items: center;
  }
  .add-bm input {
    flex: 1;
    margin-bottom: 0;
  }
  .bm-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid #1a1a1a;
  }
  .bm-info {
    flex: 1;
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    text-align: left;
    padding: 0.6rem 0;
  }
  .bm-label {
    display: block;
    font-size: 0.9rem;
  }
  .bm-preview {
    display: block;
    color: #555;
    font-size: 0.75rem;
    margin-top: 0.15rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 280px;
  }

  @media (max-width: 600px) {
    main {
      padding: 0.75rem;
      padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
      padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    }
    main.focus-mode {
      padding: 0.5rem;
      padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    }
    .panel-overlay {
      padding: 0.75rem;
    }
    .desktop-only {
      display: none;
    }
    .mobile-only {
      display: flex;
    }
    h1 {
      font-size: 1rem;
    }
    .book-title {
      max-width: 120px;
      font-size: 0.75rem;
    }
    .header-actions {
      gap: 0.25rem;
    }
    .icon-btn {
      padding: 0.4rem;
      min-width: 34px;
      min-height: 34px;
    }
    .icon-btn svg {
      width: 16px;
      height: 16px;
    }
    .modal-panel {
      padding: 1.25rem;
      border-radius: 12px;
    }
    .add-bm {
      flex-direction: column;
    }
    .add-bm .btn-pri {
      width: 100%;
    }
    .features {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
    .steps {
      flex-direction: column;
      align-items: center;
    }
    .welcome h2 {
      font-size: 1.5rem;
    }
  }
</style>
