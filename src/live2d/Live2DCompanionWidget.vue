<script setup lang="ts">
/**
 * 全站浮動的 Live2D 小夥伴，從原本只在 OracleWizard.vue 解籤結果步驟才出現的
 * 頁面內元件搬出來，掛在 App.vue 讓每個頁面都有。現在預設一直開著、佔滿全螢幕，
 * 不再有 FAB 按鈕跟收合面板那一套。
 * 桌面／手機各自的 Live2DCompanion.vue 內容目前逐字元相同，但比照全站既有的
 * desktop/mobile 分離慣例，仍依裝置動態選其中一份渲染，之後兩邊要各自演化不受影響。
 */
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { isMobileViewport } from '@/utils/device'
import { useLive2DCompanionStore } from '@/stores/live2dCompanionStore'

/* 這兩支才是真正扛著整套 Live2D 引擎（webSDK Framework、useLive2DModel）的元件；
   動態 import 讓桌機/手機只在真的要顯示小夥伴的當下，各自去下載自己那一份，
   不會兩份都跟著這支外層元件一起載入。 */
const DesktopLive2DCompanion = defineAsyncComponent(() => import('@/desktop/components/live2d/Live2DCompanion.vue'))
const MobileLive2DCompanion = defineAsyncComponent(() => import('@/mobile/components/live2d/Live2DCompanion.vue'))

const companion = useLive2DCompanionStore()
const isMobile = isMobileViewport()
const Live2DCompanion = computed(() => (isMobile ? MobileLive2DCompanion : DesktopLive2DCompanion))

/* 這裡只負責讓小夥伴可見（isVisible），不觸發自我介紹語音——那個當下沒有使用者
   手勢，瀏覽器的 autoplay 政策會擋掉。自我介紹改成使用者點角色開聊天室時才講
   （見 companionStore.greet()，一個真正的使用者手勢）。companionStore 仍保留
   isVisible/hasOpenedOnce 狀態，因為 OracleWizard.vue 的求籤儀式流程也會呼叫
   companion.open()。
   延後到瀏覽器閒置（或最長 1.5 秒）才開：一開就跟著載 Cubism Core、連 WebSocket，
   如果緊接在 app 剛掛載、首頁開門動畫還在跑的當下就做，會搶首屏渲染的主執行緒，
   造成剛進站那幾秒明顯卡頓。沒有 requestIdleCallback 的瀏覽器退回 setTimeout。 */
/* 手機不放小夥伴：角色是全螢幕 canvas，在手機上會整片蓋在籤詩與按鈕前面
   （實測過，連分頁標籤都被壓住）。手機版面本來就是「一頁一支籤」，
   沒有多餘空間給一個常駐角色，所以這裡連自動開啟都跳過。 */
onMounted(() => {
  if (isMobileViewport()) return
  const open = () => companion.open()
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(open, { timeout: 1500 })
  } else {
    window.setTimeout(open, 300)
  }
})
</script>

<template>
  <!-- v-if 是第二道閘：求籤儀式的 guideRitualStage() 也會呼叫 companion.open()，
       只擋 onMounted 不夠，手機上一律不渲染。 -->
  <Teleport v-if="!isMobile" to="body">
    <div class="live2d-companion">
      <component :is="Live2DCompanion" v-if="companion.hasOpenedOnce" />
    </div>
  </Teleport>
</template>

<style>
.live2d-companion {
  position: fixed;
  inset: 0;
  z-index: 50;
  /* 這層本身沒有任何可視內容，只是拿來 teleport 全螢幕子元件的容器——如果不設
     none，它自己這個空 div 就會蓋住整個畫面吃走點擊，底下頁面的按鈕、連結全部
     點不到。真正該接收點擊的角色本體/按鈕，各自在自己的子元件裡明講
     pointer-events:auto（見 Live2DCompanion.vue）。 */
  pointer-events: none;
}
</style>
