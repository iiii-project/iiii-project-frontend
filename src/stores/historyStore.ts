import { defineStore } from 'pinia'
import type { HistoryItem } from '@/types/divination'
import { getAnonymousUserId } from '@/utils/anonymousUser'

export const useHistoryStore = defineStore('history', {
  state: () => ({
    anonymousUserId: getAnonymousUserId(),
    historyItems: [] as HistoryItem[],
    selectedRecord: null as HistoryItem | null
  })
})
