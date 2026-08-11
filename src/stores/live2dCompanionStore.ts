import { defineStore } from 'pinia'
import { sendWhenReady } from '@/live2d/websocketService'

const GREETING_TEXT = '我是你的語音助手，可以用說話或是打字的方式和我對話，進一步詢問籤詩相關的內容。'

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
    /* announce=false 給求籤儀式用：自動彈出來講階段指引時，不要再搶著講一次
       通用自介——但一樣算「已經打過招呼」，之後手動點開也不會補講。 */
    open(announce = true) {
      if (this.isVisible) return
      this.isVisible = true
      this.hasOpenedOnce = true

      if (this.hasGreeted) return
      this.hasGreeted = true
      if (announce) sendWhenReady({ type: 'speak-text', text: GREETING_TEXT })
    },
    toggle() {
      if (this.isVisible) {
        this.isVisible = false
        return
      }
      this.open()
    }
  }
})
