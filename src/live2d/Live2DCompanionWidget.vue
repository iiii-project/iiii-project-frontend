<script setup lang="ts">
/**
 * 全站浮動的 Live2D 小夥伴。預設在瀏覽器閒置後載入，但求籤儀式進行時會卸載，
 * 直到結果頁才重新掛載，避免和 AR/MediaPipe/Three.js 同時爭用客戶端資源。
 * 全部裝置使用同一份桌面版 Live2DCompanion.vue，並限制在右下角的小型容器內。
 */
import { defineAsyncComponent, onMounted } from 'vue'
import { useLive2DCompanionStore } from '@/stores/live2dCompanionStore'

/* 動態 import 讓整套桌面版 Live2D 引擎只在需要顯示時載入。 */
const Live2DCompanion = defineAsyncComponent(() => import('@/desktop/components/live2d/Live2DCompanion.vue'))

const companion = useLive2DCompanionStore()

/* 這裡只負責讓小夥伴可見（isVisible），不觸發自我介紹語音——那個當下沒有使用者
   手勢，瀏覽器的 autoplay 政策會擋掉。自我介紹改成使用者點角色開聊天室時才講
   （見 companionStore.greet()，一個真正的使用者手勢）。companionStore 仍保留
   isVisible/hasOpenedOnce 狀態，因為 OracleWizard.vue 會在結果頁重新開啟角色。
   延後到瀏覽器閒置（或最長 1.5 秒）才開：一開就跟著載 Cubism Core、連 WebSocket，
   如果緊接在 app 剛掛載、首頁開門動畫還在跑的當下就做，會搶首屏渲染的主執行緒，
   造成剛進站那幾秒明顯卡頓。沒有 requestIdleCallback 的瀏覽器退回 setTimeout。 */
onMounted(() => {
  const open = () => companion.open()
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(open, { timeout: 1500 })
  } else {
    window.setTimeout(open, 300)
  }
})
</script>

<template>
  <!-- 儀式期間直接卸載整個元件，釋放 Cubism/WebGL/Live2D WebSocket。 -->
  <Teleport to="body">
    <div class="live2d-companion">
      <component :is="Live2DCompanion" v-if="companion.isVisible && !companion.isRitualActive" />
    </div>
  </Teleport>
</template>

<style>
.live2d-companion {
  position: fixed;
  right: 16px;
  bottom: 0;
  width: min(360px, 32vw);
  height: min(520px, 70vh);
  z-index: 50;
  /* 這層本身沒有任何可視內容，只是拿來 teleport 全螢幕子元件的容器——如果不設
     none，它自己這個空 div 就會蓋住整個畫面吃走點擊，底下頁面的按鈕、連結全部
     點不到。真正該接收點擊的角色本體/按鈕，各自在自己的子元件裡明講
     pointer-events:auto（見 Live2DCompanion.vue）。 */
  pointer-events: none;
}

</style>
