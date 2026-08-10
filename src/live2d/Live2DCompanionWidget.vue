<script setup lang="ts">
/**
 * 全站浮動的 Live2D 小夥伴（FAB 按鈕 + 聊天面板），從原本只在 OracleWizard.vue
 * 解籤結果步驟才出現的頁面內元件搬出來，掛在 App.vue 讓每個頁面都有。
 * 桌面／手機各自的 Live2DCompanion.vue 內容目前逐字元相同，但比照全站既有的
 * desktop/mobile 分離慣例，仍依裝置動態選其中一份渲染，之後兩邊要各自演化不受影響。
 */
import { computed } from 'vue'
import { isMobileViewport } from '@/utils/device'
import { useLive2DCompanionStore } from '@/stores/live2dCompanionStore'
import DesktopLive2DCompanion from '@/desktop/components/live2d/Live2DCompanion.vue'
import MobileLive2DCompanion from '@/mobile/components/live2d/Live2DCompanion.vue'

const companion = useLive2DCompanionStore()
const Live2DCompanion = computed(() => (isMobileViewport() ? MobileLive2DCompanion : DesktopLive2DCompanion))
</script>

<template>
  <Teleport to="body">
    <button
      type="button"
      class="live2d-fab"
      :class="{ 'is-open': companion.isVisible }"
      :aria-label="companion.isVisible ? '收起小夥伴' : '打開小夥伴聊聊'"
      @click="companion.toggle()"
    >
      <span class="live2d-fab__icon">{{ companion.isVisible ? '✕' : '🔮' }}</span>
      <span v-if="!companion.isVisible" class="live2d-fab__pulse" aria-hidden="true"></span>
    </button>
    <div class="live2d-companion" :class="{ 'is-open': companion.isVisible }">
      <component :is="Live2DCompanion" v-if="companion.hasOpenedOnce" />
    </div>
  </Teleport>
</template>

<style>
.live2d-companion {
  position: fixed;
  left: 16px;
  bottom: calc(88px + env(safe-area-inset-bottom));
  z-index: 50;
  width: min(340px, 46vw);
  height: min(460px, 62vh);
  transform-origin: bottom left;
  transform: scale(0.82) translateY(14px);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease;
}
.live2d-companion.is-open {
  transform: scale(1) translateY(0);
  opacity: 1;
  pointer-events: auto;
}
@media (max-width: 640px) {
  .live2d-companion {
    left: 12px;
    bottom: calc(78px + env(safe-area-inset-bottom));
    width: min(220px, 58vw);
    height: min(320px, 42vh);
  }
}

/* ── 小夥伴的呼叫鈕：一顆藏在左下角的圓鈕，點了才把角色跟聊天框叫出來 ── */
.live2d-fab {
  position: fixed;
  left: calc(16px + env(safe-area-inset-left));
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 55;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(212, 175, 55, 0.55);
  background: radial-gradient(circle at 32% 28%, #fff3d6, #d4af37 42%, #a63a3a 100%);
  box-shadow: 0 10px 24px rgba(120, 60, 40, 0.32), inset 0 0 0 2px rgba(255, 253, 240, 0.35);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.live2d-fab:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 14px 28px rgba(120, 60, 40, 0.38); }
.live2d-fab:active { transform: scale(0.96); }
.live2d-fab.is-open {
  background: radial-gradient(circle at 32% 28%, #fff9ec, #f2e2b3 45%, #7a2626 100%);
}
.live2d-fab__icon {
  font-size: 24px;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(58, 28, 15, 0.35));
}
.live2d-fab__pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(212, 175, 55, 0.55);
  animation: live2d-fab-pulse 2.4s ease-out infinite;
  pointer-events: none;
}
@keyframes live2d-fab-pulse {
  0% { transform: scale(1); opacity: 0.65; }
  100% { transform: scale(1.55); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .live2d-fab__pulse { animation: none; }
  .live2d-companion { transition: none; }
}
</style>
