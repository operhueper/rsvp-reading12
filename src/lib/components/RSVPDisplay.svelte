<script>
  import { getActualORPIndex } from '../rsvp-utils.js';

  export let word = '';
  export let opacity = 1;
  export let fadeDuration = 150;
  export let fadeEnabled = true;

  $: orpIndex = getActualORPIndex(word);
  $: beforeOrp = word ? word.slice(0, orpIndex) : '';
  $: orpLetter = word ? (word[orpIndex] || '') : '';
  $: afterOrp = word ? word.slice(orpIndex + 1) : '';
</script>

<div class="rsvp-display">
  <div class="focus-marker">
    <div class="marker-line top"></div>
    <div class="marker-line bottom"></div>
  </div>

  <div class="word-wrapper">
    <div
      class="word-container"
      style="opacity: {opacity}; transition: opacity {fadeEnabled ? fadeDuration : 0}ms ease-in-out;"
    >
      {#if word}
        <span class="word">
          <span class="before-orp">{beforeOrp}</span>
          <span class="orp">{orpLetter}</span>
          <span class="after-orp">{afterOrp}</span>
        </span>
      {:else}
        <span class="placeholder">Ready</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .rsvp-display {
    position: relative;
    height: 100%;
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .focus-marker {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    height: 100%;
    width: 3px;
    pointer-events: none;
    z-index: 1;
  }

  .marker-line {
    position: absolute;
    left: 0;
    width: 100%;
    height: 50px;
  }

  .marker-line.top {
    top: 0;
    background: linear-gradient(to bottom, #ff4444, transparent);
  }

  .marker-line.bottom {
    bottom: 0;
    background: linear-gradient(to top, #ff4444, transparent);
  }

  .word-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    /* Fixed height to prevent layout shifts */
    height: clamp(4rem, 12vw, 8rem);
  }

  .word-container {
    /* Use a reliable monospace font stack */
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', 'Menlo', 'Consolas', monospace;
    font-size: clamp(3rem, 8vw, 6rem);
    font-weight: 500;
    /* Critical: fixed line-height prevents vertical movement */
    line-height: 1;
    letter-spacing: 0.02em;
    white-space: nowrap;
    position: relative;
    z-index: 2;
    /* Ensure consistent text rendering */
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .word {
    display: inline-flex;
    /* Baseline alignment ensures all characters sit on the same line */
    align-items: baseline;
    /* Fixed height container */
    height: 1em;
  }

  .before-orp {
    color: #fff;
    text-align: right;
    display: inline-block;
    min-width: 6ch;
    width: auto;
    /* Right-align text to flow towards center */
    direction: rtl;
    unicode-bidi: bidi-override;
  }

  .orp {
    color: #ff4444;
    font-weight: 700;
    text-shadow: 0 0 30px rgba(255, 68, 68, 0.6);
    display: inline-block;
    text-align: center;
    /* Fixed width of exactly one character */
    width: 1ch;
  }

  .after-orp {
    color: #fff;
    text-align: left;
    display: inline-block;
    min-width: 6ch;
  }

  .placeholder {
    color: #333;
    font-size: 2rem;
    font-weight: 300;
    font-family: system-ui, sans-serif;
    line-height: 1;
  }
</style>
