import { defineStore } from 'pinia'
import type { HistoryInfo, Message } from '@/live2d/websocketService'

export const useLive2DChatStore = defineStore('live2dChat', {
  state: () => ({
    messages: [] as Message[],
    historyList: [] as HistoryInfo[],
    currentHistoryUid: null as string | null,
    fullResponse: '',
    forceNewMessage: false,
    subtitleText: '你好，我是米粒',
    showSubtitle: true
  }),
  actions: {
    appendHumanMessage(content: string) {
      this.messages.push({
        id: Date.now().toString(),
        content,
        role: 'human',
        timestamp: new Date().toISOString()
      })
    },
    // LLM 是逐字串流的：同一輪回覆的後續片段要接在上一句後面，除非明確要求開新的一句（forceNewMessage）
    appendAIMessage(content: string, name?: string, avatar?: string) {
      const last = this.messages[this.messages.length - 1]
      if (this.forceNewMessage || !last || last.role !== 'ai') {
        this.forceNewMessage = false
        this.messages.push({
          id: Date.now().toString(),
          content,
          role: 'ai',
          timestamp: new Date().toISOString(),
          name,
          avatar
        })
      } else {
        last.content += content
        last.timestamp = new Date().toISOString()
      }
    },
    setMessages(messages: Message[]) {
      this.messages = messages
    },
    setHistoryList(list: HistoryInfo[]) {
      this.historyList = list
    },
    setCurrentHistoryUid(uid: string | null) {
      this.currentHistoryUid = uid
    },
    updateHistoryList(uid: string, latestMessage: Message | null) {
      const history = this.historyList.find((h) => h.uid === uid)
      if (!history) return
      history.latest_message = latestMessage
        ? { content: latestMessage.content, role: latestMessage.role, timestamp: latestMessage.timestamp }
        : null
      history.timestamp = latestMessage?.timestamp || history.timestamp
    },
    setFullResponse(text: string) {
      this.fullResponse = text
    },
    appendResponse(text: string) {
      this.fullResponse += text || ''
    },
    clearResponse() {
      this.fullResponse = ''
    },
    setForceNewMessage(value: boolean) {
      this.forceNewMessage = value
    },
    setSubtitleText(text: string) {
      this.subtitleText = text
    },
    setShowSubtitle(show: boolean) {
      this.showSubtitle = show
    }
  }
})
