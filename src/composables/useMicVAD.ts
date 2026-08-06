import { onBeforeUnmount, ref } from 'vue'
import { MicVAD } from '@ricky0123/vad-web'
import { useAiStateStore } from '@/stores/aiStateStore'
import { useLive2DChatStore } from '@/stores/live2dChatStore'
import { wsService } from '@/live2d/websocketService'
import { useInterrupt } from '@/composables/useInterrupt'

export interface VADSettings {
  positiveSpeechThreshold: number
  negativeSpeechThreshold: number
  redemptionFrames: number
}

const DEFAULT_VAD_SETTINGS: VADSettings = {
  positiveSpeechThreshold: 50,
  negativeSpeechThreshold: 35,
  redemptionFrames: 35
}

// public/live2d/libs/ 底下放的是 vad.worklet.bundle.min.js + silero_vad_*.onnx + onnxruntime 的 .wasm
const VAD_ASSET_PATH = '/live2d/libs/'

function sendAudioPartition(audio: Float32Array) {
  const chunkSize = 4096
  for (let index = 0; index < audio.length; index += chunkSize) {
    const chunk = audio.slice(index, Math.min(index + chunkSize, audio.length))
    wsService.sendMessage({ type: 'mic-audio-data', audio: Array.from(chunk) })
  }
  wsService.sendMessage({ type: 'mic-audio-end' })
}

export function useMicVAD() {
  const aiState = useAiStateStore()
  const chat = useLive2DChatStore()
  const { interrupt } = useInterrupt()

  const micOn = ref(false)
  const settings = ref<VADSettings>({ ...DEFAULT_VAD_SETTINGS })

  let vad: MicVAD | null = null
  let previousAiState: string = 'idle'
  let isProcessing = false

  async function initVAD() {
    vad = await MicVAD.new({
      model: 'v5',
      preSpeechPadFrames: 20,
      positiveSpeechThreshold: settings.value.positiveSpeechThreshold / 100,
      negativeSpeechThreshold: settings.value.negativeSpeechThreshold / 100,
      redemptionFrames: settings.value.redemptionFrames,
      baseAssetPath: VAD_ASSET_PATH,
      onnxWASMBasePath: VAD_ASSET_PATH,
      onSpeechStart: () => {
        console.log('Speech started - saving current state')
        previousAiState = aiState.aiState
        isProcessing = true
      },
      onSpeechRealStart: () => {
        console.log('Real speech confirmed - checking if need to interrupt')
        if (previousAiState === 'thinking-speaking') {
          console.log('Interrupting AI speech due to user speaking')
          interrupt()
        }
        aiState.setAiState('listening')
      },
      onSpeechEnd: (audio: Float32Array) => {
        if (!isProcessing) return
        console.log('Speech ended')
        sendAudioPartition(audio)
        isProcessing = false
        aiState.setAiState('thinking-speaking')
      },
      onVADMisfire: () => {
        if (!isProcessing) return
        console.log('VAD misfire detected')
        isProcessing = false
        aiState.setAiState(previousAiState as any)
        chat.setSubtitleText('沒有偵測到語音，請再說一次')
      }
    })
    vad.start()
  }

  async function startMic() {
    try {
      if (!vad) {
        console.log('Initializing VAD')
        await initVAD()
      } else {
        console.log('Starting VAD')
        vad.start()
      }
      micOn.value = true
    } catch (error) {
      console.error('Failed to start VAD:', error)
    }
  }

  function stopMic() {
    console.log('Stopping VAD')
    if (vad) {
      vad.pause()
      vad.destroy()
      vad = null
      console.log('VAD stopped and destroyed successfully')
    } else {
      console.log('VAD instance not found')
    }
    micOn.value = false
    isProcessing = false
  }

  /* 角色開始回應（思考中／念出來）時暫停收音，跟使用者主動關麥克風（stopMic）不同：
     只 pause 現有的 VAD instance，不 destroy、不動 micOn——這樣角色講完話恢復收音時
     不用重新跑一次 ONNX 模型初始化，使用者看到的麥克風圖示也維持原本「已開」的樣子。 */
  function pauseListening() {
    if (!vad) return
    console.log('Pausing VAD while character responds')
    vad.pause()
    isProcessing = false
  }

  // 只有麥克風本來就是開著的時候才恢復；如果使用者在角色講話的這段時間手動關了麥克風，
  // 尊重那個操作，不要在回話結束後又自動把它打開。
  function resumeListening() {
    if (!vad || !micOn.value) return
    console.log('Resuming VAD after character finished responding')
    vad.start()
  }

  onBeforeUnmount(stopMic)

  return { micOn, settings, startMic, stopMic, pauseListening, resumeListening, sendAudioPartition }
}
