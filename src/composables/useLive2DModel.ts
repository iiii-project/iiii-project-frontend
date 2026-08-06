import { onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'
import type { ModelInfo } from '@/live2d/websocketService'
import { updateModelConfig } from '@/live2d/webSDK/engine/lappdefine'
import { LAppDelegate } from '@/live2d/webSDK/engine/lappdelegate'
import { LAppLive2DManager } from '@/live2d/webSDK/engine/lapplive2dmanager'
import { initializeLive2D } from '@/live2d/webSDK/engine/entry'

// 移植自 use-live2d-model.ts。修正原始碼裡兩個死路徑：window.LAppDefine / window.LAppLive2DManager
// 從未真的被賦值到 window，原本靠它們判斷的分支永遠不會執行——這裡改成直接 import class 呼叫。
// 也拿掉了 Electron 專屬的滑鼠穿透（pet mode hover）邏輯與死碼 playAudioWithLipSync（原本就沒人呼叫，
// 且依賴同一個不存在的 window.LAppLive2DManager）。

interface Position {
  x: number
  y: number
}

const TAP_DURATION_THRESHOLD_MS = 200
const DRAG_DISTANCE_THRESHOLD_PX = 5

function parseModelUrl(url: string): { baseUrl: string; modelDir: string; modelFileName: string } {
  try {
    const urlObj = new URL(url)
    const { pathname } = urlObj

    const lastSlashIndex = pathname.lastIndexOf('/')
    if (lastSlashIndex === -1) throw new Error('Invalid model URL format')

    const modelFileName = pathname.substring(lastSlashIndex + 1).replace('.model3.json', '')

    const secondLastSlashIndex = pathname.lastIndexOf('/', lastSlashIndex - 1)
    if (secondLastSlashIndex === -1) throw new Error('Invalid model URL format')

    const modelDir = pathname.substring(secondLastSlashIndex + 1, lastSlashIndex)
    const baseUrl = `${urlObj.protocol}//${urlObj.host}${pathname.substring(0, secondLastSlashIndex + 1)}`

    return { baseUrl, modelDir, modelFileName }
  } catch (error) {
    console.error('Error parsing model URL:', error)
    return { baseUrl: '', modelDir: '', modelFileName: '' }
  }
}

export function useLive2DModel(modelInfo: Ref<ModelInfo | undefined>, canvasRef: Ref<HTMLCanvasElement | null>) {
  const isDragging = ref(false)
  const position = ref<Position>({ x: 0, y: 0 })

  const dragStartPos = { x: 0, y: 0 }
  const modelStartPos = { x: 0, y: 0 }
  let prevModelUrl: string | null = null

  const mouseDownTime = { current: 0 }
  const mouseDownPos = { x: 0, y: 0 }
  let isPotentialTap = false

  function getModelPosition(): Position {
    const adapter = (window as any).getLAppAdapter?.()
    const model = adapter?.getModel()
    if (model?._modelMatrix) {
      const matrix = model._modelMatrix.getArray()
      return { x: matrix[12], y: matrix[13] }
    }
    return { x: 0, y: 0 }
  }

  watch(
    () => [modelInfo.value?.url, modelInfo.value?.kScale],
    () => {
      const currentUrl = modelInfo.value?.url
      const needsUpdate = currentUrl && currentUrl !== prevModelUrl
      if (!needsUpdate) return

      prevModelUrl = currentUrl!
      try {
        const { baseUrl, modelDir, modelFileName } = parseModelUrl(currentUrl!)
        if (baseUrl && modelDir) {
          updateModelConfig(baseUrl, modelDir, modelFileName, Number(modelInfo.value?.kScale))
          setTimeout(() => {
            if (LAppLive2DManager.getInstance()) {
              LAppLive2DManager.releaseInstance()
            }
            initializeLive2D()
            setTimeout(() => {
              position.value = getModelPosition()
            }, 500)
          }, 500)
        }
      } catch (error) {
        console.error('Error processing model URL:', error)
      }
    },
    { immediate: true }
  )

  function handleMouseDown(e: MouseEvent) {
    const adapter = (window as any).getLAppAdapter?.()
    if (!adapter || !canvasRef.value) return

    const model = adapter.getModel()
    const view = LAppDelegate.getInstance()?.getView()
    if (!view || !model) return

    const canvas = canvasRef.value
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const scale = canvas.width / canvas.clientWidth
    const modelX = view._deviceToScreen.transformX(x * scale)
    const modelY = view._deviceToScreen.transformY(y * scale)

    const hitAreaName = model.anyhitTest(modelX, modelY)
    const isHitOnModel = model.isHitOnModel(modelX, modelY)

    if (hitAreaName !== null || isHitOnModel) {
      mouseDownTime.current = Date.now()
      mouseDownPos.x = e.clientX
      mouseDownPos.y = e.clientY
      isPotentialTap = true
      isDragging.value = false

      if (model._modelMatrix) {
        const matrix = model._modelMatrix.getArray()
        modelStartPos.x = matrix[12]
        modelStartPos.y = matrix[13]
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const adapter = (window as any).getLAppAdapter?.()
    const view = LAppDelegate.getInstance()?.getView()
    const model = adapter?.getModel()

    if (isPotentialTap && adapter && view && model && canvasRef.value) {
      const timeElapsed = Date.now() - mouseDownTime.current
      const deltaX = e.clientX - mouseDownPos.x
      const deltaY = e.clientY - mouseDownPos.y
      const distanceMoved = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      if (distanceMoved > DRAG_DISTANCE_THRESHOLD_PX || (timeElapsed > TAP_DURATION_THRESHOLD_MS && distanceMoved > 1)) {
        isPotentialTap = false
        isDragging.value = true

        const rect = canvasRef.value.getBoundingClientRect()
        dragStartPos.x = mouseDownPos.x - rect.left
        dragStartPos.y = mouseDownPos.y - rect.top
      }
    }

    if (isDragging.value && adapter && view && model && canvasRef.value) {
      const canvas = canvasRef.value
      const rect = canvas.getBoundingClientRect()
      const currentX = e.clientX - rect.left
      const currentY = e.clientY - rect.top

      const scale = canvas.width / canvas.clientWidth
      const startModelX = view._deviceToScreen.transformX(dragStartPos.x * scale)
      const startModelY = view._deviceToScreen.transformY(dragStartPos.y * scale)
      const currentModelX = view._deviceToScreen.transformX(currentX * scale)
      const currentModelY = view._deviceToScreen.transformY(currentY * scale)

      const newX = modelStartPos.x + (currentModelX - startModelX)
      const newY = modelStartPos.y + (currentModelY - startModelY)

      if (adapter.setModelPosition) {
        adapter.setModelPosition(newX, newY)
      } else if (model._modelMatrix) {
        const matrix = model._modelMatrix.getArray()
        const newMatrix = [...matrix]
        newMatrix[12] = newX
        newMatrix[13] = newY
        model._modelMatrix.setMatrix(newMatrix)
      }
      position.value = { x: newX, y: newY }
    }
  }

  function handleMouseUp(e: MouseEvent | null) {
    const adapter = (window as any).getLAppAdapter?.()
    const model = adapter?.getModel()
    const view = LAppDelegate.getInstance()?.getView()

    if (isDragging.value) {
      isDragging.value = false
      const currentModel = adapter?.getModel()
      if (currentModel?._modelMatrix) {
        const matrix = currentModel._modelMatrix.getArray()
        const finalPos = { x: matrix[12], y: matrix[13] }
        modelStartPos.x = finalPos.x
        modelStartPos.y = finalPos.y
        position.value = finalPos
      }
    } else if (isPotentialTap && adapter && model && view && canvasRef.value && e) {
      const timeElapsed = Date.now() - mouseDownTime.current
      const deltaX = e.clientX - mouseDownPos.x
      const deltaY = e.clientY - mouseDownPos.y
      const distanceMoved = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      if (timeElapsed < TAP_DURATION_THRESHOLD_MS && distanceMoved < DRAG_DISTANCE_THRESHOLD_PX) {
        const allowTapMotion = modelInfo.value?.pointerInteractive !== false
        const tapMotions = (modelInfo.value as any)?.tapMotions
        if (allowTapMotion && tapMotions) {
          const rect = canvasRef.value.getBoundingClientRect()
          const scale = canvasRef.value.width / canvasRef.value.clientWidth
          const downX = (mouseDownPos.x - rect.left) * scale
          const downY = (mouseDownPos.y - rect.top) * scale
          const modelX = view._deviceToScreen.transformX(downX)
          const modelY = view._deviceToScreen.transformY(downY)
          const hitAreaName = model.anyhitTest(modelX, modelY)
          model.startTapMotion(hitAreaName, tapMotions)
        }
      }
    }

    isPotentialTap = false
  }

  function handleMouseLeave() {
    if (isDragging.value) handleMouseUp(null)
    isPotentialTap = false
  }

  function exposeDebugHelpers() {
    const playMotion = (motionGroup: string, motionIndex = 0, priority = 3) => {
      const adapter = (window as any).getLAppAdapter?.()
      const model = adapter?.getModel()
      if (!model) {
        console.error('Live2D model not available')
        return false
      }
      return model.startMotion(motionGroup, motionIndex, priority)
    }

    const playRandomMotion = (motionGroup: string, priority = 3) => {
      const adapter = (window as any).getLAppAdapter?.()
      const model = adapter?.getModel()
      if (!model) {
        console.error('Live2D model not available')
        return false
      }
      return model.startRandomMotion(motionGroup, priority)
    }

    const getMotionInfo = () => {
      const adapter = (window as any).getLAppAdapter?.()
      const model = adapter?.getModel()
      if (!model) return null
      const groups = model._modelSetting?._json?.FileReferences?.Motions
      if (!groups) return null
      return Object.keys(groups).map((name) => ({
        name,
        count: groups[name].length,
        motions: groups[name].map((motion: any, index: number) => ({ index, file: motion.File }))
      }))
    }

    ;(window as any).Live2DDebug = {
      playMotion,
      playRandomMotion,
      getMotionInfo,
      help: () => {
        console.log(
          'Live2DDebug.getMotionInfo() / Live2DDebug.playMotion(group, index, priority) / Live2DDebug.playRandomMotion(group, priority)'
        )
      }
    }
    console.log('Live2D Debug functions exposed to window.Live2DDebug')
  }

  onMounted(exposeDebugHelpers)
  onBeforeUnmount(() => {
    delete (window as any).Live2DDebug
  })

  return {
    position,
    isDragging,
    handlers: {
      onMousedown: handleMouseDown,
      onMousemove: handleMouseMove,
      onMouseup: handleMouseUp,
      onMouseleave: handleMouseLeave
    }
  }
}
