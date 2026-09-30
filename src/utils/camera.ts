/* 依優先順序開鏡頭：先找外接（USB）鏡頭，找不到或開不起來再退到下一順位，
   最後才交給瀏覽器依 facingMode 自己挑（通常就是內建鏡頭）。

   瀏覽器沒有「這支是 USB」的欄位，只能看 label 猜：
   - 符合 BUILTIN_PATTERN 的（Integrated Camera、FaceTime、手機的 facing front/back…）
     視為內建，排到最後。
   - 其餘都當外接。
   - 環境變數 VITE_PREFERRED_CAMERA 可以放逗號分隔的關鍵字（例如 "Logitech,C920"），
     label 含這些字的鏡頭會依關鍵字順序排在最前面，現場換設備時不用改程式。

   label 要在拿過一次相機權限後才看得到。還沒授權時先用 fallback 開一次拿權限，
   再列一次裝置；若發現有更優先的外接鏡頭就切過去。 */

const BUILTIN_PATTERN =
  /integrated|built-?in|internal|facetime|isight|front|back|rear|facing|內建|前置|後置|前鏡頭|後鏡頭/i

const PREFERRED_KEYWORDS = ((import.meta.env.VITE_PREFERRED_CAMERA as string | undefined) ?? '')
  .split(',')
  .map((keyword) => keyword.trim().toLowerCase())
  .filter(Boolean)

export interface OpenCameraOptions {
  facingMode?: 'user' | 'environment'
  width?: number
  height?: number
}

function keywordRank(label: string) {
  const lower = label.toLowerCase()
  const index = PREFERRED_KEYWORDS.findIndex((keyword) => lower.includes(keyword))
  return index === -1 ? PREFERRED_KEYWORDS.length : index
}

/** 依優先順序排出外接鏡頭（內建鏡頭不列入，交給 fallback 處理）。 */
async function listPreferredCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === 'videoinput' && device.deviceId)
    .filter((device) => keywordRank(device.label) < PREFERRED_KEYWORDS.length || !BUILTIN_PATTERN.test(device.label))
    .sort((a, b) => keywordRank(a.label) - keywordRank(b.label))
}

function sizeConstraints(options: OpenCameraOptions): MediaTrackConstraints {
  return {
    ...(options.width ? { width: { ideal: options.width } } : {}),
    ...(options.height ? { height: { ideal: options.height } } : {})
  }
}

function openDevice(deviceId: string, options: OpenCameraOptions) {
  return navigator.mediaDevices.getUserMedia({
    video: { ...sizeConstraints(options), deviceId: { exact: deviceId } },
    audio: false
  })
}

function openFallback(options: OpenCameraOptions) {
  return navigator.mediaDevices.getUserMedia({
    video: { ...sizeConstraints(options), facingMode: options.facingMode ?? 'user' },
    audio: false
  })
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}

function currentDeviceId(stream: MediaStream) {
  return stream.getVideoTracks()[0]?.getSettings().deviceId
}

/** 依序嘗試外接鏡頭，全部失敗才用 fallback。權限被拒等錯誤會照原樣丟出。 */
export async function openPreferredCamera(options: OpenCameraOptions = {}): Promise<MediaStream> {
  let candidates = await listPreferredCameras().catch(() => [] as MediaDeviceInfo[])
  const hasLabels = candidates.some((device) => device.label)

  // 還沒授權：label 是空的，無從判斷哪支是外接，先開 fallback 拿權限。
  let fallback: MediaStream | null = null
  if (!hasLabels) {
    fallback = await openFallback(options)
    candidates = await listPreferredCameras().catch(() => [])
    const activeId = currentDeviceId(fallback)
    if (!candidates.length || candidates[0].deviceId === activeId) return fallback
    // 同一支鏡頭通常不能同時開兩次，先關掉再換。
    stopStream(fallback)
    fallback = null
  }

  for (const device of candidates) {
    try {
      return await openDevice(device.deviceId, options)
    } catch (error) {
      const name = (error as { name?: string })?.name
      if (name === 'NotAllowedError') throw error
      console.warn(`[camera] 無法開啟 ${device.label || device.deviceId}，改試下一支`, error)
    }
  }
  return openFallback(options)
}
