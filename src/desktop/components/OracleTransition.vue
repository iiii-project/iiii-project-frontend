<script setup lang="ts">
/* 領籤過場（龍銜籤送到眼前）。
   AR 儀式裡本來就有這一段，但那份實作住在 web component 的 shadow DOM 裡，
   Vue 頁面拿不到它的元素。這裡只把「畫面」搬出來，播放邏輯直接沿用引擎的
   playOracleTransition——揭曉時機、影片載不到時退回墨染過場、卡住的保險，
   全部同一份程式，不再各寫一套。

   用法：ref 拿到元件後呼叫 play()，回傳的 Promise 會在「揭曉點」resolve
   （影片播到尾聲、或墨染蓋滿畫面時），那一刻再把結果換上去，
   使用者看到的就是龍把籤送到眼前、畫面接著變成籤詩。 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  playOracleTransition,
  preloadOracleTransition
} from '@/ar/temple-ar-oracle/engine/flow-controller.js'

const videoEl = ref<HTMLVideoElement | null>(null)
const overlayEl = ref<HTMLElement | null>(null)
const active = ref(false)

let hideTimer = 0

onMounted(() => {
  // 先把影片抓下來，真的要播時才不會卡在載入
  if (videoEl.value && overlayEl.value) {
    preloadOracleTransition({ transitionVideo: videoEl.value, transitionOverlay: overlayEl.value })
  }
})

onBeforeUnmount(() => {
  if (hideTimer) window.clearTimeout(hideTimer)
  videoEl.value?.pause()
})

/** 播放過場；Promise 在揭曉點 resolve（此時可以把結果畫面換上） */
function play(): Promise<void> {
  const video = videoEl.value
  const overlay = overlayEl.value
  if (!video || !overlay) return Promise.resolve()

  if (hideTimer) window.clearTimeout(hideTimer)
  active.value = true

  return new Promise<void>((resolve) => {
    let settled = false
    const reveal = () => {
      if (settled) return
      settled = true
      resolve()
      /* 揭曉之後這一層還要留一下讓影片收尾淡出（引擎裡是 720ms），
         時間到再整層關掉，避免它一直蓋在頁面上吃點擊。 */
      hideTimer = window.setTimeout(() => { active.value = false }, 1400)
    }
    playOracleTransition({ transitionVideo: video, transitionOverlay: overlay }, reveal)
    /* 保險：引擎那邊已經有影片卡死的硬上限，但萬一連 reveal 都沒被呼叫，
       這裡也要把流程放行，不能讓使用者永遠停在過場上。 */
    window.setTimeout(reveal, 9000)
  })
}

defineExpose({ play })
</script>

<template>
  <!-- 蓋在整頁之上；不接受點擊，純粹是一段過場 -->
  <div v-show="active" class="oracle-transition" aria-hidden="true">
    <video ref="videoEl" class="transition-video" playsinline preload="auto"></video>
    <div ref="overlayEl" class="transition-overlay">
      <span class="ink-blot"></span>
      <span class="gold-ring"></span>
    </div>
  </div>
</template>

<style scoped>
/* 數值與 AR 引擎的 styles.css 同一組（#oracle-transition-video / #transition-overlay），
   兩邊的過場看起來才是同一個。 */
.oracle-transition {
  position: fixed;
  inset: 0;
  z-index: 70;
  pointer-events: none;
}

.transition-video {
  position: fixed;
  inset: 0;
  z-index: 72;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: radial-gradient(120% 90% at 50% 42%, #fffdf6 0%, #fbf9f5 46%, #f3ece0 100%);
  opacity: 0;
  pointer-events: none;
  will-change: opacity;
  transition: opacity 260ms ease-out;
}
.transition-video.show { opacity: 1; }
.transition-video.fade-out { transition: opacity 700ms ease-in; opacity: 0; }

/* 直式螢幕（手機）比例本來就吻合，鋪滿裁掉極少的邊 */
@media (max-aspect-ratio: 3 / 4) {
  .transition-video { object-fit: cover; }
}

.transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.transition-overlay .ink-blot {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: radial-gradient(circle, #2b211a 60%, #7a2626 100%);
  transform: scale(0);
  opacity: 0;
}
.transition-overlay .gold-ring {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid #f2e2b3;
  transform: scale(0);
  opacity: 0;
}
.transition-overlay.play .ink-blot { animation: ink-expand 0.85s cubic-bezier(0.6, 0, 0.3, 1) forwards; }
.transition-overlay.play .gold-ring { animation: gold-ring-expand 0.95s cubic-bezier(0.5, 0, 0.3, 1) forwards; }

@keyframes ink-expand {
  0% { transform: scale(0); opacity: 0; }
  35% { transform: scale(45); opacity: 1; }
  70% { transform: scale(48); opacity: 1; }
  100% { transform: scale(60); opacity: 0; }
}
@keyframes gold-ring-expand {
  0% { transform: scale(0); opacity: 0; }
  40% { transform: scale(42); opacity: 0.9; }
  100% { transform: scale(58); opacity: 0; }
}
</style>
