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
const { micOn, startMic, stopMic, pauseListening, resumeListening } = useMicVAD()
const { interrupt } = useInterrupt()
const ws = useLive2DWebSocket({ addAudioTask, startMic, stopMic })

/* 角色一開始回應（thinking-speaking，從思考到念完整段話都算）就先暫停收音，
   離開這個狀態（不管是正常講完回到 idle，還是被使用者按「打斷」變成 interrupted）
   就恢復收音——避免角色自己講話的聲音被麥克風錄進去，也讓對話變成清楚的一來一回。
   不是只看 idle：按了「打斷」之後不一定會馬上有下一句話，若只看 idle，打斷後
   使用者會發現麥克風一直沒反應。 */
watch(
  () => aiState.aiState,
  (state, previous) => {
    if (previous === 'thinking-speaking' && state !== 'thinking-speaking') {
      resumeListening()
    } else if (state === 'thinking-speaking' && previous !== 'thinking-speaking') {
      pauseListening()
    }
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

// aiState 內部值是英文狀態機代號，這裡轉成使用者看得懂、跟角色語氣搭的說法
const STATE_LABELS: Record<string, string> = {
  idle: '在旁邊陪你',
  'thinking-speaking': '正在回應…',
  interrupted: '被打斷了',
  loading: '準備中…',
  listening: '聽你說…',
  waiting: '思考中…'
}
const stateLabel = computed(() => STATE_LABELS[aiState.aiState] ?? aiState.aiState)

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

  <div class="live2d-chat">
    <div v-if="hasAIMessages && lastAIMessage" class="live2d-chat__bubble">
      <span class="live2d-chat__bubble-tag">米粒</span>
      <p class="live2d-chat__bubble-text">{{ lastAIMessage }}</p>
    </div>

    <div class="live2d-chat__status">
      <span class="live2d-chat__state" :class="`is-${aiState.aiState}`">
        <i class="live2d-chat__state-dot" aria-hidden="true"></i>{{ stateLabel }}
      </span>
      <div class="live2d-chat__actions">
        <button type="button" class="live2d-chat__icon-btn" title="麥克風" @click="handleMicToggle">
          {{ micOn ? '🎤' : '🔇' }}
        </button>
        <button type="button" class="live2d-chat__icon-btn" title="打斷" @click="handleInterrupt">✋</button>
      </div>
    </div>

    <div class="live2d-chat__input-row">
      <input
        v-model="inputValue"
        class="live2d-chat__input"
        placeholder="想問米粒什麼呢？"
        @input="handleInputChange"
        @keydown="handleKeyPress"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />
      <button type="button" class="live2d-chat__send" title="送出" @click="handleSend">➤</button>
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

/* ── 聊天面板：溫暖紙色調 + 圓角泡泡，跟解籤頁的籤紙/金線視覺呼應 ──
   （這幾個顏色跟 OracleWizard.vue 的 --jiang-hong/--gold 系列同一組值——
   這裡是 Teleport 到 body 的獨立元件，CSS 變數繼承不到，所以直接寫死。） */
.live2d-chat {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: 'Noto Serif TC', serif;
}

.live2d-chat__bubble {
  position: relative;
  padding: 9px 12px 10px;
  border-radius: 16px 16px 16px 6px;
  background: linear-gradient(180deg, rgba(255, 253, 244, 0.96), rgba(253, 246, 230, 0.94));
  border: 1px solid rgba(212, 175, 55, 0.45);
  box-shadow: 0 8px 18px rgba(120, 60, 40, 0.18);
  max-height: 84px;
  overflow-y: auto;
}
.live2d-chat__bubble-tag {
  display: inline-block;
  margin-bottom: 2px;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: #a63a3a;
  font-weight: 700;
}
.live2d-chat__bubble-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: #3a2c22;
}

.live2d-chat__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 4px;
}

.live2d-chat__state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: #fff3d6;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.live2d-chat__state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f2e2b3;
  box-shadow: 0 0 0 0 rgba(242, 226, 179, 0.6);
}
.live2d-chat__state.is-listening .live2d-chat__state-dot,
.live2d-chat__state.is-thinking-speaking .live2d-chat__state-dot,
.live2d-chat__state.is-waiting .live2d-chat__state-dot {
  background: #7ee787;
  animation: live2d-state-breathe 1.4s ease-in-out infinite;
}
@keyframes live2d-state-breathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(126, 231, 135, 0.5); }
  50% { box-shadow: 0 0 0 4px rgba(126, 231, 135, 0); }
}

.live2d-chat__actions {
  display: flex;
  gap: 5px;
}

.live2d-chat__icon-btn {
  border: 1px solid rgba(255, 253, 244, 0.35);
  background: rgba(255, 253, 244, 0.14);
  color: #fff3d6;
  border-radius: 999px;
  width: 26px;
  height: 26px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.live2d-chat__icon-btn:hover { background: rgba(255, 253, 244, 0.26); transform: translateY(-1px); }
.live2d-chat__icon-btn:active { transform: scale(0.94); }

.live2d-chat__input-row {
  display: flex;
  gap: 6px;
}

.live2d-chat__input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(212, 175, 55, 0.5);
  background: rgba(255, 253, 244, 0.94);
  color: #3a2c22;
  border-radius: 999px;
  padding: 7px 13px;
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(120, 60, 40, 0.08);
}
.live2d-chat__input::placeholder {
  color: rgba(91, 70, 53, 0.55);
}
.live2d-chat__input:focus {
  border-color: #d4af37;
  box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.22);
}

.live2d-chat__send {
  flex: 0 0 auto;
  border: 1px solid rgba(255, 253, 240, 0.4);
  background: radial-gradient(circle at 32% 28%, #f2e2b3, #a63a3a 78%);
  color: #fff5dd;
  border-radius: 999px;
  width: 34px;
  height: 34px;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.live2d-chat__send:hover { transform: scale(1.06); }
.live2d-chat__send:active { transform: scale(0.94); }
</style>
