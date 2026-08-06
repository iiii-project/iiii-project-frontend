import { defineStore } from 'pinia'

export const AiStateEnum = {
  IDLE: 'idle',
  THINKING_SPEAKING: 'thinking-speaking',
  INTERRUPTED: 'interrupted',
  LOADING: 'loading',
  LISTENING: 'listening',
  WAITING: 'waiting'
} as const

export type AiState = (typeof AiStateEnum)[keyof typeof AiStateEnum]

let waitingTimer: ReturnType<typeof setTimeout> | null = null
let thinkingSpeakingWatchdog: ReturnType<typeof setTimeout> | null = null

/* 正常情況下 THINKING_SPEAKING 一定會被 conversation-chain-end 帶回 IDLE。實測遇過一次
   角色講完話之後，過了快 1 分半，使用者輸入新訊息卻無端觸發「打斷」——追下去發現
   handleSend()/interrupt() 三個會送出 interrupt-signal 的地方全部都要先檢查
   aiState === 'thinking-speaking' 才會動作，代表狀態真的卡在 thinking-speaking 沒被
   帶回 idle（可能是 conversation-chain-end 這則訊息在某個環節遺失，還沒抓到確切原因）。
   這裡加一個保底逾時：卡在 thinking-speaking 太久就強制拉回 idle，不要讓角色卡死、
   也不要讓使用者下一個正常動作莫名其妙變成一次打斷。90 秒是抓「正常一輪對話（含很長的
   LLM 回覆＋TTS 播放）」的寬鬆上限，不會誤砍真的還在講話的情況。 */
const THINKING_SPEAKING_WATCHDOG_MS = 90_000

export const useAiStateStore = defineStore('aiState', {
  state: () => ({
    aiState: AiStateEnum.LOADING as AiState,
    backendSynthComplete: false
  }),
  getters: {
    isIdle: (state) => state.aiState === AiStateEnum.IDLE,
    isThinkingSpeaking: (state) => state.aiState === AiStateEnum.THINKING_SPEAKING,
    isInterrupted: (state) => state.aiState === AiStateEnum.INTERRUPTED,
    isLoading: (state) => state.aiState === AiStateEnum.LOADING,
    isListening: (state) => state.aiState === AiStateEnum.LISTENING,
    isWaiting: (state) => state.aiState === AiStateEnum.WAITING
  },
  actions: {
    // WAITING 狀態 2 秒後自動回到 IDLE（除非目前正在 THINKING_SPEAKING，那就忽略這次 WAITING 請求）
    setAiState(next: AiState | ((current: AiState) => AiState)) {
      const nextState = typeof next === 'function' ? next(this.aiState) : next

      if (nextState === AiStateEnum.WAITING) {
        if (this.aiState !== AiStateEnum.THINKING_SPEAKING) {
          this.aiState = nextState
          if (waitingTimer) clearTimeout(waitingTimer)
          waitingTimer = setTimeout(() => {
            this.aiState = AiStateEnum.IDLE
            waitingTimer = null
          }, 2000)
        }
        return
      }

      this.aiState = nextState
      if (waitingTimer) {
        clearTimeout(waitingTimer)
        waitingTimer = null
      }

      if (thinkingSpeakingWatchdog) {
        clearTimeout(thinkingSpeakingWatchdog)
        thinkingSpeakingWatchdog = null
      }
      if (nextState === AiStateEnum.THINKING_SPEAKING) {
        thinkingSpeakingWatchdog = setTimeout(() => {
          thinkingSpeakingWatchdog = null
          if (this.aiState !== AiStateEnum.THINKING_SPEAKING) return
          console.warn('aiState 卡在 thinking-speaking 超過保底時間，強制拉回 idle')
          this.aiState = AiStateEnum.IDLE
        }, THINKING_SPEAKING_WATCHDOG_MS)
      }
    },
    setBackendSynthComplete(complete: boolean) {
      this.backendSynthComplete = complete
    },
    resetState() {
      this.setAiState(AiStateEnum.IDLE)
    }
  }
})
