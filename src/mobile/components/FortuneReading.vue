<script setup lang="ts">
/* 白話、神明指點、建議——分頁呈現，一次只讀一段。
   原本是把四段全部往下貼，手機要滑好幾個螢幕，讀的人抓不到重點；
   改成籤詩之下一排分頁，想看哪段點哪段，內容都在同一個位置出現。 */
import { computed, nextTick, ref, watch } from 'vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { sendChat } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'

interface ReadingInterpretation {
  overall_meaning?: string
  relation_to_question?: string
  suggested_actions?: string[]
}

const props = defineProps<{
  /** 籤詩自帶的白話翻譯 */
  translation?: string | null
  /** 籤詩的一般解釋／典故（有就併在白話後面） */
  explanation?: string | null
  interpretation?: ReadingInterpretation | null
  /** AI 解籤還在路上 */
  pending?: boolean
  /* 「帶走」這一頁：QR 與網址。之前 QR 是貼在分頁外面的一整塊，
     在手機上把籤詩與解籤一起往下推；收進分頁之後版面只需要一個高度。 */
  shareUrl?: string | null
  qrDataUrl?: string | null
  /** 沒有可分享的連結時（例如離線籤）要給的交代，有值就仍然顯示這一頁 */
  offlineHint?: string | null
  /* 「聊聊」這一頁要拿場次編號去打後端的 chat；沒有場次（離線籤）就不出現這一頁。
     後端規定解籤完成後才能聊，而這個元件本來就只在結果頁出現，時機剛好。 */
  sessionId?: string | null
}>()

interface Tab {
  key: string
  label: string
}

const tabs = computed<Tab[]>(() => {
  const list: Tab[] = []
  if (props.translation || props.explanation) list.push({ key: 'plain', label: '白 話' })
  if (props.pending || props.interpretation?.overall_meaning || props.interpretation?.relation_to_question) {
    list.push({ key: 'reading', label: '神明指點' })
  }
  if (props.interpretation?.suggested_actions?.length) list.push({ key: 'actions', label: '可以這樣做' })
  // 有場次才聊得起來（離線籤沒有場次，後端也不會有這支籤的上下文）
  if (props.sessionId) list.push({ key: 'chat', label: '聊 聊' })
  /* 「帶回家」放在最後：先讀懂籤，再談怎麼帶走。
     這一頁同時裝 QR、分享連結與平安符（平安符由外面用 slot 塞進來，
     這個元件不需要認識它）。 */
  if (props.shareUrl || props.offlineHint) list.push({ key: 'takeaway', label: '帶 回 家' })
  return list
})

const active = ref('')

/* 分頁是跟著資料長出來的（解籤晚 20 秒才回來），所以每次資料變動都要確認
   目前這一頁還在；不在了才換到第一頁，避免把使用者正在讀的段落抽掉。 */
watch(
  tabs,
  (list) => {
    if (!list.length) {
      active.value = ''
      return
    }
    if (!list.some((tab) => tab.key === active.value)) active.value = list[0].key
  },
  { immediate: true }
)
/* ── 帶走：分享連結 ──
   優先用系統的分享面板（Web Share API），使用者可以直接丟到 LINE 或訊息；
   桌機或不支援的瀏覽器退回複製到剪貼簿，兩條路都給得出結果。
   使用者在分享面板按取消會 throw AbortError，那不是錯誤，不要報給他看。 */
const shareNote = ref('')

