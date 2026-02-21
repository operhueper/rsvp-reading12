<script>
  import { getActualORPIndex } from '../rsvp-utils.js';

  export let word = '';
  export let wordGroup = [];
  export let highlightIndex = 0;
  export let opacity = 1;
  export let fadeDuration = 150;
  export let fadeEnabled = true;
  export let multiWordEnabled = false;

  $: useMultiMode = multiWordEnabled && wordGroup.length > 0;
  $: currentWord = useMultiMode ? (wordGroup[highlightIndex] || '') : word;
  $: orpIdx = currentWord ? getActualORPIndex(currentWord) : -1;
  $: wordPrefix = currentWord ? currentWord.slice(0, orpIdx) : '';
  $: focusChar = currentWord ? (currentWord[orpIdx] || '') : '';
  $: wordSuffix = currentWord ? currentWord.slice(orpIdx + 1) : '';
  $: wordsBefore = useMultiMode ? wordGroup.slice(0, highlightIndex) : [];
  $: wordsAfter = useMultiMode ? wordGroup.slice(highlightIndex + 1) : [];
  $: isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(currentWord);
</script>

<div class="rsvp-display">
  <div class="focus-marker">
    <div class="marker-line top"></div>
    <div class="marker-line bottom"></div>
  </div>

  <div
    class="word-container"
    class:multi-mode={useMultiMode}
    style="opacity: {opacity}; transition: opacity {fadeEnabled ? fadeDuration : 0}ms ease-in-out;"
  >
    {#if currentWord}
      <span class="orp">{focusChar}</span>

      <span class="before-orp" style="direction: {isRtl ? 'rtl' : 'ltr'}">
        {#if isRtl}
          {wordSuffix}{#if useMultiMode && wordsAfter.length > 0}
            &nbsp;<span class="context-words">{wordsAfter.join(' ')}</span>
          {/if}
        {:else}
          {#if useMultiMode && wordsBefore.length > 0}
            <span class="context-words">{wordsBefore.join(' ')}</span>&nbsp;
          {/if}{wordPrefix}
        {/if}
      </span>

      <span class="after-orp" style="direction: {isRtl ? 'rtl' : 'ltr'}">
        {#if isRtl}
          {#if useMultiMode && wordsBefore.length > 0}
            <span class="context-words">{wordsBefore.join(' ')}</span>&nbsp;
          {/if}{wordPrefix}
        {:else}
          {wordSuffix}{#if useMultiMode && wordsAfter.length > 0}
            &nbsp;<span class="context-words">{wordsAfter.join(' ')}</span>
          {/if}
        {/if}
      </span>
    {:else}
      <span class="placeholder">Готов</span>
    {/if}
  </div>
</div>

<style>
  .rsvp-display {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    overflow: hidden;
    /* Critical: contain the absolute children */
    padding: 0;
    margin: 0;
  }

  .focus-marker {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    height: 100%;
    width: 2px;
    pointer-events: none;
    z-index: 10;
  }

  .marker-line {
    position: absolute;
    left: 0;
    width: 100%;
    height: 40px;
  }

  .marker-line.top {
    top: 0;
    background: linear-gradient(to bottom, #ff4444, transparent);
  }

  .marker-line.bottom {
    bottom: 0;
    background: linear-gradient(to top, #ff4444, transparent);
  }

  .word-container {
    position: relative;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', 'Menlo', 'Consolas', monospace;
    /* KEY FIX: Use vw-based sizing that works on mobile */
    font-size: clamp(2rem, 7vw, 5rem);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    /* KEY FIX: Use percentage-based width with max constraint */
    width: 100%;
    max-width: 100vw;
    height: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Prevent overflow on mobile */
    overflow: hidden;
  }

  .word-container.multi-mode {
    font-size: clamp(1rem, 3.5vw, 2.5rem);
  }

  .context-words {
    color: #666;
    font-weight: 400;
  }

  .orp {
    position: absolute;
    /* KEY FIX: Exact center of container */
    left: 50%;
    transform: translateX(-50%);
    color: #ff4444;
    font-weight: 700;
    text-shadow: 0 0 20px rgba(255, 68, 68, 0.5);
    z-index: 2;
  }

  .before-orp {
    position: absolute;
    /* KEY FIX: Position from exact center, offset by half a character */
    right: 50%;
    margin-right: 0.5ch;
    left: auto;
    color: #fff;
    text-align: right;
    /* Prevent long prefixes from overflowing left */
    max-width: 48%;
    overflow: hidden;
  }

  .after-orp {
    position: absolute;
    /* KEY FIX: Position from exact center */
    left: 50%;
    margin-left: 0.5ch;
    color: #fff;
    text-align: left;
    /* Prevent long suffixes from overflowing right */
    max-width: 48%;
    overflow: hidden;
  }

  .placeholder {
    color: #333;
    font-size: 1.5rem;
    font-weight: 300;
    font-family: system-ui, sans-serif;
    line-height: 1;
  }

  /* Mobile-specific fixes */
  @media (max-width: 600px) {
    .rsvp-display {
      min-height: 150px;
    }

    .marker-line {
      height: 25px;
    }

    .word-container {
      /* Slightly smaller on mobile for better fit */
      font-size: clamp(1.75rem, 6.5vw, 3.5rem);
    }

    .word-container.multi-mode {
      font-size: clamp(0.85rem, 3vw, 1.75rem);
    }

    .focus-marker {
      width: 2px;
    }
  }

  @media (max-width: 380px) {
    .word-container {
      font-size: clamp(1.5rem, 6vw, 3rem);
    }

    .word-container.multi-mode {
      font-size: clamp(0.75rem, 2.5vw, 1.5rem);
    }
  }
</style>
