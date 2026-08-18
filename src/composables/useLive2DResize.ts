import { onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'
import type { ModelInfo } from '@/live2d/websocketService'
import { LAppDelegate } from '@/live2d/webSDK/engine/lappdelegate'
import { LAppLive2DManager } from '@/live2d/webSDK/engine/lapplive2dmanager'

// 這裡只服務單一使用場景（角色蓋滿全螢幕），所以拿掉了原本 React 版
// window 模式/側邊欄相關的尺寸判斷分支，一律以容器實際尺寸（containerRef）為準——
// 容器現在是鋪滿 viewport 的全螢幕層，所以這個尺寸本身就等同 window 尺寸。
const MIN_SCALE = 0.1
const MAX_SCALE = 5.0
const EASING_FACTOR = 0.3
const WHEEL_SCALE_STEP = 0.03
const DEFAULT_SCALE = 1.0

// 角色預設站在畫面右下角一帶（畫面寬度 84%、高度 76% 處）。
// 故意不去用 CubismModelMatrix.right()/bottom()/centerX() 這組 layout 輔助方法直接算——
// 那組方法是 Cubism SDK 用來讀 model3.json 的 Layout 區塊、在「setupFromLayout 當下
// 那個獨立座標系」裡定位，跟 modelMatrix 實際參與渲染的座標系不是同一件事，
// 之前套上去角色會直接被推到畫面外整個消失。
// 改成借用 view._deviceToScreen（跟 useLive2DModel.ts 拖曳/點擊命中判定同一份轉換，
// 因為拖曳和點擊角色本來就有在動、可驗證是對的）把「畫面上的某個像素點」換算成
// modelMatrix 用的座標，再整個指定給模型錨點——只要角色本來的拖曳/點擊是準的，這裡就會準。
const DEFAULT_POSITION_X_FRACTION = 0.84
const DEFAULT_POSITION_Y_FRACTION = 0.76
// 每次換模型／初次掛載都要等 Cubism 那邊非同步把新的 model instance 建好才能定位，
// 用 rAF 輪詢等它出現，最多等 ~2 秒（120 frame），逾時就放棄不再重試。
const MAX_POSITION_RETRY_FRAMES = 120

export function applyScale(scale: number) {
  try {
    const manager = LAppLive2DManager.getInstance()
    if (!manager) return
    const model = manager.getModel(0) as any
    if (!model) return
    model._modelMatrix.scale(scale, scale)
  } catch {
    console.debug('Model not ready for scaling yet')
  }
}

function tryApplyDefaultPosition(canvas: HTMLCanvasElement): boolean {
  try {
    const adapter = (window as any).getLAppAdapter?.()
    const view = LAppDelegate.getInstance()?.getView()
    const model = adapter?.getModel()
    if (!adapter || !view || !model?._modelMatrix || !canvas.height) return false

    const targetX = view._deviceToScreen.transformX(canvas.width * DEFAULT_POSITION_X_FRACTION)
    const targetY = view._deviceToScreen.transformY(canvas.height * DEFAULT_POSITION_Y_FRACTION)
    adapter.setModelPosition(targetX, targetY)
    return true
  } catch {
    return false
  }
}

export function useLive2DResize(containerRef: Ref<HTMLElement | null>, modelInfo: Ref<ModelInfo | undefined>) {
  const canvasRef = ref<HTMLCanvasElement | null>(null)

  let isResizing = false
  let lastScale = modelInfo.value?.kScale || DEFAULT_SCALE
  let targetScale = lastScale
  let easeAnimationFrame: number | undefined
  let isAnimating = false
  let resizeAnimationFrame: number | null = null
  let hasAppliedInitialScale = false
  let lastDimensions = { width: 0, height: 0 }
  let resizeObserver: ResizeObserver | undefined
  let hasAppliedInitialPosition = false
  let positionRetryFrame: number | null = null
  // 每次重置定位流程（換模型／初次掛載）就 +1，讓還在輪詢中的舊一輪 retry 發現
  // 自己已經過期而自行放棄，不會在新模型掛好後跑出一次遲來的舊定位。
  let positionGeneration = 0

  function cancelPositionRetry() {
    if (positionRetryFrame !== null) {
      cancelAnimationFrame(positionRetryFrame)
      positionRetryFrame = null
    }
  }

  function scheduleDefaultPosition(canvas: HTMLCanvasElement) {
    cancelPositionRetry()
    const generation = positionGeneration
    const attempt = (framesLeft: number) => {
      if (generation !== positionGeneration) return
      if (tryApplyDefaultPosition(canvas)) {
        hasAppliedInitialPosition = true
        positionRetryFrame = null
        return
      }
      if (framesLeft <= 0) {
        positionRetryFrame = null
        return
      }
      positionRetryFrame = requestAnimationFrame(() => attempt(framesLeft - 1))
    }
    attempt(MAX_POSITION_RETRY_FRAMES)
  }

  function animateEase() {
    const clampedTarget = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale))
    const diff = clampedTarget - lastScale
    lastScale += diff * EASING_FACTOR
    applyScale(lastScale)
    easeAnimationFrame = requestAnimationFrame(animateEase)
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault()
    if (!modelInfo.value?.scrollToResize) return

    const direction = e.deltaY > 0 ? -1 : 1
    const increment = WHEEL_SCALE_STEP * direction
    targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, lastScale + increment))

    if (!isAnimating) {
      isAnimating = true
      easeAnimationFrame = requestAnimationFrame(animateEase)
    }
  }

  function handleResize() {
    const canvas = canvasRef.value
    if (!canvas) return

    isResizing = true
    try {
      // 用容器實際尺寸而非直接讀 window 尺寸：容器（見 Live2DCompanion.vue）本身
      // 已經是 fixed inset:0 蓋滿全螢幕的層，兩者數值理論上會一致，但透過
      // ResizeObserver 觀察容器仍比直接綁 window resize 更準確可靠。
      const bounds = containerRef.value?.getBoundingClientRect()
      const width = bounds?.width || window.innerWidth
      const height = bounds?.height || window.innerHeight

      const dimensionsChanged = Math.abs(lastDimensions.width - width) > 1 || Math.abs(lastDimensions.height - height) > 1
      if (!dimensionsChanged && hasAppliedInitialScale) {
        isResizing = false
        return
      }
      lastDimensions = { width, height }

      if (width === 0 || height === 0) {
        console.warn('[Resize] Width or Height is zero, skipping canvas/delegate update.')
        isResizing = false
        return
      }

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const delegate = LAppDelegate.getInstance()
      if (delegate) {
        delegate.onResize()
      } else {
        console.warn('[Resize] LAppDelegate instance not found.')
      }
      // 只在「這個模型還沒套用過預設右下角位置」時做一次，避免使用者拖曳角色到
      // 別的地方後，只是視窗改個尺寸就把角色彈回右下角。
      if (!hasAppliedInitialPosition) scheduleDefaultPosition(canvas)
      hasAppliedInitialScale = true
      isResizing = false
    } catch {
      isResizing = false
    }
  }

  function scheduleResize() {
    if (resizeAnimationFrame !== null) cancelAnimationFrame(resizeAnimationFrame)
    resizeAnimationFrame = requestAnimationFrame(() => {
      handleResize()
      resizeAnimationFrame = null
    })
  }

  // 模型換了（換角色/換模型網址）要重置縮放狀態
  watch(
    () => [modelInfo.value?.url, modelInfo.value?.kScale],
    () => {
      lastScale = modelInfo.value?.kScale || DEFAULT_SCALE
      targetScale = lastScale
      hasAppliedInitialScale = false
      hasAppliedInitialPosition = false
      positionGeneration += 1
      cancelPositionRetry()
      if (easeAnimationFrame) {
        cancelAnimationFrame(easeAnimationFrame)
        isAnimating = false
      }
      scheduleResize()
    }
  )

  function handleWindowResize() {
    if (!isResizing) scheduleResize()
  }

  onMounted(() => {
    canvasRef.value?.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('resize', handleWindowResize)

    if (containerRef.value) {
      resizeObserver = new ResizeObserver(() => {
        if (!isResizing) scheduleResize()
      })
      resizeObserver.observe(containerRef.value)
    }

    scheduleResize()
  })

  onBeforeUnmount(() => {
    canvasRef.value?.removeEventListener('wheel', handleWheel)
    window.removeEventListener('resize', handleWindowResize)
    resizeObserver?.disconnect()
    if (easeAnimationFrame) cancelAnimationFrame(easeAnimationFrame)
    if (resizeAnimationFrame !== null) cancelAnimationFrame(resizeAnimationFrame)
    cancelPositionRetry()
  })

  return { canvasRef, handleResize }
}
