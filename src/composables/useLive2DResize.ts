import { onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'
import type { ModelInfo } from '@/live2d/websocketService'
import { LAppDelegate } from '@/live2d/webSDK/engine/lappdelegate'
import { LAppLive2DManager } from '@/live2d/webSDK/engine/lapplive2dmanager'

// 這裡只服務單一使用場景（角色嵌在解籤頁一個固定尺寸的方框裡），所以拿掉了原本 React 版
// window 模式/側邊欄相關的尺寸判斷分支，一律以容器實際尺寸（containerRef）為準。
const MIN_SCALE = 0.1
const MAX_SCALE = 5.0
const EASING_FACTOR = 0.3
const WHEEL_SCALE_STEP = 0.03
const DEFAULT_SCALE = 1.0

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
      // 角色現在是嵌在一個固定尺寸的小方框裡（見 Live2DCompanion.vue 的容器），
      // 不是像原本 Electron pet 模式那樣佔滿整個視窗，所以用容器實際尺寸而非 window 尺寸。
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
  })

  return { canvasRef, handleResize }
}
