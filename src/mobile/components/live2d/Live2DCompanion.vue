<script setup lang="ts">
/**
 * 取代原本的 <iframe> 嵌入：這裡是 live2d-frontend 角色渲染邏輯移植進 Vue 後的容器元件。
 * 只放得下「全螢幕顯示角色 + 點角色彈出聊天室」這兩件事（比照原本 pet 模式的功能範圍），
 * 沒有側邊欄/角色切換/群組對話等 window 模式才有的東西。
 * 對話沿用手機求籤問題的台語／國語 STT，使用者不需要開啟鍵盤輸入。
 * 也沒有常駐的狀態列/舉手打斷鈕——聊天室只在點角色時彈出，關掉聊天室角色還是留在畫面上。
 *
 * 跟 desktop 版的差異：這裡角色容器維持 pointer-events:auto（見下面 CSS），不像桌機版
 * 用滑鼠懸浮動態切換——觸控螢幕沒有「移過去但還沒點」的懸浮狀態，沒辦法用同一招做
 * 點擊穿透，這裡先讓「點角色開聊天室」這個核心功能穩定可用，畫布蓋滿螢幕會擋住底下
 * 按鈕這件事留待之後另外處理。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAiStateStore } from '@/stores/aiStateStore'
import { useLive2DConfigStore } from '@/stores/live2dConfigStore'
import { useLive2DChatStore } from '@/stores/live2dChatStore'
import { useLive2DCompanionStore } from '@/stores/live2dCompanionStore'
import { useLive2DModel } from '@/composables/useLive2DModel'
import { useLive2DResize } from '@/composables/useLive2DResize'
import { resetExpression } from '@/composables/useLive2DExpression'
import { useAudioTask } from '@/composables/useAudioTask'
import { useInterrupt } from '@/composables/useInterrupt'
import { useLive2DWebSocket } from '@/composables/useLive2DWebSocket'
import { loadCubismCore } from '@/live2d/loadCubismCore'
import { useLocalSpeechInput } from '@/utils/localSpeech'

const aiState = useAiStateStore()
const config = useLive2DConfigStore()
const chat = useLive2DChatStore()
const companion = useLive2DCompanionStore()

const containerRef = ref<HTMLDivElement | null>(null)
const modelInfoRef = computed(() => config.modelInfo)

const isChatOpen = ref(false)

/* 點角色開聊天室，是這個元件裡唯一真正的使用者手勢——自我介紹（會出聲）
   放在這裡呼叫，才過得了瀏覽器的 autoplay 政策。greet() 內部自己擋了只講一次，
   所以每次點開都呼叫也沒關係。 */
function toggleChat() {
  isChatOpen.value = !isChatOpen.value
  if (isChatOpen.value) companion.greet()
}

const { canvasRef } = useLive2DResize(containerRef, modelInfoRef)
const { isDragging, handlers } = useLive2DModel(modelInfoRef, canvasRef, toggleChat)
const { addAudioTask } = useAudioTask()
const { interrupt } = useInterrupt()
const ws = useLive2DWebSocket({ addAudioTask })

/* 角色講完話（回到 idle）就把表情重置回預設，避免停在講話中途的表情上。 */
watch(
  () => aiState.aiState,
  (state) => {
    if (state !== 'idle') return
    const lappAdapter = (window as any).getLAppAdapter?.()
    if (lappAdapter) resetExpression(lappAdapter, modelInfoRef.value)
  }
)

const chatDraft = ref('')
const CHAT_MAX_LENGTH = 500

const {
  supported: speechSupported,
  isRecording: isChatRecording,
  isTranscribing: isChatTranscribing,
  hint: chatSpeechHint,
  stop: stopChatRecording,
  toggle: toggleChatRecording
} = useLocalSpeechInput({
  get: () => chatDraft.value,
  set: (value) => { chatDraft.value = value },
  maxLength: CHAT_MAX_LENGTH
})

async function handleSend() {
  const text = chatDraft.value.trim()
  if (!text) return
  if (isChatRecording.value || isChatTranscribing.value) return
  if (aiState.aiState === 'thinking-speaking') interrupt()

  chat.appendHumanMessage(text)
  ws.sendMessage({ type: 'text-input', text })
  chatDraft.value = ''
}

function closeChat() {
  if (isChatRecording.value) stopChatRecording()
  isChatOpen.value = false
}

