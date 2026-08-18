import { onBeforeUnmount, ref } from 'vue'
import { wsService, type MessageEvent as WsMessageEvent } from '@/live2d/websocketService'
import { useAiStateStore, type AiState } from '@/stores/aiStateStore'
import { useLive2DConfigStore } from '@/stores/live2dConfigStore'
import { useLive2DChatStore } from '@/stores/live2dChatStore'
import { audioTaskQueue } from '@/live2d/taskQueue'

/**
 * 移植自 websocket-handler.tsx 的訊息路由邏輯。裁掉的訊息類型（跟後端 apps.live2d 的
 * Live2DConsumer 對應：這些後端本來就不會送）：群組對話（group-update 等）、視覺/姿勢
 * 相關、MCP 工具（tool_call_status）、角色切換結果通知（config-switched，因為這個部署
 * 只有一個固定角色）。
 */

const isWebOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:'
const DEFAULT_WS_URL = isWebOrigin
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/client-ws`
  : 'ws://127.0.0.1:8003/client-ws'
const DEFAULT_BASE_URL = isWebOrigin ? window.location.origin : 'http://127.0.0.1:8003'

interface UseLive2DWebSocketOptions {
  addAudioTask: (options: {
    audioBase64: string
    volumes: number[]
    sliceLength: number
    displayText?: any
    expressions?: any
  }) => void
  // 現在這個嵌入場景沒有麥克風（STT 已移除），這兩個保留是因為後端理論上還是可能送
  // start-mic/stop-mic 控制訊息（沿用同一套協定），選填、收到就安全地當no-op。
  startMic?: () => Promise<void>
  stopMic?: () => void
}

export function useLive2DWebSocket(options: UseLive2DWebSocketOptions) {
  const aiState = useAiStateStore()
  const config = useLive2DConfigStore()
  const chat = useLive2DChatStore()

  const wsState = ref(wsService.getCurrentState())
  const baseUrl = DEFAULT_BASE_URL

  function handleControlMessage(controlText: string) {
    switch (controlText) {
      case 'start-mic':
        console.log('Starting microphone...')
        options.startMic?.()
        break
      case 'stop-mic':
        console.log('Stopping microphone...')
        options.stopMic?.()
        break
      case 'conversation-chain-start':
        aiState.setAiState('thinking-speaking')
        audioTaskQueue.clearQueue()
        chat.clearResponse()
        break
      case 'conversation-chain-end':
        audioTaskQueue.addTask(
          () =>
            new Promise<void>((resolve) => {
              aiState.setAiState((current: AiState) => (current === 'thinking-speaking' ? 'idle' : current))
              resolve()
            })
        )
        break
      default:
        console.warn('Unknown control command:', controlText)
    }
  }

  function handleMessage(message: WsMessageEvent) {
    console.log('Received message from server:', message)
    switch (message.type) {
      case 'control':
        if (message.text) handleControlMessage(message.text)
        break
      case 'set-model-and-conf':
        aiState.setAiState('loading')
        if (message.model_info) {
          const modelInfo = message.model_info
          if (!modelInfo.url.startsWith('http')) {
            modelInfo.url = baseUrl + modelInfo.url
          }
          config.setModelInfo(modelInfo)
        }
        aiState.setAiState('idle')
        break
      case 'full-text':
        if (message.text) chat.setSubtitleText(message.text)
        break
      case 'audio':
        if (aiState.aiState === 'interrupted' || aiState.aiState === 'listening') {
          console.log('Audio playback intercepted. Sentence:', message.display_text?.text)
        } else {
          options.addAudioTask({
            audioBase64: message.audio || '',
            volumes: message.volumes || [],
            sliceLength: message.slice_length || 0,
            displayText: message.display_text || null,
            expressions: message.actions?.expressions || null
          })
        }
        break
      case 'history-data':
        if (message.messages) chat.setMessages(message.messages)
        break
      case 'new-history-created':
        aiState.setAiState('idle')
        chat.setSubtitleText('已建立新對話')
        if (message.history_uid) {
          chat.setCurrentHistoryUid(message.history_uid)
          chat.setMessages([])
          chat.setHistoryList([{ uid: message.history_uid, latest_message: null, timestamp: new Date().toISOString() }, ...chat.historyList])
        }
        break
      case 'history-list':
        if (message.histories) {
          chat.setHistoryList(message.histories)
          if (message.histories.length > 0) chat.setCurrentHistoryUid(message.histories[0].uid)
        }
        break
      case 'user-input-transcription':
        if (message.text) chat.appendHumanMessage(message.text)
        break
      case 'error':
        console.error('Server error:', message.message)
        break
      case 'backend-synth-complete':
        aiState.setBackendSynthComplete(true)
        break
      case 'force-new-message':
        chat.setForceNewMessage(true)
        break
      case 'heartbeat-ack':
      case 'config-files':
      case 'background-files':
      case 'history-deleted':
        // 目前這個嵌入場景不需要角色切換/背景/歷史刪除的 UI 回饋，收到就好，不用特別處理
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  let unsubscribeMessage: (() => void) | null = null
  let unsubscribeState: (() => void) | null = null

  // 不在這裡自動連線：Cubism Core script 要先載入完成，由呼叫端（Live2DCompanion.vue）
  // 確認引擎就緒後再呼叫 connect()，避免 set-model-and-conf 訊息先到、initializeLive2D
  // 卻還沒能用。
  function connect() {
    unsubscribeState = wsService.onStateChange((state) => {
      wsState.value = state
    })
    unsubscribeMessage = wsService.onMessage(handleMessage)
    wsService.connect(DEFAULT_WS_URL)
  }

  onBeforeUnmount(() => {
    unsubscribeState?.()
    unsubscribeMessage?.()
    wsService.disconnect()
  })

  return {
    wsState,
    connect,
    sendMessage: wsService.sendMessage.bind(wsService)
  }
}
