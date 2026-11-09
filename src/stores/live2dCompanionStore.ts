import { defineStore } from 'pinia'
import { sendWhenReady } from '@/live2d/websocketService'

const GREETING_TEXT = '我是你的解籤助手金鶴，有任何問題都可以問我喔！'

/**
 * 全站共用的小夥伴開合狀態（原本是 OracleWizard.vue 內的 companionOpened/
 * companionVisible/hasGreetedCompanion 這幾個頁面局部 ref，現在小夥伴變成
 * 全站浮動元件後得升到這裡，才能在切頁後仍記得「開過一次」跟「打過招呼」）。
 */
export const useLive2DCompanionStore = defineStore('live2dCompanion', {
  state: () => ({
    isVisible: false,
    hasOpenedOnce: false,
    hasGreeted: false
  }),
  actions: {
    open() {
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
