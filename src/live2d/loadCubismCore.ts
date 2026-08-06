import { LAppAdapter } from '@/live2d/webSDK/engine/lappadapter'

let loadPromise: Promise<void> | null = null

/** 動態載入 Cubism Core runtime script（public/live2d/libs/live2dcubismcore.js），
 * 並掛上 window.getLAppAdapter（WebSDK 內部到處靠這個全域函式拿 LAppAdapter 單例）。
 * 只會真的載入一次，重複呼叫回傳同一個 Promise。 */
export function loadCubismCore(): Promise<void> {
  if (loadPromise) return loadPromise

  ;(window as any).getLAppAdapter = () => LAppAdapter.getInstance()

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/live2d/libs/live2dcubismcore.js'
    script.onload = () => resolve()
    script.onerror = (error) => reject(error)
    document.head.appendChild(script)
  })

  return loadPromise
}
