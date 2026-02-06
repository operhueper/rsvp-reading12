<script>
  import { createEventDispatcher } from 'svelte';

  export let progress = 0;
  export let currentWord = 0;
  export let totalWords = 0;
  export let wpm = 300;
  export let timeRemaining = '0:00';
  export let minimal = false;
  export let clickable = false;
  export let chapters = [];

  const dispatch = createEventDispatcher();

  // Calculate chapter marker positions as percentages
  $: chapterMarkers = chapters.map(ch => ({
    position: totalWords > 0 ? (ch.wordIndex / totalWords) * 100 : 0,
    title: ch.title
  }));

  // Current chapter name
  $: currentChapter = getCurrentChapter(currentWord, chapters);

  function getCurrentChapter(wordIdx, chs) {
    if (!chs || chs.length === 0) return '';
    for (let i = chs.length - 1; i >= 0; i--) {
      if (wordIdx >= chs[i].wordIndex) return chs[i].title;
    }
    return chs[0]?.title || '';
  }

  function handleClick(event) {
    if (!clickable) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    dispatch('seek', { percentage: Math.max(0, Math.min(100, percentage)) });
  }

  function handleTouch(event) {
    if (!clickable) return;
    const touch = event.touches[0];
    const rect = event.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    dispatch('seek', { percentage: Math.max(0, Math.min(100, percentage)) });
  }

  function handleKeydown(event) {
    if (!clickable) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      dispatch('seek', { percentage: Math.max(0, progress - step) });
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      dispatch('seek', { percentage: Math.min(100, progress + step) });
    }
  }
</script>

<div class="progress-wrapper" class:minimal>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="progress-container"
    class:clickable
    role={clickable ? "slider" : undefined}
    tabindex={clickable ? 0 : undefined}
    aria-valuenow={clickable ? Math.round(progress) : undefined}
    aria-valuemin={clickable ? 0 : undefined}
    aria-valuemax={clickable ? 100 : undefined}
    aria-label={clickable ? "Прогресс чтения" : undefined}
    on:click={handleClick}
    on:touchstart={handleTouch}
    on:keydown={handleKeydown}
  >
    <div class="progress-bar" style="width: {progress}%"></div>

    <!-- Chapter markers on the timeline -->
    {#each chapterMarkers as marker}
      <div
        class="chapter-marker"
        style="left: {marker.position}%"
        title={marker.title}
      ></div>
    {/each}
  </div>

  {#if !minimal}
    <div class="stats">
      <span class="stat">{currentWord} / {totalWords}</span>
      {#if currentChapter}
        <span class="stat chapter-name" title={currentChapter}>
          {currentChapter.length > 25 ? currentChapter.slice(0, 25) + '…' : currentChapter}
        </span>
      {/if}
      <span class="stat wpm">{wpm} сл/мин</span>
      <span class="stat">{timeRemaining}</span>
    </div>
  {:else}
    <div class="stats-minimal">
      <span class="stat wpm">{wpm}</span>
      <span class="stat">{timeRemaining}</span>
    </div>
  {/if}
</div>

<style>
  .progress-wrapper {
    width: 100%;
  }

  .progress-container {
    position: relative;
    height: 4px;
    background: #222;
    border-radius: 2px;
    overflow: visible; /* Allow chapter markers to overflow */
  }

  .progress-container.clickable {
    cursor: pointer;
    height: 6px;
    transition: height 0.2s ease;
  }

  .progress-container.clickable:hover,
  .progress-container.clickable:focus {
    height: 12px;
    outline: none;
  }

  .progress-container.clickable:focus-visible {
    box-shadow: 0 0 0 2px #ff4444;
  }

  .minimal .progress-container {
    height: 3px;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #ff4444, #ff6666);
    transition: width 0.1s linear;
    border-radius: 2px;
  }

  .chapter-marker {
    position: absolute;
    top: -3px;
    width: 2px;
    height: calc(100% + 6px);
    background: #555;
    transform: translateX(-50%);
    pointer-events: none;
    opacity: 0.7;
  }

  .stats {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: #555;
    gap: 0.5rem;
  }

  .stats-minimal {
    display: flex;
    justify-content: center;
    gap: 1.5rem;
    margin-top: 0.35rem;
    font-size: 0.75rem;
    color: #555;
  }

  .stat {
    font-family: monospace;
    white-space: nowrap;
  }

  .chapter-name {
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .wpm {
    color: #ff4444;
  }

  @media (max-width: 600px) {
    .stats {
      font-size: 0.7rem;
      gap: 0.35rem;
      margin-top: 0.5rem;
    }

    .progress-container.clickable {
      /* Bigger touch target on mobile */
      height: 8px;
      margin: 4px 0;
    }

    .progress-container.clickable:hover,
    .progress-container.clickable:focus {
      height: 14px;
    }
  }
</style>
