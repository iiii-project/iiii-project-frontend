import { defineStore } from 'pinia'
import { sendWhenReady, wsService } from '@/live2d/websocketService'
import { audioManager } from '@/live2d/audioManager'
import { audioTaskQueue } from '@/live2d/taskQueue'
import { useAiStateStore } from '@/stores/aiStateStore'
import { useLive2DChatStore } from '@/stores/live2dChatStore'

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
    isRitualActive: false,
    // 每次 resetConversation() 遞增；Live2DCompanion.vue 看到就關掉聊天室、清掉草稿
    conversationToken: 0,
    // 目前這一場的求籤資料（見 utils/fortuneContext）。後端每開一段新對話
    // （含斷線重連）都會清掉它，所以這裡留一份，收到 new-history-created 就補送。
    fortuneContext: ''
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
    },
    /* 一場求籤結束、回到首頁時呼叫：換成全新的對話 session，
       下一位信眾看不到上一位的對話，角色也不會記得上一位的問題與籤詩。
       - 前端：停掉正在播的語音、清空聊天泡泡與字幕、重新打招呼
       - 後端：create-new-history 會建立新的紀錄檔、清空角色記憶與求籤資料
         （見後端 consumers.py 的 _handle_create_history） */
    /* 求籤／查籤結果頁有了籤詩（或解籤補回來）時呼叫：角色之後的回答都會接著這支籤。
       不必等使用者先點開角色——資料放在後端 system prompt 的資料區塊，不會被開場白蓋掉。 */
    setFortuneContext(text: string) {
      this.fortuneContext = text
      if (text) wsService.sendMessage({ type: 'remember-context', text })
    },
    resendFortuneContext() {
      if (this.fortuneContext) wsService.sendMessage({ type: 'remember-context', text: this.fortuneContext })
    },
    resetConversation() {
      const aiState = useAiStateStore()
      const chat = useLive2DChatStore()
      if (aiState.aiState === 'thinking-speaking') {
        // 讓後端取消還在產生的回覆，免得舊的回覆在新對話裡冒出來
        wsService.sendMessage({ type: 'interrupt-signal', text: '' })
      }
      audioManager.stopCurrentAudioAndLipSync()
      audioTaskQueue.clearQueue()
      aiState.setAiState('idle')
      chat.$reset()
      this.hasGreeted = false
      this.fortuneContext = ''
      this.conversationToken += 1
      // 連線沒開也沒關係：重新連上時 initializeConnection() 本來就會送 create-new-history，
      // 而且新連線在後端是全新的 context。
      wsService.sendMessage({ type: 'create-new-history' })
    }
  }
})
