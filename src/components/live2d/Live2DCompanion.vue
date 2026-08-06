<script setup lang="ts">
/**
 * 取代原本的 <iframe> 嵌入：這裡是 live2d-frontend 角色渲染邏輯移植進 Vue 後的容器元件。
 * 只放得下「顯示角色 + 文字/語音聊天」這兩件事（比照原本 pet 模式的功能範圍），
 * 沒有側邊欄/角色切換/群組對話等 window 模式才有的東西。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAiStateStore } from '@/stores/aiStateStore'
import { useLive2DConfigStore } from '@/stores/live2dConfigStore'
import { useLive2DChatStore } from '@/stores/live2dChatStore'
import { useLive2DModel } from '@/composables/useLive2DModel'
import { useLive2DResize } from '@/composables/useLive2DResize'
import { resetExpression } from '@/composables/useLive2DExpression'
import { useAudioTask } from '@/composables/useAudioTask'
import { useMicVAD } from '@/composables/useMicVAD'
import { useInterrupt } from '@/composables/useInterrupt'
import { useLive2DWebSocket } from '@/composables/useLive2DWebSocket'
import { loadCubismCore } from '@/live2d/loadCubismCore'

const aiState = useAiStateStore()
const config = useLive2DConfigStore()
const chat = useLive2DChatStore()

const containerRef = ref<HTMLDivElement | null>(null)
const modelInfoRef = computed(() => config.modelInfo)

const { canvasRef } = useLive2DResize(containerRef, modelInfoRef)
const { isDragging, handlers } = useLive2DModel(modelInfoRef, canvasRef)
const { addAudioTask } = useAudioTask()
const { micOn, startMic, stopMic } = useMicVAD()
const { interrupt } = useInterrupt()
const ws = useLive2DWebSocket({ addAudioTask, startMic, stopMic })

// AI 回到 idle 時，把表情重設回角色的預設表情
watch(
  () => aiState.aiState,
  (state) => {
    if (state !== 'idle') return
    const lappAdapter = (window as any).getLAppAdapter?.()
    if (lappAdapter) resetExpression(lappAdapter, modelInfoRef.value)
  }
)

const lastAIMessage = computed(() => {
  const aiMessages = chat.messages.filter((m) => m.role === 'ai')
  return aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].content : ''
})
const hasAIMessages = computed(() => chat.messages.some((m) => m.role === 'ai'))

const inputValue = ref('')
const isComposing = ref(false)

async function handleSend() {
  const text = inputValue.value.trim()
  if (!text) return
  if (aiState.aiState === 'thinking-speaking') interrupt()

  chat.appendHumanMessage(text)
  ws.sendMessage({ type: 'text-input', text })
  inputValue.value = ''
}

function handleKeyPress(e: KeyboardEvent) {
  if (isComposing.value) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleInputChange() {
  aiState.setAiState('waiting')
}

async function handleMicToggle() {
  if (micOn.value) {
    stopMic()
    if (aiState.aiState === 'listening') aiState.setAiState('idle')
  } else {
    await startMic()
  }
}

function handleInterrupt() {
  interrupt()
}

onMounted(async () => {
  await loadCubismCore()
  ws.connect()
})

onBeforeUnmount(() => {
  stopMic()
})
</script>

<template>
  <div
    id="live2d-internal-wrapper"
    class="live2d-companion-root"
    ref="containerRef"
    :style="{ cursor: isDragging ? 'grabbing' : 'default' }"
    @mousedown="handlers.onMousedown"
    @mousemove="handlers.onMousemove"
    @mouseup="handlers.onMouseup"
    @mouseleave="handlers.onMouseleave"
  >
    <canvas id="canvas" ref="canvasRef" class="live2d-companion-canvas" :style="{ cursor: isDragging ? 'grabbing' : 'default' }" />
  </div>

  <div class="live2d-input-subtitle">
    <div v-if="hasAIMessages && lastAIMessage" class="live2d-input-subtitle__message">
      {{ lastAIMessage }}
    </div>

    <div class="live2d-input-subtitle__status">
      <span class="live2d-input-subtitle__state">{{ aiState.aiState }}</span>
      <div class="live2d-input-subtitle__actions">
        <button type="button" class="live2d-icon-btn" title="麥克風" @click="handleMicToggle">
          {{ micOn ? '🎤' : '🔇' }}
        </button>
        <button type="button" class="live2d-icon-btn" title="打斷" @click="handleInterrupt">✋</button>
      </div>
    </div>

    <div class="live2d-input-subtitle__input-row">
      <input
        v-model="inputValue"
        class="live2d-input-subtitle__input"
        placeholder="輸入您的訊息..."
        @input="handleInputChange"
        @keydown="handleKeyPress"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />
      <button type="button" class="live2d-input-subtitle__send" title="送出" @click="handleSend">➤</button>
    </div>
  </div>
</template>

<style>
.live2d-companion-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.live2d-companion-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.live2d-input-subtitle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  background: rgba(24, 14, 10, 0.72);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-family: system-ui, sans-serif;
  color: #f2e2b3;
}

.live2d-input-subtitle__message {
  padding: 8px 10px 0;
  font-size: 12px;
  line-height: 1.5;
  color: #f2e2b3;
  max-height: 60px;
  overflow-y: auto;
}

.live2d-input-subtitle__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.live2d-input-subtitle__actions {
  display: flex;
  gap: 6px;
}

.live2d-icon-btn {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #f2e2b3;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 14px;
  cursor: pointer;
}
.live2d-icon-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

.live2d-input-subtitle__input-row {
  display: flex;
  gap: 6px;
  padding: 8px;
}

.live2d-input-subtitle__input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #f2e2b3;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  outline: none;
}
.live2d-input-subtitle__input::placeholder {
  color: rgba(242, 226, 179, 0.5);
}

.live2d-input-subtitle__send {
  border: none;
  background: #a63a3a;
  color: #fff5dd;
  border-radius: 999px;
  width: 32px;
  height: 32px;
  cursor: pointer;
}
</style>
