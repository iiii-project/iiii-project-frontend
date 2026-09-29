/** Runtime rendering and sampling budgets for constrained devices. */
export interface PerformanceProfile {
  isLowEnd: boolean
  canvasPixelRatio: number
  live2dFps: number
  arInferenceFps: number
  arCameraWidth: number
  arCameraHeight: number
  arSegmentationFps: number
  threeFps: number
  threePixelRatio: number
  arCanvasScale: number
  useSelfieSegmentation: boolean
}

interface ExtendedNavigator extends Navigator {
  deviceMemory?: number
  connection?: { saveData?: boolean; effectiveType?: string }
}

let cachedProfile: PerformanceProfile | null = null
let cachedProfileKey = ''

export function getPerformanceProfile(): PerformanceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isLowEnd: false, canvasPixelRatio: 1.25, live2dFps: 30, arInferenceFps: 12, arCameraWidth: 640, arCameraHeight: 480, arSegmentationFps: 6, threeFps: 45, threePixelRatio: 1.5, arCanvasScale: 1, useSelfieSegmentation: true }
  }

  const nav = navigator as ExtendedNavigator
  const connection = nav.connection
  // Warpple JJ5 是 Android 15 的低效能 WebView 裝置；即使瀏覽器回報的
  // cores/memory 看起來足夠，MediaPipe 與 WebGL 仍常落在 CPU/軟體路徑。
  const isAndroidClient = /Android/i.test(nav.userAgent || '')
  const profileKey = [
    nav.hardwareConcurrency || 0,
    nav.deviceMemory || 0,
    isAndroidClient ? 'android' : 'other',
    connection?.saveData ? 'save-data' : connection?.effectiveType || '',
  ].join(':')
  if (cachedProfile && cachedProfileKey === profileKey) return cachedProfile

  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory || 4
  const slowConnection = connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'

  // 所有裝置都使用同一套桌面版 UI；只依硬體能力決定是否降級渲染，
  // 避免用 viewport 或 User-Agent 產生另一套手機流程。
  const isLowEnd = isAndroidClient || cores <= 4 || memory <= 4 || Boolean(slowConnection)

  if (isLowEnd) {
    cachedProfileKey = profileKey
    cachedProfile = {
      isLowEnd: true,
      canvasPixelRatio: 0.75,
      live2dFps: 15,
      arInferenceFps: 6,
      arCameraWidth: 320,
      arCameraHeight: 240,
      threeFps: 20,
      threePixelRatio: 0.75,
      // 直式 1080×1920 只用一半線性解析度，將 Canvas 填充量降為約四分之一。
      arCanvasScale: 0.5,
      // 保留人像去背，但只更新 2 FPS；Hands 與去背不必使用相同頻率。
      arSegmentationFps: 2,
      useSelfieSegmentation: true,
    }
    return cachedProfile
  }

  cachedProfileKey = profileKey
  cachedProfile = { isLowEnd: false, canvasPixelRatio: 1.25, live2dFps: 30, arInferenceFps: 12, arCameraWidth: 640, arCameraHeight: 480, arSegmentationFps: 6, threeFps: 45, threePixelRatio: 1.5, arCanvasScale: 1, useSelfieSegmentation: true }
  return cachedProfile
}

export function getCappedDevicePixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.min(dpr, getPerformanceProfile().canvasPixelRatio)
}
