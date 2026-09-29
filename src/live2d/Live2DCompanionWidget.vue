<script setup lang="ts">
/**
 * 全站浮動的 Live2D 小夥伴。進站後只掛載一次；求籤儀式期間隱藏並暫停 render，
 * 結果頁直接恢復，避免把 Cubism/WebGL/model 初始化成本放在結果轉場之後。
 * 全部裝置使用同一份桌面版 Live2DCompanion.vue，並限制在右下角的小型容器內。
 */
import { defineAsyncComponent, onMounted } from 'vue'
import { useLive2DCompanionStore } from '@/stores/live2dCompanionStore'

/* 動態 import 仍保留分 chunk，但元件本身會在 App 初次渲染時預先掛載。 */
const Live2DCompanion = defineAsyncComponent(() => import('@/desktop/components/live2d/Live2DCompanion.vue'))

const companion = useLive2DCompanionStore()

/* 首頁要預設看到角色；這裡只負責確保狀態為可見，不觸發自我介紹語音。
   自我介紹改成使用者點角色開聊天室時才講（見 companionStore.greet()）。 */
onMounted(() => {
  companion.open()
})
</script>

<template>
  <!-- 元件全站只掛載一次；儀式期間只隱藏，避免結果頁才第一次初始化。 -->
  <Teleport to="body">
    <div
      class="live2d-companion"
      :style="{ visibility: companion.isVisible && !companion.isRitualActive ? 'visible' : 'hidden' }"
    >
      <component :is="Live2DCompanion" />
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
