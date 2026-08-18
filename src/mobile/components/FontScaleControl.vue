<script setup lang="ts">
/* 右上角的字級控制。
   籤詩是要「讀」的東西，來廟裡求籤的人年紀跨度很大，字級不該由我們替他決定。
   固定在右上角、四段字級、每一段都拿「籤」字本身當預覽，選了就記住（localStorage），
   下次掃 QR 開籤也照同一級。 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFontScale } from '@/utils/fontScale'

const { activeKey, step, setScale, steps } = useFontScale()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

function onDocPointerDown(event: PointerEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) open.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})

function choose(key: string) {
  setScale(key)
  // 選完不關，讓人可以連按幾下比較大小
}
</script>

<template>
  <div ref="rootEl" class="font-scale" :class="{ open }">
    <button
      class="fs-toggle"
      type="button"
      :aria-expanded="open"
      aria-label="調整籤詩字級"
      @click="open = !open"
    >
      <span class="fs-glyph" aria-hidden="true">字</span>
      <span class="fs-now">{{ step.label }}</span>
    </button>

    <div v-show="open" class="fs-panel" role="group" aria-label="籤詩字級">
      <p class="fs-title">籤 詩 字 級</p>
      <div class="fs-options">
        <button
          v-for="item in steps"
          :key="item.key"
          class="fs-option"
          :class="{ on: item.key === activeKey }"
          type="button"
          :aria-pressed="item.key === activeKey"
          @click="choose(item.key)"
        >
          <span class="fs-sample" :style="{ fontSize: `${item.value * 19}px` }" aria-hidden="true">籤</span>
          <span class="fs-label">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-scale {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  right: calc(12px + env(safe-area-inset-right));
  /* 要壓在籤紙與雲霧之上，但要讓 AR 全螢幕（z-index 60）蓋掉 */
  z-index: 55;
  font-family: 'Noto Serif TC', serif;
  text-align: right;
}

.fs-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 0 14px 0 12px;
  border: 1px solid rgba(212, 175, 55, 0.55);
  border-radius: 999px;
  cursor: pointer;
  color: #7a2626;
  background: rgba(255, 253, 246, 0.86);
  box-shadow: 0 8px 22px rgba(120, 90, 50, 0.18);
  backdrop-filter: blur(8px);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.fs-toggle:hover { transform: translateY(-1px); }
.fs-glyph {
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}
.fs-now {
  font-size: 12px;
  letter-spacing: 0.14em;
  color: #5b4635;
}
.open .fs-toggle {
  background: linear-gradient(150deg, #a63a3a, #7a2626);
  border-color: rgba(212, 175, 55, 0.7);
  color: #f7e7bd;
}
.open .fs-now { color: rgba(247, 231, 189, 0.85); }

.fs-panel {
  margin-top: 8px;
  padding: 12px 12px 10px;
  border: 1px solid rgba(212, 175, 55, 0.5);
  border-radius: 16px;
  background: rgba(255, 253, 246, 0.94);
  box-shadow: 0 18px 42px rgba(120, 90, 50, 0.24);
  backdrop-filter: blur(10px);
  animation: fs-in 0.18s ease-out both;
}
.fs-title {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: #b08a2a;
  text-align: center;
}
.fs-options { display: flex; gap: 6px; }
.fs-option {
  display: grid;
  gap: 2px;
  place-items: center;
  width: 52px;
  min-height: 62px;
  padding: 6px 2px;
  border: 1px solid rgba(212, 175, 55, 0.32);
  border-radius: 12px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.6);
  color: #5b4635;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.fs-option:hover { border-color: rgba(212, 175, 55, 0.7); }
.fs-option.on {
  background: linear-gradient(160deg, rgba(166, 58, 58, 0.14), rgba(212, 175, 55, 0.2));
  border-color: #a63a3a;
  color: #7a2626;
}
.fs-sample {
  line-height: 1.1;
  /* 預覽字本身就用該級的大小，不必看說明也知道差多少 */
}
.fs-label {
  font-size: 12.5px;
  letter-spacing: 0.08em;
}

@keyframes fs-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 640px) {
  /* 手機的垂直空間很貴：按鈕縮到剛好落在標題那一行的高度裡，
     面板也往內收，不要被螢幕邊切掉。 */
  .font-scale {
    top: calc(7px + env(safe-area-inset-top));
    right: calc(10px + env(safe-area-inset-right));
  }
  .fs-toggle { min-height: 34px; padding: 0 11px 0 10px; gap: 5px; }
  .fs-glyph { font-size: 15px; }
  .fs-now { font-size: 12.5px; }
  .fs-options { gap: 5px; }
  .fs-option { width: 46px; min-height: 58px; }
}

@media (hover: none) {
  .fs-toggle:hover { transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .fs-panel { animation: none; }
}
</style>
