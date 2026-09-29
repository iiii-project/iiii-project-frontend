import { defineStore } from 'pinia'
import { sendWhenReady } from '@/live2d/websocketService'

const GREETING_TEXT = '我是你的解籤助手金鶴，有任何問題都可以問我喔！'

/**
 * 全站共用的小夥伴開合狀態與求籤儀式鎖定狀態。
 */
export const useLive2DCompanionStore = defineStore('live2dCompanion', {
  state: () => ({
    // 由 Live2DCompanionWidget 掛載後立即開啟；進入求籤儀式時只隱藏，
    // 結果頁再恢復顯示，避免重新建立 Live2D。
    isVisible: false,
    hasOpenedOnce: false,
    hasGreeted: false,
    isRitualActive: false
  }),
  actions: {
    open() {
      if (this.isRitualActive) return
      if (this.isVisible) return
      this.isVisible = true
      this.hasOpenedOnce = true
    },
    toggle() {
      if (this.isVisible) {
        this.isVisible = false
        return
      }
      this.open()
    },
    beginRitual() {
      this.isRitualActive = true
      this.isVisible = false
    },
    endRitual() {
      this.isRitualActive = false
    },
    showResult() {
      // 結果頁切換是單一狀態操作，避免 endRitual/open 之間的渲染間隙
      // 讓 Widget 沒有重新掛載 Live2D。
      this.isRitualActive = false
      this.isVisible = true
      this.hasOpenedOnce = true
    },
    /* 自我介紹跟「開不開」分開處理：open() 在頁面一載入就會呼叫（見
       Live2DCompanionWidget.vue），那個當下沒有使用者手勢，瀏覽器 autoplay
       政策會擋掉這時候播放的語音。真正會出聲的 greet()，只在使用者點角色
       打開聊天室（一個真正的使用者手勢）時才呼叫，且只講一次。 */
    greet() {
      if (this.hasGreeted) return
      this.hasGreeted = true
      sendWhenReady({ type: 'speak-text', text: GREETING_TEXT })
    }
  }
})
