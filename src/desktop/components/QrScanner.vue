<script setup lang="ts">
/* 掃 QR。
   我們自己產的籤 QR 內容是 https://<站台>/fortune/<sessionId>（見 utils/qr），
   這個元件只負責把畫面裡的 QR 解出字串丟出去，判斷「是不是我們的籤」交給外面。

   解碼有兩條路：
   1. 瀏覽器內建的 BarcodeDetector（Chrome／Edge／Android 版 Chrome 都有），
      原生實作、吃電少。
   2. 沒有內建的（iOS Safari 到現在都還沒有）就退到 jsQR，純 JS 解碼，
      靠 canvas 取影格。功能一樣，只是耗電多一點。 */
import { onBeforeUnmount, ref } from 'vue'

const emit = defineEmits<{ decoded: [text: string]; error: [message: string] }>()

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

const videoEl = ref<HTMLVideoElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const scanning = ref(false)
const hint = ref('')

let stream: MediaStream | null = null
let rafId = 0
let detector: BarcodeDetectorLike | null = null
type JsQrFn = typeof import('jsqr').default
let jsQR: JsQrFn | null = null
let stopped = false

async function prepareDecoder() {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (Ctor) {
    try {
      detector = new Ctor({ formats: ['qr_code'] })
      return
    } catch {
      detector = null // 有這個 API 但不支援 qr_code，往下走 jsQR
    }
  }
  // 只有在真的需要時才載入解碼器，別讓沒開掃描的人也付這段流量
  const module = await import('jsqr')
  jsQR = module.default
}

async function start(options: { facingMode?: 'environment' | 'user' } = {}) {
  if (scanning.value) return
  stopped = false
  hint.value = ''
  try {
    await prepareDecoder()
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: options.facingMode ?? 'environment' },
      audio: false
    })
    if (stopped) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
      return
    }
    const video = videoEl.value
    if (!video) return
    video.srcObject = stream
    video.setAttribute('playsinline', 'true') // iOS 不要自己跳全螢幕播放
    await video.play()
    scanning.value = true
    hint.value = '把籤上的 QR 對進框內'
    tick()
  } catch (error) {
    scanning.value = false
    const name = (error as { name?: string })?.name
    if (name === 'NotAllowedError') emit('error', '沒有取得相機權限，請在瀏覽器設定允許相機後再試。')
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') emit('error', '找不到可用的相機，可以改用輸入籤號的方式。')
    else emit('error', '無法開啟相機，可以改用輸入籤號的方式。')
  }
}

function stop() {
  stopped = true
  scanning.value = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  const video = videoEl.value
  if (video) {
    video.pause()
    video.srcObject = null
  }
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}

/* 逐格取影像解碼。掃到就把字串丟出去並停下相機——由外面決定接下來要做什麼，
   避免同一張 QR 連續觸發好幾次。 */
async function tick() {
  if (!scanning.value) return
  const video = videoEl.value
  const canvas = canvasEl.value
  if (!video || !canvas || video.readyState < 2) {
    rafId = requestAnimationFrame(() => void tick())
    return
  }
  try {
    let found = ''
    if (detector) {
      const results = await detector.detect(video)
      found = results[0]?.rawValue ?? ''
    } else if (jsQR) {
      // 解碼不必用滿解析度，縮到 480 寬就夠，手機才不會發燙
      const scale = Math.min(1, 480 / (video.videoWidth || 480))
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
        found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? ''
      }
    }
    if (found) {
      stop()
      emit('decoded', found)
      return
    }
  } catch {
    // 單格解碼失敗（曝光不足、影格還沒好）不必理它，下一格再試
  }
  rafId = requestAnimationFrame(() => void tick())
}

onBeforeUnmount(stop)

defineExpose({ start, stop, scanning })
</script>

<template>
  <div class="scanner">
    <div class="viewport">
      <video ref="videoEl" class="cam" muted playsinline></video>
      <!-- 取景框：四個角，中間留空讓人知道要把 QR 對進來 -->
      <div class="frame" aria-hidden="true">
        <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
        <i v-if="scanning" class="sweep"></i>
      </div>
      <p v-if="!scanning" class="idle">相機尚未開啟</p>
    </div>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <canvas ref="canvasEl" class="offscreen" aria-hidden="true"></canvas>
  </div>
</template>

<style scoped>
.scanner { width: 100%; }

.viewport {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 46dvh;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  background: #1b1410;
  box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.35);
}
.cam {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.idle {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  font-size: 12.5px;
  letter-spacing: 0.2em;
  color: rgba(242, 226, 179, 0.65);
}

.frame { position: absolute; inset: 12%; pointer-events: none; }
.frame .c {
  position: absolute;
  width: 26px;
  height: 26px;
  border: 2px solid rgba(212, 175, 55, 0.9);
}
.frame .tl { top: 0; left: 0; border-right: 0; border-bottom: 0; border-radius: 6px 0 0 0; }
.frame .tr { top: 0; right: 0; border-left: 0; border-bottom: 0; border-radius: 0 6px 0 0; }
.frame .bl { bottom: 0; left: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 6px; }
.frame .br { bottom: 0; right: 0; border-left: 0; border-top: 0; border-radius: 0 0 6px 0; }
.frame .sweep {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.85), transparent);
  animation: sweep 2.4s ease-in-out infinite;
}

.hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12.5px;
  letter-spacing: 0.16em;
  color: rgba(91, 70, 53, 0.72);
}

.offscreen { display: none; }

@keyframes sweep {
  0%, 100% { top: 2%; }
  50% { top: 96%; }
}
@media (prefers-reduced-motion: reduce) {
  .frame .sweep { animation: none; top: 50%; }
}
</style>
