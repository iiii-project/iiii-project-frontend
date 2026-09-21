// Live2D 全螢幕 WebGL canvas 用的 devicePixelRatio 上限。展示機台常見 DPR 2.5~4，
// 不設上限的話 canvas 實際 backing buffer 像素量會是原本的 6~16 倍，
// 在中低階 Android 上會直接把 GPU 填色吃滿造成卡頓，因此夾在 1.5。
const MAX_LIVE2D_DEVICE_PIXEL_RATIO = 1.5

export function getCappedDevicePixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.min(dpr, MAX_LIVE2D_DEVICE_PIXEL_RATIO)
}
