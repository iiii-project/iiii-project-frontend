// 共用的手機視窗判斷；目前路由不再依裝置分流，這個工具只供響應式元件
// （例如 Live2D 與效能設定）使用。
export const MOBILE_QUERY = '(max-width: 640px)'

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

// 保留舊 import 路徑，讓既有元件不需要知道效能 profile 的細節。
export { getCappedDevicePixelRatio } from './performance'
