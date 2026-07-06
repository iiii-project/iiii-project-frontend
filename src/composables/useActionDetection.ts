import { onBeforeUnmount, ref } from 'vue'
import { Camera } from '@mediapipe/camera_utils'
import { Hands } from '@mediapipe/hands'
import { Pose } from '@mediapipe/pose'
import type { ActionEvent } from '@/types/divination'

type DetectorMode = 'prayer' | 'shake' | 'blocks'

interface Landmark {
  x: number
  y: number
  z?: number
}

const HOLD_MS = 2000
const SHAKE_TURNS = 3

export function useActionDetection(mode: DetectorMode, onDetected: (event: ActionEvent) => void) {
  const videoRef = ref<HTMLVideoElement | null>(null)
  const errorMessage = ref('')
  const isActive = ref(false)
  const statusText = ref('尚未啟動')
  let camera: Camera | null = null
  let hands: Hands | null = null
  let pose: Pose | null = null
  let detected = false
  let holdStartedAt = 0
  let lastY = 0
  let direction = 0
  let turns = 0
  let shakeStartedAt = 0
  let hasPose = false

  async function start() {
    if (!videoRef.value || isActive.value) return

    try {
      hands = new Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      })
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      })
      hands.onResults(handleHands)

      pose = new Pose({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      })
      pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      pose.onResults((results: { poseLandmarks?: Landmark[] }) => {
        hasPose = Boolean(results.poseLandmarks?.length)
      })

      camera = new Camera(videoRef.value, {
        width: 640,
        height: 480,
        // ponytail: 15 FPS is enough for ritual gestures; raise if detailed motion analytics become required.
        onFrame: async () => {
          if (!videoRef.value || !hands || !pose || detected) return
          await pose.send({ image: videoRef.value })
          await hands.send({ image: videoRef.value })
        }
      })
      await camera.start()
      isActive.value = true
      statusText.value = '辨識中'
    } catch {
      errorMessage.value = '無法啟動攝影機，請允許權限或改用點擊模式。'
      statusText.value = '啟動失敗'
    }
  }

  function stop() {
    camera?.stop()
    hands?.close()
    pose?.close()
    camera = null
    hands = null
    pose = null
    isActive.value = false
    statusText.value = '已停止'
  }

  function handleHands(results: { multiHandLandmarks?: Landmark[][] }) {
    const handsLandmarks = results.multiHandLandmarks || []
    if (!hasPose) {
      statusText.value = '請站到畫面中央'
      return
    }
    if (mode === 'prayer') detectPrayer(handsLandmarks)
    if (mode === 'shake') detectShake(handsLandmarks, 'SHAKE_DETECTED')
    if (mode === 'blocks') detectShake(handsLandmarks, 'BLOCK_CAST_DETECTED')
  }

  function detectPrayer(handsLandmarks: Landmark[][]) {
    if (handsLandmarks.length < 2) {
      holdStartedAt = 0
      statusText.value = '請讓雙手都進入畫面'
      return
    }

    const leftPalm = handsLandmarks[0][9]
    const rightPalm = handsLandmarks[1][9]
    const distance = Math.hypot(leftPalm.x - rightPalm.x, leftPalm.y - rightPalm.y)
    const centered = leftPalm.y > 0.25 && leftPalm.y < 0.75 && rightPalm.y > 0.25 && rightPalm.y < 0.75
    if (distance < 0.12 && centered) {
      holdStartedAt ||= performance.now()
      statusText.value = `合十中 ${Math.min(2, Math.floor((performance.now() - holdStartedAt) / 1000))} 秒`
      if (performance.now() - holdStartedAt >= HOLD_MS) trigger('PRAYER_DETECTED')
      return
    }

    holdStartedAt = 0
    statusText.value = '請雙手合十並維持'
  }

  function detectShake(handsLandmarks: Landmark[][], event: ActionEvent) {
    const hand = handsLandmarks[0]
    if (!hand) {
      resetShake()
      statusText.value = '請讓手進入畫面'
      return
    }

    const wristY = hand[0].y
    const delta = wristY - lastY
    const nextDirection = Math.abs(delta) > 0.035 ? Math.sign(delta) : direction
    if (!shakeStartedAt) shakeStartedAt = performance.now()
    if (direction && nextDirection && nextDirection !== direction) turns += 1
    direction = nextDirection
    lastY = wristY
    statusText.value = `動作進度 ${Math.min(100, turns * 34)}%`

    if (turns >= SHAKE_TURNS && performance.now() - shakeStartedAt >= HOLD_MS) trigger(event)
  }

  function resetShake() {
    lastY = 0
    direction = 0
    turns = 0
    shakeStartedAt = 0
  }

  function trigger(event: ActionEvent) {
    if (detected) return
    detected = true
    statusText.value = '已偵測完成'
    onDetected(event)
    stop()
  }

  onBeforeUnmount(stop)

  return {
    videoRef,
    errorMessage,
    isActive,
    statusText,
    start,
    stop
  }
}
