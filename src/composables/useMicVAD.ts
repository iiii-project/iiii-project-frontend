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

  onBeforeUnmount(stopMic)

  return { micOn, settings, startMic, stopMic, sendAudioPartition }
}
