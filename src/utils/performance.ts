/** Runtime rendering and sampling budgets for constrained devices. */
export interface PerformanceProfile {
  isLowEnd: boolean
  canvasPixelRatio: number
  live2dFps: number
  arInferenceFps: number
  arCameraWidth: number
  arCameraHeight: number
  threeFps: number
  threePixelRatio: number
}

interface ExtendedNavigator extends Navigator {
  deviceMemory?: number
  connection?: { saveData?: boolean; effectiveType?: string }
}

let cachedProfile: PerformanceProfile | null = null
let cachedProfileKey = ''

export function getPerformanceProfile(): PerformanceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isLowEnd: false, canvasPixelRatio: 1.25, live2dFps: 30, arInferenceFps: 12, arCameraWidth: 640, arCameraHeight: 480, threeFps: 45, threePixelRatio: 1.5 }
  }

  const nav = navigator as ExtendedNavigator
  const connection = nav.connection
  const profileKey = [
    window.innerWidth <= 640 ? 'mobile' : 'desktop',
    nav.hardwareConcurrency || 0,
    nav.deviceMemory || 0,
    connection?.saveData ? 'save-data' : connection?.effectiveType || '',
  ].join(':')
  if (cachedProfile && cachedProfileKey === profileKey) return cachedProfile

  const isAndroid = /Android/i.test(nav.userAgent || '')
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || '') || window.innerWidth <= 640
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory || 4
  const slowConnection = connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'

  // Use a conservative budget on Android 15 phones; unknown hardware should
  // not be treated as a flagship just because the browser hides its specs.
  const isLowEnd = isAndroid
    ? cores <= 6 || memory <= 4 || Boolean(slowConnection)
    : isMobile
      ? cores <= 4 || memory <= 4 || Boolean(slowConnection)
      : cores <= 2 || memory <= 2 || Boolean(slowConnection)

  if (isLowEnd) {
    cachedProfileKey = profileKey
    cachedProfile = { isLowEnd: true, canvasPixelRatio: 1, live2dFps: 20, arInferenceFps: 8, arCameraWidth: 480, arCameraHeight: 360, threeFps: 30, threePixelRatio: 1 }
    return cachedProfile
  }

  cachedProfileKey = profileKey
  cachedProfile = { isLowEnd: false, canvasPixelRatio: isMobile ? 1 : 1.25, live2dFps: 30, arInferenceFps: 12, arCameraWidth: 640, arCameraHeight: 480, threeFps: 45, threePixelRatio: isMobile ? 1.25 : 1.5 }
  return cachedProfile
}

export function getCappedDevicePixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.min(dpr, getPerformanceProfile().canvasPixelRatio)
}
