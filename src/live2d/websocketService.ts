/**
 * Live2D 角色的 WebSocket client。移植自 live2d-frontend 的 WebSocketService，
 * 拿掉 rxjs（改用陣列存 callback 的極簡訂閱機制）跟 toaster/i18next（改用 console），
 * 其餘行為（連線後自動送 4 個初始化訊息、訊息/連線狀態廣播）原樣保留。
 */

export interface DisplayText {
  text: string
  name: string
  avatar: string
}

export interface Actions {
  expressions?: string[] | number[]
  pictures?: string[]
  sounds?: string[]
}

export interface ModelInfo {
  name?: string
  description?: string
  url: string
  kScale: number
  initialXshift: number
  initialYshift: number
  idleMotionGroupName?: string
  defaultEmotion?: number | string
  emotionMap: Record<string, number>
  pointerInteractive?: boolean
  scrollToResize?: boolean
}

export interface HistoryInfo {
  uid: string
  latest_message: { role: string; content: string; timestamp: string } | null
  timestamp: string | null
}

export interface ConfigFile {
  filename: string
  name: string
}

export interface Message {
  id: string
  content: string
  role: 'ai' | 'human'
  timestamp: string
  name?: string
  avatar?: string
}

export interface MessageEvent {
  type: string
  text?: string
  audio?: string
  volumes?: number[]
  slice_length?: number
  display_text?: DisplayText
  actions?: Actions
  model_info?: ModelInfo
  conf_name?: string
  conf_uid?: string
  client_uid?: string
  messages?: Message[]
  history_uid?: string
  success?: boolean
  histories?: HistoryInfo[]
  configs?: ConfigFile[]
  files?: string[]
  message?: string
  forwarded?: boolean
}

export type WsState = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'

class WebSocketService {
  private static instance: WebSocketService

  private ws: WebSocket | null = null

  private messageListeners = new Set<(message: MessageEvent) => void>()

  private stateListeners = new Set<(state: WsState) => void>()

  private currentState: WsState = 'CLOSED'

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService()
    }
    return WebSocketService.instance
  }

  private initializeConnection() {
    this.sendMessage({ type: 'fetch-backgrounds' })
    this.sendMessage({ type: 'fetch-configs' })
    this.sendMessage({ type: 'fetch-history-list' })
    this.sendMessage({ type: 'create-new-history' })
  }

  private setState(state: WsState) {
    this.currentState = state
    this.stateListeners.forEach((cb) => cb(state))
  }

  connect(url: string) {
    if (this.ws?.readyState === WebSocket.CONNECTING || this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect()
    }

    try {
      this.ws = new WebSocket(url)
      this.setState('CONNECTING')

      this.ws.onopen = () => {
        // initializeConnection() 先送出，setState('OPEN') 再送——這樣 sendWhenReady()
        // 這類「連線後立刻送一則訊息」的呼叫端，一定會排在 create-new-history 之後才送達
        // 後端。順序反過來的話，create-new-history 會把 agent 記憶重置成空，蓋掉剛才那則
        // 訊息寫進記憶的結果（實測踩過一次：speak-text 念完的內容會在追問時憑空消失）。
        this.initializeConnection()
        this.setState('OPEN')
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.messageListeners.forEach((cb) => cb(message))
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onclose = () => this.setState('CLOSED')
      this.ws.onerror = () => this.setState('CLOSED')
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error)
      this.setState('CLOSED')
    }
  }

  sendMessage(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not open. Unable to send message:', message)
    }
  }

  onMessage(callback: (message: MessageEvent) => void): () => void {
    this.messageListeners.add(callback)
    return () => this.messageListeners.delete(callback)
  }

  onStateChange(callback: (state: WsState) => void): () => void {
    this.stateListeners.add(callback)
    return () => this.stateListeners.delete(callback)
  }

  disconnect() {
    /* close() 是非同步的，舊 socket 的 onclose/onerror 之後仍可能遲到觸發。若不先拔掉
       這些 callback，等新連線已經 connect() 建立、甚至已經 OPEN 之後，舊 socket 那個遲
       到的 onclose 還是會呼叫 setState('CLOSED')，把剛連上的新連線狀態誤蓋成關閉，導致
       依賴 wsState 的呼叫端誤判並可能觸發不必要的重連/重送初始化訊息。 */
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
    }
    this.ws = null
  }

  getCurrentState(): WsState {
    return this.currentState
  }
}

export const wsService = WebSocketService.getInstance()

/**
 * 送出一則訊息，若連線還沒 OPEN（例如 Live2DCompanion 剛掛載、Cubism Core 還在載入）
 * 就先等到 OPEN 再送，而不是直接丟失。給 OracleWizard.vue 這種跟角色元件不是父子關係、
 * 只能透過共用的 wsService 單例互動的呼叫端用。
 */
export function sendWhenReady(message: object, timeoutMs = 8000): Promise<boolean> {
  if (wsService.getCurrentState() === 'OPEN') {
    wsService.sendMessage(message)
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null
    const timer = setTimeout(() => {
      unsubscribe?.()
      console.warn('sendWhenReady: timed out waiting for WebSocket to open', message)
      resolve(false)
    }, timeoutMs)

    unsubscribe = wsService.onStateChange((state) => {
      if (state !== 'OPEN') return
      clearTimeout(timer)
      unsubscribe?.()
      wsService.sendMessage(message)
      resolve(true)
    })
  })
}
