<script>
  import { createEventDispatcher } from 'svelte';

  export let wordsPerMinute = 300;
  export let fadeEnabled = true;
  export let fadeDuration = 150;
  export let pauseOnPunctuation = true;
  export let punctuationPauseMultiplier = 2;
  export let pauseAfterWords = 0;
  export let pauseDuration = 500;

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }
</script>

<div class="settings-panel">
  <div class="settings-header">
    <h3>Settings</h3>
    <button class="close-icon" on:click={close} title="Close">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  </div>

  <div class="setting">
    <label>
      <span class="setting-label">Words Per Minute</span>
      <span class="setting-value">{wordsPerMinute}</span>
    </label>
    <input type="range" min="50" max="1000" step="25" bind:value={wordsPerMinute}>
  </div>

  <div class="setting">
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={fadeEnabled}>
      <span>Enable Fade Effect</span>
    </label>
  </div>

  {#if fadeEnabled}
    <div class="setting sub-setting">
      <label>
        <span class="setting-label">Fade Duration</span>
        <span class="setting-value">{fadeDuration}ms</span>
      </label>
      <input type="range" min="50" max="300" step="25" bind:value={fadeDuration}>
    </div>
  {/if}

  <div class="setting">
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={pauseOnPunctuation}>
      <span>Pause on Punctuation</span>
    </label>
  </div>

  {#if pauseOnPunctuation}
    <div class="setting sub-setting">
      <label>
        <span class="setting-label">Punctuation Pause</span>
        <span class="setting-value">{punctuationPauseMultiplier}x</span>
      </label>
      <input type="range" min="1" max="4" step="0.5" bind:value={punctuationPauseMultiplier}>
    </div>
  {/if}

  <div class="setting">
    <label>
      <span class="setting-label">Pause Every N Words</span>
      <span class="setting-value">{pauseAfterWords === 0 ? 'Off' : pauseAfterWords}</span>
    </label>
    <input type="range" min="0" max="50" step="5" bind:value={pauseAfterWords}>
  </div>

  {#if pauseAfterWords > 0}
    <div class="setting sub-setting">
      <label>
        <span class="setting-label">Pause Duration</span>
        <span class="setting-value">{pauseDuration}ms</span>
      </label>
      <input type="range" min="100" max="2000" step="100" bind:value={pauseDuration}>
    </div>
  {/if}
</div>

<style>
  .settings-panel {
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 400px;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  h3 {
    margin: 0;
    font-weight: 500;
    color: #fff;
    font-size: 1.1rem;
  }

  .close-icon {
    background: transparent;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    transition: color 0.2s;
  }

  .close-icon:hover {
    color: #fff;
  }

  .close-icon svg {
    width: 20px;
    height: 20px;
  }

  .setting {
    margin-bottom: 1.25rem;
  }

  .setting label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #aaa;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }

  .checkbox-label {
    justify-content: flex-start !important;
    gap: 0.75rem;
    cursor: pointer;
  }

  .setting-label {
    color: #ccc;
  }

  .setting-value {
    color: #ff4444;
    font-weight: 500;
    font-family: monospace;
  }

  .setting input[type="range"] {
    width: 100%;
    height: 6px;
    background: #333;
    border-radius: 3px;
    appearance: none;
    cursor: pointer;
  }

  .setting input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: #ff4444;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .setting input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  .setting input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #ff4444;
    cursor: pointer;
  }

  .sub-setting {
    padding-left: 1.5rem;
    border-left: 2px solid #333;
    margin-left: 0.5rem;
  }
</style>
