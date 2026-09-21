// 全站唯一的「手機／電腦」路由分流依據：router/index.ts 依此決定要掛
// src/mobile/router.ts 還是 src/desktop/router.ts 的路由表。
// 各頁面內部原本就有的響應式設計（CSS @media、少數 matchMedia 判斷）不受影響。
export const MOBILE_QUERY = '(max-width: 640px)'

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

// Live2D 全螢幕 WebGL canvas 用的 devicePixelRatio 上限。展示機台常見 DPR 2.5~4，
// 不設上限的話 canvas 實際 backing buffer 像素量會是原本的 6~16 倍，
// 在中低階 Android 上會直接把 GPU 填色吃滿造成卡頓，因此夾在 1.5。
const MAX_LIVE2D_DEVICE_PIXEL_RATIO = 1.5

export function getCappedDevicePixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.min(dpr, MAX_LIVE2D_DEVICE_PIXEL_RATIO)
}
