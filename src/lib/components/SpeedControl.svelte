<script>
  import { createEventDispatcher } from 'svelte';

  export let wpm = 300;
  export let visible = false;

  const dispatch = createEventDispatcher();

  let showOverlay = false;
  let overlayTimeout;

  function changeSpeed(delta) {
    const newWpm = Math.max(50, Math.min(1000, wpm + delta));
    dispatch('change', { wpm: newWpm });
    showFlash();
  }

  function showFlash() {
    showOverlay = true;
    clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
      showOverlay = false;
    }, 800);
  }

  // Touch swipe handling for speed control
  let touchStartY = 0;
  let touchStartWpm = 0;
  let isSwiping = false;

  function handleTouchStart(e) {
    touchStartY = e.touches[0].clientY;
    touchStartWpm = wpm;
    isSwiping = false;
  }

  function handleTouchMove(e) {
    const deltaY = touchStartY - e.touches[0].clientY;
    const sensitivity = 2; // pixels per WPM unit

    if (Math.abs(deltaY) > 10) {
      isSwiping = true;
      const wpmDelta = Math.round(deltaY / sensitivity / 25) * 25; // Snap to 25s
      const newWpm = Math.max(50, Math.min(1000, touchStartWpm + wpmDelta));
      if (newWpm !== wpm) {
        dispatch('change', { wpm: newWpm });
        showFlash();
      }
    }
  }

  function handleTouchEnd() {
    isSwiping = false;
  }
</script>

{#if visible}
  <!-- Invisible touch area for swipe speed control -->
  <div
    class="swipe-zone"
    on:touchstart={handleTouchStart}
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}
    role="presentation"
  ></div>

  <!-- Speed buttons for quick adjustment -->
  <div class="speed-controls">
    <button class="speed-btn" on:click={() => changeSpeed(-50)} title="Медленнее">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M19 13H5v-2h14v2z"/>
      </svg>
    </button>
    <span class="speed-value" class:flash={showOverlay}>{wpm}</span>
    <button class="speed-btn" on:click={() => changeSpeed(50)} title="Быстрее">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    </button>
  </div>

  <!-- WPM overlay flash -->
  {#if showOverlay}
    <div class="wpm-overlay" class:visible={showOverlay}>
      <span class="wpm-big">{wpm}</span>
      <span class="wpm-unit">сл/мин</span>
    </div>
  {/if}
{/if}

<style>
  .swipe-zone {
    position: fixed;
    top: 20%;
    left: 0;
    right: 0;
    bottom: 40%;
    z-index: 5;
    touch-action: none;
  }

  .speed-controls {
    position: fixed;
    bottom: 120px;
    right: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    z-index: 20;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .speed-controls:hover,
  .speed-controls:active {
    opacity: 1;
  }

  .speed-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid #444;
    background: rgba(30, 30, 30, 0.9);
    color: #aaa;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
  }

  .speed-btn:hover {
    background: #333;
    color: #fff;
    border-color: #ff4444;
  }

  .speed-btn:active {
    transform: scale(0.9);
    background: #ff4444;
    color: #fff;
  }

  .speed-btn svg {
    width: 18px;
    height: 18px;
  }

  .speed-value {
    font-family: 'SF Mono', monospace;
    font-size: 0.7rem;
    color: #666;
    transition: color 0.2s;
  }

  .speed-value.flash {
    color: #ff4444;
  }

  .wpm-overlay {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    z-index: 50;
    opacity: 0;
    animation: fadeInOut 0.8s ease-out;
  }

  .wpm-overlay.visible {
    opacity: 1;
  }

  .wpm-big {
    font-family: 'SF Mono', monospace;
    font-size: 4rem;
    font-weight: 700;
    color: #ff4444;
    text-shadow: 0 0 40px rgba(255, 68, 68, 0.4);
  }

  .wpm-unit {
    font-size: 1rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  @keyframes fadeInOut {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    80% { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); }
  }

  @media (max-width: 600px) {
    .speed-controls {
      bottom: 140px;
      right: 12px;
    }

    .speed-btn {
      width: 44px;
      height: 44px;
    }

    .wpm-big {
      font-size: 3rem;
    }
  }
</style>
