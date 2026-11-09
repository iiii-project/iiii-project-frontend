<script setup lang="ts">
/**
 * 解籤結果頁的「問金鶴」對話區：直接嵌在結果頁裡，跟 LLM 用對話方式追問這支籤。
 *
 * 跟全站 Live2D 小夥伴共用同一條 WebSocket（wsService 單例）與 live2dChatStore：
 * - 桌機：小夥伴已連線並負責收訊息（AI 回覆經 useAudioTask 寫進 chat store），這裡只負責顯示與送出。
 * - 手機：不渲染小夥伴（見 Live2DCompanionWidget.vue），沒人連線也沒人收訊息，
 *   由這個元件自己連線，並把 AI 回覆的文字寫進 chat store（手機只顯示文字、不播語音）。
 *
 * 籤詩上下文（問題＋籤詩＋解籤）用 remember-context 送給後端，放進角色的 system prompt，
 * 之後每一輪追問都接著這支籤回答。後端是整段覆蓋，重送也不會重複。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sendWhenReady, wsService, type MessageEvent as WsMessageEvent } from '@/live2d/websocketService'
import { useLive2DChatStore } from '@/stores/live2dChatStore'
import { useAiStateStore } from '@/stores/aiStateStore'
import { useLive2DCompanionStore } from '@/stores/live2dCompanionStore'
import { isMobileViewport } from '@/utils/device'
import { useSpeechInput } from '@/utils/speech'

const props = defineProps<{
  /** 送給角色記住的籤詩上下文；空字串代表資料還沒到齊 */
  context: string
  /** 建議提問，點一下就送出 */
  suggestions?: string[]
}>()

const chat = useLive2DChatStore()
const aiState = useAiStateStore()
const companion = useLive2DCompanionStore()

const isWebOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:'
const WS_URL = isWebOrigin
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/client-ws`
  : 'ws://127.0.0.1:8003/client-ws'

/* 只顯示進到結果頁之後的對話：之前儀式引導語音也會寫進 chat store，那些不屬於這裡。 */
const startIndex = ref(chat.messages.length)
const visibleMessages = computed(() => chat.messages.slice(startIndex.value))

const connected = ref(wsService.getCurrentState() === 'OPEN')
const waiting = ref(false)
const draft = ref('')
const MAX_LENGTH = 300
const listRef = ref<HTMLDivElement | null>(null)

let ownsSocket = false
let unsubscribeMessage: (() => void) | null = null
let unsubscribeState: (() => void) | null = null

const {
  supported: speechSupported,
  isRecording,
  hint: speechHint,
  stop: stopRecording,
  toggle: toggleRecording
} = useSpeechInput({
  get: () => draft.value,
  set: (value) => { draft.value = value },
  maxLength: MAX_LENGTH
})

/* 自己持有連線時（手機）才處理訊息；桌機已由 useLive2DWebSocket 處理，重複處理會讓回覆出現兩次。 */
function handleMessage(message: WsMessageEvent) {
  // 桌機小夥伴後來才掛上時，訊息改由它處理（與 Live2DCompanionWidget.vue 的渲染條件一致）
  if (companion.hasOpenedOnce && !isMobileViewport()) return
  switch (message.type) {
    case 'new-history-created':
      chat.setMessages([])
      startIndex.value = 0
      break
    case 'control':
      if (message.text === 'conversation-chain-start') {
        aiState.setAiState('thinking-speaking')
        chat.setForceNewMessage(true)
      } else if (message.text === 'conversation-chain-end') {
        aiState.setAiState('idle')
        waiting.value = false
      }
      break
    case 'force-new-message':
      chat.setForceNewMessage(true)
      break
    case 'audio':
      if (message.display_text?.text) {
        chat.appendAIMessage(message.display_text.text, message.display_text.name, message.display_text.avatar)
      }
      break
    case 'error':
      waiting.value = false
      chat.appendAIMessage('抱歉，金鶴這邊出了點問題，請再問一次。')
      chat.setForceNewMessage(true)
      break
  }
}

function sendContext() {
  if (props.context) void sendWhenReady({ type: 'remember-context', text: props.context })
}

onMounted(() => {
  unsubscribeState = wsService.onStateChange((state) => {
    connected.value = state === 'OPEN'
    // 斷線重連後後端會開新的對話，要把籤詩上下文再送一次
    if (state === 'OPEN') sendContext()
  })
  if (wsService.getCurrentState() === 'CLOSED') {
    ownsSocket = true
    unsubscribeMessage = wsService.onMessage(handleMessage)
    wsService.connect(WS_URL)
  }
  sendContext()
})

onBeforeUnmount(() => {
  if (isRecording.value) stopRecording()
  unsubscribeState?.()
  unsubscribeMessage?.()
  if (ownsSocket) wsService.disconnect()
})

watch(() => props.context, sendContext)

/* 桌機的回覆走 useAudioTask，沒有經過這裡的 handleMessage；用 aiState 回到 idle 判斷這輪結束。 */
watch(
  () => aiState.aiState,
  (state) => {
    if (state === 'idle') waiting.value = false
  }
)

watch(
  () => visibleMessages.value.map((m) => m.content.length).join(),
  async () => {
    await nextTick()
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  }
)

async function send(text?: string) {
  const content = (text ?? draft.value).trim().slice(0, MAX_LENGTH)
  if (!content || waiting.value) return
  if (isRecording.value) stopRecording()
  chat.appendHumanMessage(content)
  chat.setForceNewMessage(true)
  draft.value = ''
  waiting.value = true
  const ok = await sendWhenReady({ type: 'text-input', text: content })
  if (!ok) {
    waiting.value = false
    chat.appendAIMessage('目前連不上金鶴，請稍後再試。')
    chat.setForceNewMessage(true)
  }
}

function onKeydown(event: KeyboardEvent) {
  // 中文輸入法選字時按 Enter 不送出
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void send()
  }
}
</script>

<template>
  <section class="fortune-chat" aria-label="與金鶴對話">
    <header class="fortune-chat__head">
      <h4>問 金 鶴</h4>
      <span class="fortune-chat__status" :class="{ on: connected }">{{ connected ? '已連線' : '連線中…' }}</span>
    </header>

    <div ref="listRef" class="fortune-chat__list" aria-live="polite">
      <p v-if="!visibleMessages.length" class="fortune-chat__empty">
        對這支籤還有疑問嗎？可以直接問金鶴，像聊天一樣一句一句問下去。
      </p>
      <div
        v-for="message in visibleMessages"
        :key="message.id"
        class="fortune-chat__bubble"
        :class="message.role === 'human' ? 'is-human' : 'is-ai'"
      >{{ message.content }}</div>
      <div v-if="waiting" class="fortune-chat__bubble is-ai is-typing">金鶴思考中…</div>
    </div>

    <div v-if="suggestions?.length && !visibleMessages.length" class="fortune-chat__suggestions">
      <button
        v-for="item in suggestions"
        :key="item"
        type="button"
        :disabled="waiting"
        @click="send(item)"
      >{{ item }}</button>
    </div>

    <div class="fortune-chat__input">
      <textarea
        v-model="draft"
        rows="1"
        :maxlength="MAX_LENGTH"
        placeholder="輸入想問的事，或按「說話」"
        @keydown="onKeydown"
      />
      <button
        v-if="speechSupported"
        type="button"
        class="fortune-chat__mic"
        :class="{ on: isRecording }"
        :aria-pressed="isRecording"
        @click="toggleRecording"
      >{{ isRecording ? '停止' : '說話' }}</button>
      <button
        type="button"
        class="fortune-chat__send"
        :disabled="!draft.trim() || waiting"
        aria-label="送出"
        @click="send()"
      >送出</button>
    </div>
    <p v-if="speechHint" class="fortune-chat__hint">{{ speechHint }}</p>
  </section>
</template>

<style scoped>
.fortune-chat {
  margin-top: 18px;
  border: 1px solid rgba(212, 175, 55, 0.45);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255, 253, 244, 0.95), rgba(253, 246, 230, 0.92));
  overflow: hidden;
  font-family: 'Noto Serif TC', serif;
  color: #3a2c22;
}

.fortune-chat__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(135deg, #a63a3a, #7a2626);
  color: #fff3d6;
}
.fortune-chat__head h4 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.2em;
}
.fortune-chat__status {
  font-size: 11px;
  opacity: 0.75;
}
.fortune-chat__status.on::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 50%;
  background: #9be38f;
  vertical-align: 1px;
}

.fortune-chat__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
  max-height: min(48vh, 420px);
  overflow-y: auto;
  padding: 12px 14px;
  overscroll-behavior: contain;
}

.fortune-chat__empty {
  margin: auto 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(91, 70, 53, 0.8);
  text-align: center;
}

.fortune-chat__bubble {
  max-width: 86%;
  padding: 8px 12px;
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.fortune-chat__bubble.is-human {
  align-self: flex-end;
  background: rgba(212, 175, 55, 0.26);
  border-radius: 14px 14px 4px 14px;
}
.fortune-chat__bubble.is-ai {
  align-self: flex-start;
  background: rgba(166, 58, 58, 0.1);
  border-radius: 14px 14px 14px 4px;
}
.fortune-chat__bubble.is-typing {
  opacity: 0.7;
  font-style: italic;
}

.fortune-chat__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 14px 10px;
}
.fortune-chat__suggestions button {
  border: 1px solid rgba(166, 58, 58, 0.35);
  background: rgba(255, 255, 255, 0.6);
  color: #7a2626;
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.fortune-chat__input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(212, 175, 55, 0.35);
}
.fortune-chat__input textarea {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  max-height: 120px;
  resize: vertical;
  border: 1px solid rgba(212, 175, 55, 0.5);
  border-radius: 12px;
  padding: 9px 12px;
  /* 16px 以上，避免 iOS 聚焦時自動放大畫面 */
  font: inherit;
  font-size: 16px;
  line-height: 1.4;
  background: #fffdf6;
  color: inherit;
}

.fortune-chat__mic,
.fortune-chat__send {
  flex: 0 0 auto;
  height: 40px;
  min-width: 52px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.fortune-chat__mic {
  background: rgba(166, 58, 58, 0.12);
  color: #7a2626;
}
.fortune-chat__mic.on {
  background: #7a2626;
  color: #fff3d6;
  animation: fortune-chat-pulse 1s ease-in-out infinite;
}
.fortune-chat__send {
  background: linear-gradient(135deg, #a63a3a, #7a2626);
  color: #fff3d6;
}
.fortune-chat__send:disabled {
  opacity: 0.45;
  cursor: default;
}

.fortune-chat__hint {
  margin: -4px 14px 10px;
  font-size: 12px;
  color: rgba(91, 70, 53, 0.78);
}

@keyframes fortune-chat-pulse {
  50% { box-shadow: 0 0 0 4px rgba(166, 58, 58, 0.2); }
}
</style>
