<script setup lang="ts">
defineProps<{ progress: number; shaking: boolean; selected?: boolean }>()
</script>

<template>
  <div class="qian-tong-zone" :class="{ shaking, selected }" :style="{ '--p': progress }" aria-label="電子籤筒">
    <div class="shake-progress-ring" :class="{ on: progress > 0 }"></div>
    <div class="qian-tong" :class="{ aligned: selected }">
      <svg viewBox="0 0 200 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="fortuneTubeGoldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f2e2b3" />
            <stop offset="45%" stop-color="#d4af37" />
            <stop offset="100%" stop-color="#8a6a24" />
          </linearGradient>
          <linearGradient id="fortuneTubeLacquerGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#3a1216" />
            <stop offset="38%" stop-color="#8a2b32" />
            <stop offset="52%" stop-color="#7a2229" />
            <stop offset="100%" stop-color="#2c0e11" />
          </linearGradient>
          <linearGradient id="fortuneTubeBambooGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#f0dca0" />
            <stop offset="50%" stop-color="#c99a5f" />
            <stop offset="100%" stop-color="#8a5a30" />
          </linearGradient>
        </defs>
        <g opacity="0.9">
          <path d="M100,304 C96,318 96,330 100,344" stroke="#8a2b32" stroke-width="3" fill="none" />
          <path d="M92,306 L92,338 M100,308 L100,344 M108,306 L108,338" stroke="#7a2229" stroke-width="2.5" stroke-linecap="round" />
          <circle cx="100" cy="304" r="6" fill="url(#fortuneTubeGoldGrad)" />
        </g>
        <ellipse cx="100" cy="300" rx="66" ry="13" fill="url(#fortuneTubeLacquerGrad)" stroke="var(--gold)" stroke-width="1.5" />
        <ellipse cx="100" cy="296" rx="58" ry="10" fill="none" stroke="url(#fortuneTubeGoldGrad)" stroke-width="1.5" opacity="0.8" />
        <path d="M38,96 C38,78 162,78 162,96 L167,288 C167,302 33,302 33,288 Z" fill="url(#fortuneTubeLacquerGrad)" stroke="rgba(212,175,55,0.55)" stroke-width="1.5" />
        <ellipse cx="100" cy="152" rx="61" ry="7" fill="none" stroke="url(#fortuneTubeGoldGrad)" stroke-width="2" stroke-dasharray="3 6" opacity="0.85" />
        <ellipse cx="100" cy="232" rx="63" ry="7" fill="none" stroke="url(#fortuneTubeGoldGrad)" stroke-width="2" stroke-dasharray="3 6" opacity="0.85" />
        <text x="100" y="196" text-anchor="middle" font-size="26" fill="url(#fortuneTubeGoldGrad)" opacity="0.5" font-family="'Noto Serif TC', serif">籤</text>
        <ellipse cx="100" cy="96" rx="62" ry="14" fill="url(#fortuneTubeGoldGrad)" stroke="rgba(0,0,0,0.35)" stroke-width="1" />
        <ellipse cx="100" cy="94" rx="52" ry="10" fill="#241a12" />
        <g class="temple-sticks" :class="{ 'is-shaking': shaking }">
          <g class="temple-stick"><rect x="70" y="8" width="7" height="92" rx="3" fill="url(#fortuneTubeBambooGrad)" transform="rotate(-9 70 100)" /><circle cx="73.5" cy="10" r="4" fill="var(--gold)" /></g>
          <g class="temple-stick"><rect x="84" y="0" width="7" height="98" rx="3" fill="url(#fortuneTubeBambooGrad)" transform="rotate(-3 84 98)" /><circle cx="87.5" cy="2" r="4" fill="#c94b40" /></g>
          <g class="temple-stick temple-selected-stick"><rect x="100" y="4" width="7" height="94" rx="3" fill="url(#fortuneTubeBambooGrad)" transform="rotate(4 100 98)" /><circle cx="103.5" cy="6" r="4" fill="var(--gold)" /></g>
          <g class="temple-stick"><rect x="116" y="10" width="7" height="90" rx="3" fill="url(#fortuneTubeBambooGrad)" transform="rotate(10 116 100)" /><circle cx="119.5" cy="12" r="4" fill="#c94b40" /></g>
          <g class="temple-stick"><rect x="128" y="18" width="7" height="82" rx="3" fill="url(#fortuneTubeBambooGrad)" transform="rotate(15 128 100)" /><circle cx="131.5" cy="20" r="4" fill="var(--gold)" /></g>
        </g>
      </svg>
    </div>
    <div class="qian-stick" :class="{ revealed: selected, punch: selected }">
      <svg viewBox="0 0 16 168" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="fortuneTubeActiveBambooGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#fbf1d8" />
            <stop offset="50%" stop-color="#e9c46a" />
            <stop offset="100%" stop-color="#8a6a24" />
          </linearGradient>
        </defs>
        <rect x="3" y="0" width="10" height="168" rx="4" fill="url(#fortuneTubeActiveBambooGrad)" />
        <circle cx="8" cy="6" r="7" fill="#c94b40" stroke="var(--gold)" stroke-width="1.5" />
      </svg>
      <div class="stick-tip"></div>
    </div>
  </div>
</template>
