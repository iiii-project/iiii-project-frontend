import { watch } from 'vue'
import { useAiStateStore } from '@/stores/aiStateStore'
import { useLive2DChatStore } from '@/stores/live2dChatStore'
import { audioManager } from '@/live2d/audioManager'
import { audioTaskQueue } from '@/live2d/taskQueue'
import { wsService, type DisplayText } from '@/live2d/websocketService'
import { setExpression } from '@/composables/useLive2DExpression'
import * as LAppDefine from '@/live2d/webSDK/engine/lappdefine'

interface AudioTaskOptions {
  audioBase64: string
  volumes: number[]
  sliceLength: number
  displayText?: DisplayText | null
  expressions?: string[] | number[] | null
  forwarded?: boolean
}

export function useAudioTask() {
  const aiState = useAiStateStore()
  const chat = useLive2DChatStore()

  function stopCurrentAudioAndLipSync() {
    audioManager.stopCurrentAudioAndLipSync()
  }

  function handleAudioPlayback(options: AudioTaskOptions): Promise<void> {
    return new Promise((resolve) => {
      if (aiState.aiState === 'interrupted') {
        console.warn('Audio playback blocked by interruption state.')
        resolve()
        return
      }

      const { audioBase64, displayText, expressions, forwarded } = options

      if (displayText) {
        chat.appendResponse(displayText.text)
        chat.appendAIMessage(displayText.text, displayText.name, displayText.avatar)
        if (audioBase64) chat.setSubtitleText(displayText.text)
        if (!forwarded) {
          wsService.sendMessage({ type: 'audio-play-start', display_text: displayText, forwarded: true })
        }
      }

      if (!audioBase64) {
        resolve()
        return
      }

      try {
        const audioDataUrl = `data:audio/wav;base64,${audioBase64}`

        const live2dManager = (window as any).getLive2DManager?.()
        const model = live2dManager?.getModel(0)
        if (!model) {
          console.error('Live2D model not found at index 0')
          resolve()
          return
        }
        console.log('Found model for audio playback')

        const lappAdapter = (window as any).getLAppAdapter?.()
        if (lappAdapter && expressions?.[0] !== undefined) {
          setExpression(expressions[0], lappAdapter, `Set expression to: ${expressions[0]}`)
        }

        if (LAppDefine.PriorityNormal !== undefined) {
          console.log("Starting random 'Talk' motion")
          model.startRandomMotion('Talk', LAppDefine.PriorityNormal)
        }

        const audio = new Audio(audioDataUrl)
        audioManager.setCurrentAudio(audio, model)
        let isFinished = false

        const cleanup = () => {
          audioManager.clearCurrentAudio(audio)
          if (!isFinished) {
            isFinished = true
            resolve()
          }
        }

        const lipSyncScale = 2.0

        audio.addEventListener('canplaythrough', () => {
          if (aiState.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
            console.warn('Audio playback cancelled due to interruption or audio was stopped')
            cleanup()
            return
          }

          console.log('Starting audio playback with lip sync')
          audio.play().catch((err) => {
            console.error('Audio play error:', err)
            cleanup()
          })

          if (model._wavFileHandler) {
            if (!model._wavFileHandler._initialized) {
              console.log('Applying enhanced lip sync')
              model._wavFileHandler._initialized = true
              const originalUpdate = model._wavFileHandler.update.bind(model._wavFileHandler)
              model._wavFileHandler.update = function (deltaTimeSeconds: number) {
                const result = originalUpdate(deltaTimeSeconds)
                this._lastRms = Math.min(2.0, this._lastRms * lipSyncScale)
                return result
              }
            }

            if (audioManager.hasCurrentAudio()) {
              model._wavFileHandler.start(audioDataUrl)
            } else {
              console.warn('WavFileHandler start skipped - audio was stopped')
            }
          }
        })

        audio.addEventListener('ended', () => {
          console.log('Audio playback completed')
          cleanup()
        })
        audio.addEventListener('error', (error) => {
          console.error('Audio playback error:', error)
          cleanup()
        })
        audio.load()
      } catch (error) {
        console.error('Audio playback setup error:', error)
        resolve()
      }
    })
  }

  // 後端合成完成 → 等佇列播完 → 停止嘴型同步 → 通知後端可以送下一輪
  watch(
    () => aiState.backendSynthComplete,
    async (complete) => {
      if (!complete) return
      await audioTaskQueue.waitForCompletion()
      stopCurrentAudioAndLipSync()
      wsService.sendMessage({ type: 'frontend-playback-complete' })
      aiState.setBackendSynthComplete(false)
    }
  )

  function addAudioTask(options: AudioTaskOptions) {
    if (aiState.aiState === 'interrupted') {
      console.log('Skipping audio task due to interrupted state')
      return
    }
    console.log(`Adding audio task ${options.displayText?.text} to queue`)
    audioTaskQueue.addTask(() => handleAudioPlayback(options))
  }

  return { addAudioTask, stopCurrentAudioAndLipSync }
}