async function shareLink() {
  const url = props.shareUrl
  if (!url) return
  shareNote.value = ''
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
  if (nav.share) {
    try {
      await nav.share({ title: '籤好運', text: '我求到一支籤，分享給你看看', url })
      return
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return
      // 分享失敗就往下退到複製，不要什麼都沒發生
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    shareNote.value = '連結已複製，貼到訊息裡就能傳給人。'
  } catch {
    shareNote.value = '這個瀏覽器不支援分享，請手動複製上面的網址。'
  }
}

/* ── 聊聊：就這支籤追問 ──
   刻意做得很簡單：一列訊息 + 一個輸入框，不做串流、不做重試。
   後端有次數上限（回傳 remaining_messages），用完要明講，不要讓人一直打字沒反應。 */
interface ChatLine { id: number; role: 'user' | 'mili'; text: string }
const chatLines = ref<ChatLine[]>([])
const chatInput = ref('')
const chatSending = ref(false)
const chatError = ref('')
const chatRemaining = ref<number | null>(null)
const chatBodyEl = ref<HTMLElement | null>(null)
let chatSeq = 0

const chatDisabled = computed(() => chatSending.value || chatRemaining.value === 0)

async function scrollChatToEnd() {
  await nextTick()
  const el = chatBodyEl.value
  if (el) el.scrollTop = el.scrollHeight
}

async function sendChatMessage() {
  const text = chatInput.value.trim()
  const id = props.sessionId
  if (!text || !id || chatDisabled.value) return
  chatError.value = ''
  chatLines.value.push({ id: ++chatSeq, role: 'user', text })
  chatInput.value = ''
  chatSending.value = true
  void scrollChatToEnd()
  try {
    const result = await sendChat(id, text)
    chatLines.value.push({ id: ++chatSeq, role: 'mili', text: String(result.reply ?? '').trim() || '（沒有回覆）' })
    chatRemaining.value = result.remaining_messages
  } catch (error) {
    chatError.value = toUserMessage(error)
  } finally {
    chatSending.value = false
    void scrollChatToEnd()
  }
}
</script>

<template>
  <section v-if="tabs.length" class="reading">
    <div class="tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ on: tab.key === active }"
        type="button"
        role="tab"
        :aria-selected="tab.key === active"
        @click="active = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="pane" role="tabpanel">
      <template v-if="active === 'plain'">
        <MarkdownText v-if="translation" :value="translation" />
        <MarkdownText v-if="explanation" class="soft" :value="explanation" />
      </template>

      <template v-else-if="active === 'reading'">
        <MarkdownText v-if="interpretation?.overall_meaning" :value="interpretation.overall_meaning" />
        <MarkdownText v-if="interpretation?.relation_to_question" class="quote" :value="interpretation.relation_to_question" />
        <p v-if="pending && !interpretation?.overall_meaning" class="waiting">
          <span class="smoke" aria-hidden="true"><i></i><i></i><i></i></span>
          神明正在為你解這支籤，稍待片刻…
        </p>
      </template>

      <!-- 聊聊：就這支籤追問。米粒當背景，訊息浮在她前面 -->
      <template v-else-if="active === 'chat'">
        <div class="chat">
          <div ref="chatBodyEl" class="chat-body">
            <p v-if="!chatLines.length" class="chat-empty">想再問什麼都可以，例如「這支籤是說我該換工作嗎？」</p>
            <div v-for="line in chatLines" :key="line.id" class="chat-line" :class="line.role">
              <span class="chat-bubble">{{ line.text }}</span>
            </div>
            <p v-if="chatSending" class="chat-typing">米粒正在想…</p>
          </div>
          <p v-if="chatError" class="chat-error">{{ chatError }}</p>
          <p v-else-if="chatRemaining === 0" class="chat-error">這次的對話次數用完了，重新求籤就能再聊。</p>
          <form class="chat-input" @submit.prevent="sendChatMessage">
            <input
              v-model="chatInput"
              type="text"
              maxlength="120"
              placeholder="想問米粒什麼呢？"
              :disabled="chatDisabled"
            />
            <button type="submit" :disabled="chatDisabled || !chatInput.trim()">送出</button>
          </form>
        </div>
      </template>

      <template v-else-if="active === 'takeaway'">
        <div v-if="shareUrl" class="takeaway">
          <img v-if="qrDataUrl" class="takeaway-qr" :src="qrDataUrl" alt="掃描以在手機上開啟這支籤" />
          <div v-else class="takeaway-qr is-pending">QR 產生中…</div>
          <p>用手機掃描，推開廟門就能收下這支籤。想留成圖片的話，平安符也帶著同一個連結。</p>
          <button class="share-btn" type="button" @click="shareLink">分 享 連 結</button>
          <p v-if="shareNote" class="share-note">{{ shareNote }}</p>
          <p class="takeaway-url">{{ shareUrl }}</p>
          <!-- 平安符：由呼叫端塞進來，符面依這一支籤而不同 -->
          <div class="takeaway-extra"><slot name="takeaway" /></div>
        </div>
        <div v-else>
          <p>{{ offlineHint }}</p>
          <div class="takeaway-extra"><slot name="takeaway" /></div>
        </div>
      </template>

      <template v-else-if="active === 'actions'">
        <ul>
          <li v-for="(item, i) in interpretation?.suggested_actions ?? []" :key="`a${i}`">
            <MarkdownText :value="item" as="span" inline />
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.reading { margin-top: 22px; }

.tabs {
  display: flex;
  gap: 4px;
  /* 分頁列不參與壓縮：外層高度不夠時要壓的是內容區（它自己會捲），
     不然放大字級時整排標籤會被擠扁、字被切掉一半。 */
  flex: none;
  overflow-x: auto;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.35);
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  position: relative;
  /* 標籤本身也不能被壓縮，寧可整排橫向捲動 */
  flex: 0 0 auto;
  min-height: calc(38px * var(--fs, 1));
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 10px 14px 11px;
  font-family: inherit;
  font-size: calc(13px * var(--fs, 1));
  letter-spacing: 0.14em;
  color: rgba(91, 70, 53, 0.62);
  white-space: nowrap;
}
.tab::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--jiang-hong, #a63a3a);
  transform: scaleX(0);
  transition: transform 0.24s ease;
}
.tab.on {
  color: var(--jiang-hong-deep, #7a2626);
  font-weight: 600;
}
.tab.on::after { transform: scaleX(1); }

.reading {
  /* 外層給了高度就吃滿，並讓 pane 成為唯一會捲的區塊 */
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.pane {
  /* 切換分頁時高度不要抖動 */
  min-height: 120px;
  padding: 16px 2px 0;
  animation: pane-in 0.26s ease-out both;
}
/* 全域的 .markdown-text 是給深色底用的米黃字（見 assets/styles.css），
   畫在這張近白的籤卡上等於看不見——實測 rgba(242,226,179,0.88)。
   「可以這樣做」那頁用的是 <MarkdownText as="span" inline>，渲染成 span，
   所以下面 :deep(p) 的深褐色覆寫不到它。這裡讓它一律繼承容器顏色。 */
.pane :deep(.markdown-text) { color: inherit; }

.pane p,
.pane :deep(p),
.pane :deep(h3),
.pane :deep(h4),
.pane :deep(h5) {
  margin: 0 0 12px;
  font-size: calc(14.5px * var(--fs, 1));
  line-height: 2;
  letter-spacing: 0.03em;
  color: var(--ink-soft, #5b4635);
}
.pane :deep(h3),
.pane :deep(h4),
.pane :deep(h5) {
  color: var(--jiang-hong-deep, #7a2626);
  font-weight: 700;
}
.pane .soft,
.pane .soft :deep(*) { color: rgba(91, 70, 53, 0.72); }
.pane .quote {
  padding-left: 12px;
  border-left: 2px solid rgba(212, 175, 55, 0.5);
  color: var(--ink, #3a2c22);
}
.pane ul,
.pane :deep(ul),
.pane :deep(ol) { margin: 0 0 12px; padding-left: 1.25em; }
.pane li,
.pane :deep(li) {
  margin-bottom: 8px;
  font-size: calc(14.5px * var(--fs, 1));
  line-height: 1.95;
  color: var(--ink-soft, #5b4635);
}
.pane :deep(strong) { color: var(--ink, #3a2c22); font-weight: 700; }
.pane :deep(em) { font-style: normal; color: var(--jiang-hong-deep, #7a2626); }
.pane :deep(code) {
  padding: 0.08em 0.35em;
  border-radius: 4px;
  background: rgba(212, 175, 55, 0.14);
  font-family: inherit;
}
.pane :deep(a) { color: var(--jiang-hong-deep, #7a2626); text-underline-offset: 3px; }

/* 「帶走」這一頁：QR 置中，說明與網址跟著它。
   QR 尺寸跟著字級一起放大——長輩把字調大時，碼也要好掃。 */
.takeaway { text-align: center; }
.takeaway-qr {
  display: block;
  width: calc(150px * var(--fs, 1));
  height: calc(150px * var(--fs, 1));
  margin: 0 auto 12px;
  padding: 8px;
  border-radius: 10px;
  background: #fffdf6;
  box-shadow: 0 6px 18px rgba(120, 90, 50, 0.16);
}
.takeaway-qr.is-pending {
  display: grid;
  place-items: center;
  font-size: calc(12.5px * var(--fs, 1));
  color: rgba(91, 70, 53, 0.55);
}
.takeaway-url {
  font-size: calc(12px * var(--fs, 1)) !important;
  line-height: 1.7 !important;
  word-break: break-all;
  color: rgba(91, 70, 53, 0.6) !important;
}

/* ── 聊聊 ──
   米粒當背景：用 CSS 變數指進來，值由外面給（見 --chat-chick）。
   角色本體是 Live2D 的 canvas、不是圖檔，所以這裡吃的是一張靜態圖；
   還沒給圖時就只有淡淡的暖底，不會出現破圖。 */
.chat {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.chat::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--chat-chick, none) center bottom / auto 78% no-repeat;
  /* 背景只是陪襯，壓淡才不會跟訊息搶注意力 */
  opacity: 0.22;
  pointer-events: none;
}
.chat-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 0 6px;
}
.chat-empty {
  margin: 0 !important;
  color: rgba(91, 70, 53, 0.6) !important;
  font-size: calc(13px * var(--fs, 1)) !important;
}
.chat-line { display: flex; }
.chat-line.user { justify-content: flex-end; }
.chat-bubble {
  max-width: 82%;
  padding: 8px 12px;
  border-radius: 14px;
  font-size: calc(13.5px * var(--fs, 1));
  line-height: 1.7;
  background: rgba(255, 253, 246, 0.96);
  border: 1px solid rgba(212, 175, 55, 0.4);
  color: var(--ink, #3a2c22);
}
.chat-line.user .chat-bubble {
  background: linear-gradient(150deg, var(--jiang-hong, #a63a3a), var(--jiang-hong-deep, #7a2626));
  border-color: transparent;
  color: #fdf5e2;
}
.chat-typing {
  margin: 0 !important;
  font-size: calc(12.5px * var(--fs, 1)) !important;
  color: rgba(91, 70, 53, 0.6) !important;
}
.chat-error {
  margin: 6px 0 0 !important;
  font-size: calc(12.5px * var(--fs, 1)) !important;
  color: var(--jiang-hong-deep, #7a2626) !important;
}
.chat-input {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 8px;
  padding-top: 8px;
}
.chat-input input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(212, 175, 55, 0.5);
  background: rgba(255, 255, 255, 0.92);
  font-family: inherit;
  font-size: calc(13.5px * var(--fs, 1));
  color: var(--ink, #3a2c22);
}
.chat-input button {
  flex: none;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  background: linear-gradient(150deg, var(--jiang-hong, #a63a3a), var(--jiang-hong-deep, #7a2626));
  color: #fdf5e2;
  font-family: inherit;
  font-size: calc(13px * var(--fs, 1));
  letter-spacing: 0.1em;
}
.chat-input input:disabled, .chat-input button:disabled { opacity: 0.5; }

/* 平安符按鈕：跟分享連結拉開距離，兩者是不同的「帶走」方式 */
.takeaway-extra { margin-top: 12px; }

/* 分享連結：主要動作，放在說明與網址之間 */
.share-btn {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 4px 0 8px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  background: linear-gradient(150deg, var(--jiang-hong, #a63a3a), var(--jiang-hong-deep, #7a2626));
  color: #fdf5e2;
  font-family: inherit;
  font-size: calc(14px * var(--fs, 1));
  letter-spacing: 0.16em;
  text-indent: 0.16em;
}
.share-note {
  margin: 0 0 6px !important;
  font-size: calc(12.5px * var(--fs, 1)) !important;
  color: var(--jiang-hong-deep, #7a2626) !important;
}

/* 等解籤：延用站上香煙裊裊的語彙，不要轉圈圈 */
.waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(91, 70, 53, 0.7) !important;
}
.smoke {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 18px;
}
.smoke i {
  display: block;
  width: 2px;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(180deg, rgba(150, 128, 104, 0), rgba(150, 128, 104, 0.75));
  animation: smoke-rise 1.6s ease-in-out infinite;
}
.smoke i:nth-child(2) { animation-delay: 0.35s; }
.smoke i:nth-child(3) { animation-delay: 0.7s; }

@keyframes pane-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes smoke-rise {
  0%, 100% { opacity: 0.25; transform: scaleY(0.6); }
  50% { opacity: 0.9; transform: scaleY(1); }
}

@media (prefers-reduced-motion: reduce) {
  .pane { animation: none; }
  .smoke i { animation: none; }
}
</style>
