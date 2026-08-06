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
      } else {
        this.aiState = nextState
        if (waitingTimer) {
          clearTimeout(waitingTimer)
          waitingTimer = null
        }
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
