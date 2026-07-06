import { defineStore } from 'pinia'
import type { BlockCast, Category, Fortune, FortuneSet, InteractionMode, Interpretation } from '@/types/divination'

export const useDivinationStore = defineStore('divination', {
  state: () => ({
    sessionId: '',
    question: '',
    category: 'career' as Category,
    interactionMode: 'click' as InteractionMode,
    fortuneSet: null as FortuneSet | null,
    status: 'created',
    fortune: null as Fortune | null,
    blockCasts: [] as BlockCast[],
    confirmed: false,
    interpretation: null as Interpretation | null
  }),
  actions: {
    reset() {
      this.sessionId = ''
      this.question = ''
      this.category = 'career'
      this.interactionMode = 'click'
      this.fortuneSet = null
      this.status = 'created'
      this.fortune = null
      this.blockCasts = []
      this.confirmed = false
      this.interpretation = null
    }
  }
})
