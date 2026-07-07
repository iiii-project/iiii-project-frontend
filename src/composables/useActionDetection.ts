import { onBeforeUnmount, ref } from 'vue'
import { Camera } from '@mediapipe/camera_utils'
import { Hands } from '@mediapipe/hands'
import { Pose } from '@mediapipe/pose'
import { useCameraStore } from '@/stores/cameraStore'
import type { ActionEvent } from '@/types/divination'

type DetectorMode = 'prayer' | 'shake' | 'blocks'

interface Landmark {
  x: number
  y: number
  z?: number
}

const HOLD_MS = 2000
const SHAKE_TURNS = 3
const PINCH_RATIO = 0.38
const DRAW_UP_DELTA = 0.08
const POSE = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24
}

export function useActionDetection(mode: DetectorMode, onDetected: (event: ActionEvent) => void) {
  const cameraStore = useCameraStore()
  const videoRef = ref<HTMLVideoElement | null>(null)
  const errorMessage = ref('')
  const isActive = ref(false)
  const statusText = ref('尚未啟動')
  const marker = ref({
    visible: false,
    targetVisible: false,
    aligned: false,
    thumb: { x: 0, y: 0 },
    index: { x: 0, y: 0 },
    target: { x: 50, y: 50 }
  })
  let camera: Camera | null = null
  let hands: Hands | null = null
  let pose: Pose | null = null
  let detected = false
  let drawStage: 'shake' | 'pinch' = 'shake'
  let pinchStartedAtY = 0
  let holdStartedAt = 0
  let lastY = 0
  let direction = 0
  let turns = 0
  let shakeStartedAt = 0
  let latestPose: Landmark[] = []

  async function start() {
    if (!videoRef.value || isActive.value) return

    try {
      detected = false
      drawStage = 'shake'
      pinchStartedAtY = 0
      holdStartedAt = 0
      resetShake()
      errorMessage.value = ''
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
        latestPose = results.poseLandmarks || []
        if (mode === 'prayer') detectPrayerFromPose(latestPose)
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
      cameraStore.permissionStatus = 'granted'
      cameraStore.isActive = true
      cameraStore.detectionStatus = 'detecting'
      statusText.value = '辨識中'
    } catch {
      errorMessage.value = '無法啟動攝影機，請允許權限或改用點擊模式。'
      cameraStore.permissionStatus = 'denied'
      cameraStore.detectionStatus = 'failed'
      cameraStore.errorMessage = errorMessage.value
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
    cameraStore.isActive = false
    if (cameraStore.detectionStatus !== 'failed') cameraStore.detectionStatus = 'idle'
    statusText.value = '已停止'
    marker.value.visible = false
    marker.value.targetVisible = false
  }

  function handleHands(results: { multiHandLandmarks?: Landmark[][] }) {
    const handsLandmarks = results.multiHandLandmarks || []
    if (mode === 'prayer' && !latestPose.length) detectPrayerFromHands(handsLandmarks)
    if (mode === 'shake') detectDraw(handsLandmarks)
    if (mode === 'blocks') detectShake(handsLandmarks, 'BLOCK_CAST_DETECTED')
  }

  function detectDraw(handsLandmarks: Landmark[][]) {
    if (drawStage === 'shake') {
      if (detectShake(handsLandmarks, 'SHAKE_DETECTED', false)) {
        drawStage = 'pinch'
        marker.value.targetVisible = true
        statusText.value = '已選定籤，請用拇指與食指捏住目標後向上抽'
      }
      return
    }

    detectPinchDraw(handsLandmarks)
  }

  function detectPrayerFromPose(landmarks: Landmark[]) {
    const leftWrist = landmarks[POSE.leftWrist]
    const rightWrist = landmarks[POSE.rightWrist]
    const leftShoulder = landmarks[POSE.leftShoulder]
    const rightShoulder = landmarks[POSE.rightShoulder]
    if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) {
      holdStartedAt = 0
      statusText.value = '請站到畫面中央'
      return
    }

    const shoulderWidth = Math.max(0.12, Math.abs(leftShoulder.x - rightShoulder.x))
    const wristsClose = Math.hypot(leftWrist.x - rightWrist.x, leftWrist.y - rightWrist.y) < shoulderWidth * 0.7
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2
    const hipY = ((landmarks[POSE.leftHip]?.y || 0.85) + (landmarks[POSE.rightHip]?.y || 0.85)) / 2
    const wristY = (leftWrist.y + rightWrist.y) / 2
    const atChest = wristY > shoulderY - 0.12 && wristY < hipY

    if (wristsClose && atChest) {
      holdPrayer()
      return
    }

    holdStartedAt = 0
    statusText.value = '請雙手靠近胸前並維持'
  }

  function detectPrayerFromHands(handsLandmarks: Landmark[][]) {
    if (handsLandmarks.length < 2) {
      holdStartedAt = 0
      statusText.value = '請讓雙手都進入畫面'
      return
    }

    const leftPalm = handsLandmarks[0][9]
    const rightPalm = handsLandmarks[1][9]
    const distance = Math.hypot(leftPalm.x - rightPalm.x, leftPalm.y - rightPalm.y)
    const centered = leftPalm.y > 0.25 && leftPalm.y < 0.75 && rightPalm.y > 0.25 && rightPalm.y < 0.75
    if (distance < 0.18 && centered) {
      holdPrayer()
      return
    }

    holdStartedAt = 0
    statusText.value = '請雙手合十並維持'
  }

  function holdPrayer() {
    holdStartedAt ||= performance.now()
    statusText.value = `合十中 ${Math.min(2, Math.floor((performance.now() - holdStartedAt) / 1000))} 秒`
    if (performance.now() - holdStartedAt >= HOLD_MS) trigger('PRAYER_DETECTED')
  }

  function detectShake(handsLandmarks: Landmark[][], event: ActionEvent, shouldTrigger = true) {
    const wristY = getTrackedWristY(handsLandmarks)
    if (wristY === null) {
      resetShake()
      statusText.value = '請讓手或上半身進入畫面'
      return false
    }

    const delta = wristY - lastY
    const nextDirection = Math.abs(delta) > 0.02 ? Math.sign(delta) : direction
    if (!shakeStartedAt) shakeStartedAt = performance.now()
    if (direction && nextDirection && nextDirection !== direction) turns += 1
    direction = nextDirection
    lastY = wristY
    statusText.value = `動作進度 ${Math.min(100, turns * 34)}%`

    const done = turns >= SHAKE_TURNS && performance.now() - shakeStartedAt >= HOLD_MS
    if (done && shouldTrigger) trigger(event)
    return done
  }

  function detectPinchDraw(handsLandmarks: Landmark[][]) {
    const hand = handsLandmarks[0]
    const wrist = hand?.[0]
    const thumb = hand?.[4]
    const index = hand?.[8]
    const middle = hand?.[9]
    if (!wrist || !thumb || !index || !middle) {
      marker.value.visible = false
      statusText.value = '請讓拇指與食指進入畫面'
      return
    }

    const target = getTargetPoint()
    const mirroredThumb = { x: 1 - thumb.x, y: thumb.y }
    const mirroredIndex = { x: 1 - index.x, y: index.y }
    const mirroredWrist = { x: 1 - wrist.x, y: wrist.y }
    const pinchCenter = {
      x: (mirroredThumb.x + mirroredIndex.x) / 2,
      y: (mirroredThumb.y + mirroredIndex.y) / 2
    }
    const handScale = Math.hypot(wrist.x - middle.x, wrist.y - middle.y) || 0.0001
    const pinching = Math.hypot(thumb.x - index.x, thumb.y - index.y) / handScale < PINCH_RATIO
    const aligned = Math.hypot(pinchCenter.x - target.x, pinchCenter.y - target.y) < 0.14

    marker.value = {
      visible: true,
      targetVisible: true,
      aligned,
      thumb: { x: mirroredThumb.x * 100, y: mirroredThumb.y * 100 },
      index: { x: mirroredIndex.x * 100, y: mirroredIndex.y * 100 },
      target: { x: target.x * 100, y: target.y * 100 }
    }

    if (!pinching || !aligned) {
      pinchStartedAtY = 0
      statusText.value = aligned ? '請捏合拇指與食指' : '請將手指移到發光目標'
      return
    }

    pinchStartedAtY ||= mirroredWrist.y
    statusText.value = '已捏住籤，請向上抽出'
    if (pinchStartedAtY - mirroredWrist.y > DRAW_UP_DELTA) trigger('SHAKE_DETECTED')
  }

  function getTargetPoint() {
    const el = document.querySelector('.qian-stick') || document.querySelector('.qian-tong-zone')
    const rect = el?.getBoundingClientRect()
    if (!rect) return { x: 0.5, y: 0.5 }
    return {
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height * 0.22) / window.innerHeight
    }
  }

  function getTrackedWristY(handsLandmarks: Landmark[][]): number | null {
    const hand = handsLandmarks[0]
    if (hand?.[0]) return hand[0].y

    const leftWrist = latestPose[POSE.leftWrist]
    const rightWrist = latestPose[POSE.rightWrist]
    if (leftWrist && rightWrist) return (leftWrist.y + rightWrist.y) / 2
    if (leftWrist) return leftWrist.y
    if (rightWrist) return rightWrist.y
    return null
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
    cameraStore.detectionStatus = 'detected'
    cameraStore.lastDetectedAction = event
    onDetected(event)
    stop()
  }

  onBeforeUnmount(stop)

  return {
    videoRef,
    errorMessage,
    isActive,
    statusText,
    marker,
    start,
    stop
  }
}