onMounted(async () => {
  await loadCubismCore()
  ws.connect()
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

  <div v-if="isChatOpen" class="live2d-chatpanel">
    <div class="live2d-chatpanel__header">
      <span class="live2d-chatpanel__title">金鶴</span>
      <button type="button" class="live2d-chatpanel__close" title="關閉" @click="closeChat">✕</button>
    </div>

    <div class="live2d-chatpanel__messages">
      <div
        v-for="message in chat.messages"
        :key="message.id"
        class="live2d-chatpanel__bubble"
        :class="message.role === 'human' ? 'is-human' : 'is-ai'"
      >
        {{ message.content }}
      </div>
    </div>

    <div class="live2d-chatpanel__voice-row">
      <div class="live2d-chatpanel__transcript" aria-live="polite">
        {{ chatDraft || '按下麥克風，用說的和金鶴對話' }}
      </div>
      <button
        v-if="speechSupported"
        type="button"
        class="live2d-chatpanel__mic"
        :class="{ on: isChatRecording, thinking: isChatTranscribing }"
        :aria-pressed="isChatRecording"
        :aria-busy="isChatTranscribing"
        :disabled="isChatTranscribing"
        title="語音輸入"
        @click="toggleChatRecording"
      >
        {{ isChatTranscribing ? '辨識中' : isChatRecording ? '停止' : '說話' }}
      </button>
      <button
        type="button"
        class="live2d-chatpanel__send"
        title="送出語音內容"
        :disabled="!chatDraft.trim() || isChatRecording || isChatTranscribing"
        @click="handleSend"
      >➤</button>
    </div>
    <p v-if="chatSpeechHint" class="live2d-chatpanel__speech-hint">{{ chatSpeechHint }}</p>
  </div>
</template>

<style>
.live2d-companion-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* 先把手機版的 Live2D 角色圖層藏起來（只隱藏視覺，canvas 照常渲染、點擊區
     照常吃下互動），語音導覽、WebSocket、聊天室都不受影響——見 companion.open()
     跟 toggleChat() 呼叫端。*/
  opacity: 0;
}

.live2d-companion-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* ── 聊天室：點角色才彈出，溫暖紙色調 + 圓角泡泡，跟解籤頁的籤紙/金線視覺呼應 ──
   （這幾個顏色跟 OracleWizard.vue 的 --jiang-hong/--gold 系列同一組值——
   這裡是 Teleport 到 body 的獨立元件，CSS 變數繼承不到，所以直接寫死。） */
.live2d-chatpanel {
  position: fixed;
  left: 96px;
  bottom: 16px;
  z-index: 6;
  width: min(360px, calc(100vw - 112px));
  max-height: min(60vh, 520px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 253, 244, 0.97), rgba(253, 246, 230, 0.95));
  border: 1px solid rgba(212, 175, 55, 0.45);
  box-shadow: 0 12px 30px rgba(120, 60, 40, 0.28);
  font-family: 'Noto Serif TC', serif;
}

.live2d-chatpanel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: linear-gradient(135deg, #a63a3a, #7a2626);
  color: #fff3d6;
  flex: 0 0 auto;
}
.live2d-chatpanel__title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.live2d-chatpanel__close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
}
.live2d-chatpanel__close:hover {
  opacity: 0.75;
}

.live2d-chatpanel__messages {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.live2d-chatpanel__bubble {
  max-width: 84%;
  padding: 8px 12px;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 2px 6px rgba(120, 60, 40, 0.1);
}
.live2d-chatpanel__bubble.is-human {
  align-self: flex-end;
  background: rgba(212, 175, 55, 0.24);
  color: #3a2c22;
  border-radius: 14px 14px 4px 14px;
}
.live2d-chatpanel__bubble.is-ai {
  align-self: flex-start;
  background: rgba(166, 58, 58, 0.1);
  color: #3a2c22;
  border-radius: 14px 14px 14px 4px;
}

.live2d-chatpanel__voice-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid rgba(212, 175, 55, 0.35);
  flex: 0 0 auto;
}

.live2d-chatpanel__transcript {
  flex: 1;
  min-width: 0;
  color: #3a2c22;
  font-size: 12.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  opacity: 0.8;
}

.live2d-chatpanel__mic,
.live2d-chatpanel__send {
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
.live2d-chatpanel__mic {
  width: auto;
  min-width: 48px;
  padding: 0 9px;
  font-size: 11px;
}
.live2d-chatpanel__mic.on {
  background: #7a2626;
  animation: live2d-mic-pulse 1s ease-in-out infinite;
}
.live2d-chatpanel__mic.thinking,
.live2d-chatpanel__send:disabled,
.live2d-chatpanel__mic:disabled {
  opacity: 0.5;
  cursor: wait;
}
.live2d-chatpanel__send:hover {
  transform: scale(1.06);
}
.live2d-chatpanel__send:active {
  transform: scale(0.94);
}
.live2d-chatpanel__speech-hint {
  margin: -4px 12px 9px;
  color: rgba(91, 70, 53, 0.78);
  font-size: 11px;
  line-height: 1.5;
}
@keyframes live2d-mic-pulse {
  50% { box-shadow: 0 0 0 4px rgba(166, 58, 58, 0.2); }
}
</style>
