import { defineStore } from 'pinia'

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

const STORAGE_KEY = 'live2d-model-info'

function loadStoredModelInfo(): ModelInfo | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

// 存到 localStorage 前把 url 清空（避免存下可能失效的簽名網址），比照原 React 版行為
function persistModelInfo(info: ModelInfo | undefined) {
  try {
    if (!info) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...info, url: '' }))
    }
  } catch {
    // localStorage 不可用時忽略（例如隱私模式）
  }
}

export const useLive2DConfigStore = defineStore('live2dConfig', {
  state: () => ({
    modelInfo: loadStoredModelInfo() as ModelInfo | undefined,
    isLoading: false
  }),
  actions: {
    setModelInfo(info: ModelInfo | undefined) {
      if (!info?.url) {
        this.modelInfo = undefined
        persistModelInfo(undefined)
        return
      }

      // 一律使用傳入的 kScale（來自後端 conf），乘 2 是既有行為（原 React 版就是這樣，理由不明但保留）
      const finalScale = Number(info.kScale || 0.5) * 2

      this.modelInfo = {
        ...info,
        kScale: finalScale,
        pointerInteractive: 'pointerInteractive' in info ? info.pointerInteractive : (this.modelInfo?.pointerInteractive ?? true),
        scrollToResize: 'scrollToResize' in info ? info.scrollToResize : (this.modelInfo?.scrollToResize ?? true)
      }
      persistModelInfo(this.modelInfo)
    },
    setIsLoading(loading: boolean) {
      this.isLoading = loading
    }
  }
})
