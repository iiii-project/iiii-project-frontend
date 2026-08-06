import { useAiStateStore } from '@/stores/aiStateStore'
import { useLive2DChatStore } from '@/stores/live2dChatStore'
import { audioManager } from '@/live2d/audioManager'
import { audioTaskQueue } from '@/live2d/taskQueue'
import { wsService } from '@/live2d/websocketService'

export function useInterrupt() {
  const aiState = useAiStateStore()
  const chat = useLive2DChatStore()

  function interrupt(sendSignal = true) {
    if (aiState.aiState !== 'thinking-speaking') return
    console.log('Interrupting conversation chain')

    audioManager.stopCurrentAudioAndLipSync()
    audioTaskQueue.clearQueue()
    aiState.setAiState('interrupted')

    if (sendSignal) {
      wsService.sendMessage({ type: 'interrupt-signal', text: chat.fullResponse })
    }
    chat.clearResponse()

    if (chat.subtitleText === 'Thinking...') {
      chat.setSubtitleText('')
    }
    console.log('Interrupted!')
  }

  return { interrupt }
}
