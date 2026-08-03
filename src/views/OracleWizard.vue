<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toUserMessage } from '@/api/client'
import { createDivination, listFortuneSets } from '@/api/divinationApi'
import type { Category, DivinationSession } from '@/types/divination'

const router = useRouter()

// 沿用舊版（v17）的五個方向與說明文案
const CATEGORIES: { value: Category; label: string; emoji: string; hint: string }[] = [
  { value: 'health', label: '身體健康', emoji: '🌿', hint: '身體、看病、平安' },
  { value: 'family', label: '家庭平安', emoji: '🏠', hint: '家人、子女、和睦' },
  { value: 'career', label: '工作錢財', emoji: '💰', hint: '工作、生意、財運' },
  { value: 'love', label: '感情姻緣', emoji: '💗', hint: '感情、對象、緣分' },
  { value: 'other', label: '其他心事', emoji: '🙏', hint: '任何想問的事' }
]

const STEPS = ['選方向', '說心事', '確認送出']
const ANON_KEY = 'temple-oracle-anonymous-user-id'
const QUESTION_MAX = 200

/* ── 語音輸入：瀏覽器內建的語音辨識（Chrome / Edge / Safari 走 webkit 前綴）──
   TS 的 DOM 型別沒有這組介面，這裡只宣告實際會用到的成員。 */
interface SpeechResultAlternative {
  transcript: string
}
interface SpeechResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechResultAlternative
}
interface SpeechResultList {
  readonly length: number
  [index: number]: SpeechResult
}
interface SpeechRecognitionResultEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function anonymousUserId(): string {
  let value = localStorage.getItem(ANON_KEY)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(ANON_KEY, value)
  }
  return value
}

const step = ref(1)
const category = ref<Category | null>(null)
const question = ref('')
const errorMessage = ref('')
const loadingLabel = ref('')
const session = ref<DivinationSession | null>(null)

const isBusy = computed(() => loadingLabel.value !== '')
const chosen = computed(() => CATEGORIES.find((item) => item.value === category.value) ?? null)

/* ── 入場雲霧：承接首頁捲起的那團霧，在這裡向外飄散 ── */
const enterWisps = Array.from({ length: 12 }, (_, index) => {
  const angle = index * 30 + (index % 5) * 8
  return {
    id: index,
    angle: `${angle}deg`,
    from: `${5 + (index % 4) * 6}vmax`,
    to: `${44 + (index % 6) * 10}vmax`,
    size: `${300 + (index % 5) * 120}px`,
    spin: `${(index % 2 ? 1 : -1) * (40 + (index % 4) * 22)}deg`,
    delay: `${(index % 8) * 0.018}s`,
    dur: `${0.55 + (index % 5) * 0.07}s`,
    churn: `${1.2 + (index % 6) * 0.25}s`
  }
})
const showEnterMist = ref(true)
let mistTimer = 0

// ── 語音輸入狀態 ──
const speechSupported = ref(false)
const isRecording = ref(false)
const speechHint = ref('')
let recognition: SpeechRecognitionLike | null = null
let committedText = ''

onMounted(() => {
  speechSupported.value = getRecognitionCtor() !== null
  // 雲霧散盡後把整層移除，之後就不再佔用繪圖資源
  mistTimer = window.setTimeout(() => (showEnterMist.value = false), 900)
})

function startRecording() {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    speechHint.value = '這個瀏覽器不支援語音輸入，請直接打字。'
    return
  }
  errorMessage.value = ''
  speechHint.value = ''
  committedText = question.value

  recognition = new Ctor()
  recognition.lang = 'zh-TW'
  recognition.continuous = true
  recognition.interimResults = true

  recognition.onresult = (event) => {
    let settled = ''
    let pending = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const text = result[0]?.transcript ?? ''
      if (result.isFinal) settled += text
      else pending += text
    }
    if (settled) committedText = (committedText + settled).slice(0, QUESTION_MAX)
    question.value = (committedText + pending).slice(0, QUESTION_MAX)
  }

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      speechHint.value = '麥克風權限被拒絕，請在瀏覽器網址列開啟麥克風權限後再試。'
    } else if (event.error === 'no-speech') {
      speechHint.value = '沒有聽到聲音，請靠近麥克風再說一次。'
    } else if (event.error === 'audio-capture') {
      speechHint.value = '找不到麥克風，請確認裝置是否接上。'
    } else if (event.error !== 'aborted') {
      speechHint.value = '語音辨識中斷了，請再試一次或直接打字。'
    }
  }

  recognition.onend = () => {
    isRecording.value = false
    question.value = committedText
    recognition = null
  }

  try {
    recognition.start()
    isRecording.value = true
    speechHint.value = '正在聆聽，說完再按一次停止。'
  } catch {
    isRecording.value = false
    speechHint.value = '無法啟動語音輸入，請直接打字。'
  }
}

function stopRecording() {
  recognition?.stop()
  isRecording.value = false
}

function toggleRecording() {
  if (isRecording.value) stopRecording()
  else startRecording()
}

let submitDelay = 0
onBeforeUnmount(() => {
  if (submitDelay) window.clearTimeout(submitDelay)
  if (mistTimer) window.clearTimeout(mistTimer)
  recognition?.abort()
  recognition = null
})

function goStep(next: number) {
  errorMessage.value = ''
  step.value = next
}

function chooseCategory(value: Category) {
  errorMessage.value = ''
  category.value = value
}

// 不打字也能繼續：沒寫就以所選方向請示
const askedQuestion = computed(() => {
  const typed = question.value.trim()
  if (typed) return typed
  return `想請示關於${chosen.value?.label ?? '心中'}的事`
})
const hasTypedQuestion = computed(() => question.value.trim().length > 0)

function confirmQuestion() {
  if (isRecording.value) stopRecording()
  goStep(3)
}

// 收集完成，送出建立求籤的 API
async function submit() {
  if (isBusy.value) return
  errorMessage.value = ''
  loadingLabel.value = '正在焚香稟告神明'
  try {
    const sets = await listFortuneSets()
    const set = sets.find((item) => item.is_default) ?? sets[0]
    if (!set) throw new Error('no fortune set available')

    const [created] = await Promise.all([
      createDivination({
        fortune_set_code: set.code,
        question: askedQuestion.value,
        category: category.value ?? 'other',
        categories: [category.value ?? 'other'],
        interaction_mode: 'click',
        anonymous_user_id: anonymousUserId()
      }),
      // 讓香爐動畫至少完整跑一輪，避免畫面一閃而過
      new Promise((resolve) => {
        submitDelay = window.setTimeout(resolve, 1800)
      })
    ])

    session.value = created
    step.value = 4
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    loadingLabel.value = ''
  }
}

function restart() {
  step.value = 1
  category.value = null
  question.value = ''
  session.value = null
  errorMessage.value = ''
}
</script>

<template>
  <div class="oracle-page" :class="{ 'mist-active': showEnterMist }">
    <!-- 銜接首頁金光的入場光幕 -->
    <div class="enter-veil" aria-hidden="true"></div>

    <!-- 承接首頁捲起的雲霧，在這裡消散開來 -->
    <div v-if="showEnterMist" class="enter-mist" aria-hidden="true">
      <span class="unswirl u1"></span>
      <span class="unswirl u2"></span>
      <span class="fogbank g1"></span>
      <span class="fogbank g2"></span>
      <span class="fogbank g3"></span>
      <span
        v-for="wisp in enterWisps"
        :key="wisp.id"
        class="wisp"
        :style="{
          '--angle': wisp.angle,
          '--from': wisp.from,
          '--to': wisp.to,
          '--size': wisp.size,
          '--spin': wisp.spin,
          '--delay': wisp.delay,
          '--dur': wisp.dur,
          '--churn': wisp.churn
        }"
      >
        <i class="churn"></i>
      </span>
    </div>

    <!-- 雲霧背景 -->
    <div class="oracle-sky" aria-hidden="true">
      <div class="sky-wash"></div>
      <div class="halo"></div>
      <div class="cloud c1"></div>
      <div class="cloud c2"></div>
      <div class="cloud c3"></div>
    </div>

    <header class="oracle-bar">
      <button class="link-btn" type="button" @click="router.push('/celestial')">← 回首頁</button>
      <ol class="steps">
        <li v-for="(name, index) in STEPS" :key="name" :class="{ on: step === index + 1, done: step > index + 1 }">
          <i>{{ index + 1 }}</i><span>{{ name }}</span>
        </li>
      </ol>
    </header>

    <main class="oracle-main">
      <!-- 等待動畫：香煙裊裊，取代轉圈圈 -->
      <div v-if="isBusy" class="waiting" role="status" aria-live="polite">
        <svg class="censer" viewBox="0 0 240 260">
          <g class="smoke">
            <path class="s1" d="M120,168 C104,144 136,126 120,100 C106,78 132,58 120,34" />
            <path class="s2" d="M98,172 C86,150 108,134 96,112 C86,94 104,78 96,58" />
            <path class="s3" d="M142,172 C154,150 132,134 144,112 C154,94 136,78 144,58" />
          </g>
          <ellipse class="ember" cx="120" cy="182" rx="34" ry="7" />
          <path class="bowl" d="M78,180 C78,204 94,220 120,220 C146,220 162,204 162,180 Z" />
          <path class="rim" d="M70,178 C90,170 150,170 170,178 C150,188 90,188 70,178 Z" />
          <path class="foot" d="M104,220 L100,238 L140,238 L136,220 Z" />
          <path class="base" d="M88,238 C104,232 136,232 152,238 C136,246 104,246 88,238 Z" />
          <g class="lotus">
            <path d="M120,246 C112,254 96,256 84,252 C94,244 110,242 120,246 Z" />
            <path d="M120,246 C128,254 144,256 156,252 C146,244 130,242 120,246 Z" />
          </g>
        </svg>
        <p class="waiting-text">{{ loadingLabel }}</p>
        <div class="waiting-track"><i></i></div>
      </div>

      <!-- 步驟一：選方向 -->
      <section v-else-if="step === 1" class="panel">
        <p class="kicker">第 一 步</p>
        <h2>今天想請示哪一方面？</h2>
        <p class="lede">先讓神明知道你要問的方向，指點才會落在心坎上。</p>
        <div class="choice-list">
          <button
            v-for="item in CATEGORIES"
            :key="item.value"
            class="choice-row"
            :class="{ selected: category === item.value }"
            type="button"
            @click="chooseCategory(item.value)"
          >
            <span class="choice-icon" aria-hidden="true">{{ item.emoji }}</span>
            <span class="choice-text">
              <span class="choice-label">{{ item.label }}</span>
              <span class="choice-desc">{{ item.hint }}</span>
            </span>
            <span class="choice-check" aria-hidden="true">✓</span>
          </button>
        </div>
        <div class="row">
          <button class="btn primary" type="button" :disabled="!category" @click="goStep(2)">下 一 步</button>
        </div>
      </section>

      <!-- 步驟二：說心事 -->
      <section v-else-if="step === 2" class="panel">
        <p class="kicker">第 二 步 · {{ chosen?.label }}</p>
        <h2>想跟神明說什麼？</h2>
        <p class="lede">
          像在神明面前稟告一樣，說清楚人、事、時間，解籤會更貼近你的處境。
          <span class="optional-note">不想打字也沒關係——可以用說的，或直接跳過，神明會依你選的方向指點。</span>
        </p>
        <div class="ask-wrap" :class="{ recording: isRecording }">
          <textarea
            v-model="question"
            class="ask"
            rows="5"
            :maxlength="QUESTION_MAX"
            placeholder="例：我在考慮下個月換工作，想請示這個決定是否合適？　（可留白，或按下方麥克風用說的）"
          ></textarea>
        </div>
        <div class="ask-tools">
          <button
            v-if="speechSupported"
            class="mic"
            :class="{ on: isRecording }"
            type="button"
            :aria-pressed="isRecording"
            @click="toggleRecording"
          >
            <span class="mic-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
                <path class="mic-arc" d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
                <path class="mic-stem" d="M12 18v3" />
              </svg>
            </span>
            <span class="mic-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="mic-label">{{ isRecording ? '停 止 錄 音' : '用 說 的' }}</span>
          </button>
          <p class="count">{{ question.length }} / {{ QUESTION_MAX }}</p>
        </div>
        <p v-if="speechHint" class="speech-hint">{{ speechHint }}</p>
        <div class="row">
          <button class="btn ghost" type="button" @click="goStep(1)">上一步</button>
          <button class="btn primary" type="button" @click="confirmQuestion">
            {{ hasTypedQuestion ? '下 一 步' : '略 過 不 填' }}
          </button>
        </div>
      </section>

      <!-- 步驟三：確認送出 -->
      <section v-else-if="step === 3" class="panel">
        <p class="kicker">第 三 步</p>
        <h2>確認要向神明請示的內容</h2>
        <p class="lede">再看一次，確定沒問題就誠心送出。</p>
        <dl class="summary">
          <div>
            <dt>所問方向</dt>
            <dd>{{ chosen?.emoji }} {{ chosen?.label }}</dd>
          </div>
          <div>
            <dt>要問的事</dt>
            <dd>
              {{ askedQuestion }}
              <span v-if="!hasTypedQuestion" class="dd-note">（未填寫，以所選方向請示）</span>
            </dd>
          </div>
        </dl>
        <div class="row">
          <button class="btn ghost" type="button" @click="goStep(2)">回去修改</button>
          <button class="btn primary" type="button" @click="submit">誠 心 送 出</button>
        </div>
      </section>

      <!-- 送出完成 -->
      <section v-else class="panel center">
        <p class="kicker">已 送 出</p>
        <h2>心意已經稟告神明</h2>
        <p class="lede">這次請示已經建立，後面的求籤流程之後再接上。</p>
        <dl class="summary">
          <div>
            <dt>所問方向</dt>
            <dd>{{ chosen?.emoji }} {{ chosen?.label }}</dd>
          </div>
          <div>
            <dt>要問的事</dt>
            <dd>
              {{ askedQuestion }}
              <span v-if="!hasTypedQuestion" class="dd-note">（未填寫，以所選方向請示）</span>
            </dd>
          </div>
          <div>
            <dt>請示編號</dt>
            <dd class="mono">{{ session?.session_id }}</dd>
          </div>
          <div>
            <dt>目前狀態</dt>
            <dd>{{ session?.status }}</dd>
          </div>
        </dl>
        <div class="row">
          <button class="btn ghost" type="button" @click="restart">再問一題</button>
          <button class="btn primary" type="button" @click="router.push('/celestial')">回 首 頁</button>
        </div>
      </section>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </main>
  </div>
</template>

<style scoped>
.oracle-page {
  --jiang-hong: #a63a3a;
  --jiang-hong-deep: #7a2626;
  --gold: #d4af37;
  --gold-soft: #f2e2b3;
  --gold-line: rgba(212, 175, 55, 0.42);
  --ink: #3a2c22;
  --ink-soft: #5b4635;

  position: relative;
  min-height: 100vh;
  padding: 0 20px 80px;
  color: var(--ink);
  font-family: 'Noto Serif TC', serif;
  overflow: hidden;
}

/* ── 入場光幕：承接首頁玉皇大帝的金光 ── */
.enter-veil {
  position: fixed;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  background: radial-gradient(60% 45% at 50% 42%, #fffae8 0%, rgba(255, 240, 202, 0.92) 45%, rgba(246, 222, 178, 0.7) 100%);
  animation: veil-out 0.45s ease-out forwards;
}

/* ── 入場雲霧消散 ── */
.enter-mist {
  position: fixed;
  inset: 0;
  z-index: 39;
  pointer-events: none;
  overflow: hidden;
}
/* 霧幕：用漸層本身做柔邊，不靠昂貴的 filter: blur 撐開整片畫面 */
.unswirl {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 86vmax;
  height: 86vmax;
  margin: -43vmax 0 0 -43vmax;
  border-radius: 50%;
  background: repeating-conic-gradient(
    from 0deg at 50% 50%,
    rgba(255, 255, 255, 0) 0deg,
    rgba(255, 255, 255, 0.5) 14deg,
    rgba(255, 252, 240, 0) 30deg,
    rgba(255, 255, 255, 0) 46deg
  );
  -webkit-mask-image: radial-gradient(closest-side, #000 16%, rgba(0, 0, 0, 0.65) 48%, transparent 80%);
  mask-image: radial-gradient(closest-side, #000 16%, rgba(0, 0, 0, 0.65) 48%, transparent 80%);
  animation: unswirl 0.7s cubic-bezier(0.2, 0.5, 0.25, 1) forwards;
}
.unswirl.u2 {
  animation-name: unswirl-back;
  animation-duration: 0.82s;
}
/* 底霧：先鋪滿，再邊翻湧邊散開 */
.fogbank {
  position: absolute;
  left: 50%;
  top: 44%;
  width: 70vmax;
  height: 46vmax;
  margin: -23vmax 0 0 -35vmax;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.9), rgba(255, 252, 240, 0.45) 52%, rgba(255, 250, 236, 0) 80%);
  animation:
    fog-fade 0.62s ease-out forwards,
    fog-billow 3s ease-in-out infinite;
}
.fogbank.g2 { width: 88vmax; height: 40vmax; margin: -20vmax 0 0 -44vmax; animation-duration: 0.72s, 3.6s; }
.fogbank.g3 { width: 54vmax; height: 58vmax; margin: -29vmax 0 0 -27vmax; animation-duration: 0.56s, 2.6s; }

/* 霧絮：外層往外飄散、內層自己翻騰 */
.wisp {
  position: absolute;
  left: 50%;
  top: 46%;
  width: var(--size, 340px);
  height: calc(var(--size, 340px) * 0.62);
  margin-left: calc(var(--size, 340px) / -2);
  margin-top: calc(var(--size, 340px) * -0.31);
  opacity: 0;
  animation: wisp-away var(--dur, 1.5s) cubic-bezier(0.2, 0.55, 0.25, 1) var(--delay, 0s) forwards;
}
.wisp .churn {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.95), rgba(255, 250, 236, 0.5) 52%, rgba(255, 250, 236, 0) 78%);
  animation: churn var(--churn, 3s) ease-in-out infinite;
}

@keyframes unswirl {
  0% { transform: rotate(150deg) scale(1.35); opacity: 1; }
  55% { opacity: 0.6; }
  100% { transform: rotate(238deg) scale(2.4); opacity: 0; }
}
@keyframes unswirl-back {
  0% { transform: rotate(-130deg) scale(1.5); opacity: 0.85; }
  55% { opacity: 0.45; }
  100% { transform: rotate(-226deg) scale(2.6); opacity: 0; }
}
@keyframes wisp-away {
  0% {
    transform: rotate(var(--angle, 0deg)) translateX(var(--from, 8vmax)) rotate(calc(var(--angle, 0deg) * -1)) scale(1);
    opacity: 0.95;
  }
  55% { opacity: 0.7; }
  100% {
    transform: rotate(var(--angle, 0deg)) translateX(var(--to, 50vmax))
      rotate(calc(var(--angle, 0deg) * -1 + var(--spin, 40deg))) scale(2.2);
    opacity: 0;
  }
}
/* 霧團自己的翻騰 */
@keyframes churn {
  0%, 100% { transform: rotate(0deg) scale(1, 1); }
  33% { transform: rotate(13deg) scale(1.16, 0.87); }
  66% { transform: rotate(-10deg) scale(0.89, 1.15); }
}
@keyframes fog-fade {
  0% { opacity: 0.9; }
  60% { opacity: 0.5; }
  100% { opacity: 0; }
}
@keyframes fog-billow {
  0%, 100% { transform: translate3d(-2%, 2%, 0) scale(1) rotate(0deg); }
  50% { transform: translate3d(3%, -3%, 0) scale(1.24) rotate(-7deg); }
}

/* ── 背景 ── */
.oracle-sky {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.sky-wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #d9e6e4 0%, #ece4d2 34%, #f7eeda 66%, #fdf8ee 100%);
}
.halo {
  position: absolute;
  left: 50%;
  top: -26vh;
  width: 90vw;
  height: 90vw;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(255, 240, 198, 0.9), rgba(255, 240, 198, 0) 70%);
  animation: breathe 10s ease-in-out infinite;
}
.cloud {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.35) 52%, rgba(255, 255, 255, 0) 76%);
  filter: blur(14px);
}
.cloud.c1 { left: -14%; top: 22%; width: 70vw; height: 30vh; animation: drift-a 52s ease-in-out infinite; }
.cloud.c2 { right: -18%; top: 48%; width: 78vw; height: 34vh; animation: drift-b 64s ease-in-out infinite; }
.cloud.c3 { left: 8%; bottom: -10%; width: 90vw; height: 32vh; animation: drift-a 46s ease-in-out infinite reverse; }

/* ── 頂部與步驟列 ── */
.oracle-bar {
  position: relative;
  z-index: 2;
  max-width: 940px;
  margin: 0 auto;
  padding: 26px 0 10px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.link-btn {
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.14em;
  color: var(--ink-soft);
  padding: 6px 2px;
}
.link-btn:hover { color: var(--jiang-hong); }

.steps {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0 0 0 auto;
  padding: 0;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  letter-spacing: 0.1em;
  color: rgba(91, 70, 53, 0.5);
}
.steps i {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--gold-line);
  font-style: normal;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.6);
}
.steps li.on { color: var(--jiang-hong); }
.steps li.on i { background: var(--jiang-hong); border-color: var(--jiang-hong); color: #fff5dd; }
.steps li.done i { background: var(--gold-soft); border-color: var(--gold); color: #5a3b10; }

/* ── 主面板 ── */
.oracle-main {
  position: relative;
  z-index: 2;
  max-width: 720px;
  margin: 0 auto;
}
.panel {
  background: rgba(255, 253, 247, 0.82);
  border: 1px solid var(--gold-line);
  border-radius: 22px;
  padding: 40px 38px 36px;
  box-shadow: 0 24px 60px rgba(120, 90, 50, 0.14);
  backdrop-filter: blur(10px);
  animation: rise-in 0.6s ease-out both;
}
/* 入場雲霧還在時先關掉毛玻璃：整片霧疊毛玻璃會讓合成器卡住 */
.mist-active .panel {
  backdrop-filter: none;
}
.panel.center { text-align: center; }
.kicker {
  margin: 0 0 12px;
  font-size: 11.5px;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: var(--gold);
}
.panel h2 {
  margin: 0 0 10px;
  font-size: clamp(22px, 3.4vw, 30px);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--jiang-hong-deep);
}
.lede {
  margin: 0 0 26px;
  font-size: 14px;
  line-height: 2;
  letter-spacing: 0.05em;
  color: rgba(91, 70, 53, 0.85);
}

/* ── 分類：沿用舊版的大圖示清單 ── */
.choice-list { display: grid; gap: 12px; }
.choice-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 74px;
  padding: 0.9rem 1.1rem;
  border-radius: 16px;
  border: 1px solid var(--gold-line);
  background: #fffdf8;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.choice-row:hover { border-color: rgba(166, 58, 58, 0.45); }
.choice-icon { flex: 0 0 auto; font-size: 27px; line-height: 1; }
.choice-text { flex: 1 1 auto; min-width: 0; }
.choice-label { display: block; font-size: 19px; font-weight: 700; color: var(--ink); letter-spacing: 0.04em; }
.choice-desc { display: block; margin-top: 3px; font-size: 14px; color: var(--ink-soft); letter-spacing: 0.02em; }
.choice-check {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--gold-line);
  color: transparent;
  font-size: 15px;
  font-weight: 700;
}
.choice-row.selected {
  border: 2px solid var(--jiang-hong);
  background: rgba(166, 58, 58, 0.06);
  box-shadow: 0 6px 18px rgba(166, 58, 58, 0.1);
  padding: calc(0.9rem - 1px) calc(1.1rem - 1px);
}
.choice-row.selected .choice-check { border-color: var(--jiang-hong); background: var(--jiang-hong); color: #fff; }

/* ── 問題輸入 ── */
.ask {
  width: 100%;
  resize: vertical;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.9;
  color: var(--ink);
  padding: 18px 20px;
  border-radius: 16px;
  border: 1px solid var(--gold-line);
  background: rgba(255, 255, 255, 0.85);
}
.ask:focus { outline: 2px solid rgba(166, 58, 58, 0.4); outline-offset: 2px; }
.ask-wrap { position: relative; border-radius: 16px; transition: box-shadow 0.3s ease; }
.ask-wrap.recording { box-shadow: 0 0 0 2px rgba(166, 58, 58, 0.35), 0 0 26px rgba(166, 58, 58, 0.16); }
.ask-wrap.recording .ask { border-color: rgba(166, 58, 58, 0.5); }

/* ── 語音輸入 ── */
.ask-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
}
.mic {
  appearance: none;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 22px 10px 16px;
  border: 1px solid var(--gold-line);
  border-radius: 999px;
  background: linear-gradient(150deg, rgba(255, 253, 248, 0.95), rgba(248, 238, 216, 0.9));
  color: var(--ink-soft);
  box-shadow: 0 6px 16px rgba(120, 90, 50, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.25s ease, color 0.25s ease;
}
.mic:hover { transform: translateY(-2px); border-color: var(--gold); color: var(--jiang-hong); }
.mic-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(212, 175, 55, 0.16);
}
.mic-icon svg { width: 16px; height: 16px; }
.mic-icon path { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.mic-icon path:first-child { fill: currentColor; stroke: none; }
.mic-label { font-size: 13px; letter-spacing: 0.2em; text-indent: 0.2em; }

/* 錄音中：轉為醬紅底＋跳動聲波 */
.mic.on {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  border-color: var(--jiang-hong-deep);
  color: var(--gold-soft);
  box-shadow: 0 10px 24px rgba(122, 38, 38, 0.28);
}
.mic.on:hover { color: var(--gold-soft); }
.mic.on .mic-icon { background: rgba(255, 246, 220, 0.2); }
.mic-wave { display: none; align-items: flex-end; gap: 3px; height: 18px; }
.mic.on .mic-wave { display: inline-flex; }
.mic-wave i {
  display: block;
  width: 3px;
  border-radius: 2px;
  background: var(--gold-soft);
  animation: wave 1s ease-in-out infinite;
}
.mic-wave i:nth-child(1) { height: 7px; animation-delay: 0s; }
.mic-wave i:nth-child(2) { height: 14px; animation-delay: 0.12s; }
.mic-wave i:nth-child(3) { height: 18px; animation-delay: 0.24s; }
.mic-wave i:nth-child(4) { height: 12px; animation-delay: 0.36s; }
.mic-wave i:nth-child(5) { height: 8px; animation-delay: 0.48s; }

.optional-note {
  display: block;
  margin-top: 6px;
  color: rgba(166, 58, 58, 0.75);
}
.dd-note {
  color: rgba(91, 70, 53, 0.55);
  font-size: 13px;
}
.speech-hint {
  margin: 10px 2px 0;
  font-size: 12.5px;
  line-height: 1.9;
  letter-spacing: 0.05em;
  color: rgba(91, 70, 53, 0.7);
}
.count { margin: 0; text-align: right; font-size: 12px; color: rgba(91, 70, 53, 0.55); }

/* ── 確認摘要 ── */
.summary { margin: 0; }
.summary > div {
  display: flex;
  gap: 14px;
  padding: 0.85rem 0.2rem;
  border-bottom: 1px dashed var(--gold-line);
  text-align: left;
}
.summary dt { flex: 0 0 5.6em; font-size: 15px; color: var(--ink-soft); line-height: 1.8; }
.summary dd { flex: 1; margin: 0; font-size: 17px; line-height: 1.8; color: var(--ink); word-break: break-word; }
.summary dd.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: var(--ink-soft); }

/* ── 按鈕 ── */
.row { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin-top: 26px; }
.btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 0.24em;
  text-indent: 0.24em;
  padding: 15px 36px;
  border-radius: 999px;
  transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
}
.btn.primary {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  color: var(--gold-soft);
  box-shadow: 0 12px 28px rgba(122, 38, 38, 0.28);
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.7);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--gold-line);
}
.btn:hover:not(:disabled) { transform: translateY(-2px); }
.btn:disabled { opacity: 0.55; cursor: default; }

/* ── 等待動畫：香煙裊裊 ── */
.waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 70px 20px;
  animation: rise-in 0.5s ease-out both;
}
.censer { width: 190px; height: auto; }
.censer .bowl { fill: #b8823a; }
.censer .rim { fill: #d9a94f; }
.censer .foot { fill: #a86f2c; }
.censer .base { fill: #c99340; }
.censer .ember { fill: rgba(212, 92, 60, 0.55); animation: ember 3.2s ease-in-out infinite; }
.censer .lotus path { fill: rgba(212, 175, 55, 0.5); }
.censer .smoke path {
  fill: none;
  stroke: rgba(150, 128, 104, 0.5);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 210;
  transform-origin: 120px 180px;
}
.censer .smoke .s1 { animation: smoke 4.2s ease-in-out infinite; }
.censer .smoke .s2 { animation: smoke 4.2s ease-in-out infinite 1.1s; opacity: 0.7; }
.censer .smoke .s3 { animation: smoke 4.2s ease-in-out infinite 2.2s; opacity: 0.7; }
.waiting-text { margin: 0; font-size: 15px; letter-spacing: 0.3em; text-indent: 0.3em; color: var(--ink-soft); }
.waiting-track {
  width: 180px;
  height: 2px;
  border-radius: 2px;
  background: rgba(212, 175, 55, 0.2);
  overflow: hidden;
}
.waiting-track i {
  display: block;
  width: 40%;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  animation: sweep 1.8s ease-in-out infinite;
}

.error {
  margin: 20px auto 0;
  max-width: 680px;
  padding: 14px 18px;
  border-radius: 12px;
  background: rgba(166, 58, 58, 0.08);
  border: 1px solid rgba(166, 58, 58, 0.28);
  font-size: 14px;
  line-height: 1.9;
  color: var(--jiang-hong-deep);
  text-align: center;
}

/* ── 動畫 ── */
@keyframes veil-out {
  from { opacity: 1; }
  to { opacity: 0; visibility: hidden; }
}
@keyframes rise-in {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes breathe {
  0%, 100% { opacity: 0.75; }
  50% { opacity: 1; }
}
@keyframes drift-a {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(6vw, -2vh, 0) scale(1.12); }
}
@keyframes drift-b {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1.08); }
  50% { transform: translate3d(-7vw, 3vh, 0) scale(0.95); }
}
@keyframes smoke {
  0% { stroke-dashoffset: 210; opacity: 0; transform: translateY(6px) scaleX(0.9); }
  20% { opacity: 0.75; }
  70% { opacity: 0.5; }
  100% { stroke-dashoffset: -60; opacity: 0; transform: translateY(-16px) scaleX(1.15); }
}
@keyframes ember {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.85; }
}
@keyframes sweep {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}

/* 觸控裝置不要留下卡住的 hover 效果 */
@media (hover: none) {
  .btn:hover, .mic:hover, .choice-row:hover, .link-btn:hover {
    transform: none;
  }
  .btn:active, .choice-row:active { transform: scale(0.99); }
}

@media (max-width: 640px) {
  /* 手機只留一層 14px 的邊界，內容才不會被三層 padding 擠成細長條 */
  .oracle-page {
    min-height: 100dvh;
    padding: 0 14px calc(28px + env(safe-area-inset-bottom));
  }
  /* 讀出瀏海與底部安全區，內容不會被系統列蓋住 */
  .oracle-bar {
    padding: calc(16px + env(safe-area-inset-top)) 0 8px;
    gap: 12px;
  }
  .oracle-main {
    max-width: none;
    margin: 0;
    padding: 10px 0 0;
  }
  .panel { padding: 26px 20px 24px; border-radius: 18px; }
  h2 { font-size: 24px; }
  .lede { font-size: 14px; line-height: 1.9; }

  /* 步驟列只留數字，但目前這一步把名稱顯示出來 */
  .steps { gap: 6px 10px; }
  .steps li span { display: none; }
  .steps li.on span {
    display: inline;
    font-size: 12px;
    letter-spacing: 0.08em;
  }

  /* 選項列加高，手指好按 */
  .choice-row { padding: 16px 16px; gap: 14px; }

  .ask { min-height: 150px; }
  .ask-tools { flex-wrap: wrap; gap: 10px; }
  .mic { padding: 12px 20px 12px 14px; }
  .mic-label { font-size: 12.5px; letter-spacing: 0.14em; text-indent: 0.14em; }

  /* 主要動作整排排下來，拇指好按；主要按鈕放最下面 */
  .row {
    flex-direction: column;
    gap: 10px;
    margin-top: 22px;
  }
  .btn {
    width: 100%;
    padding: 15px 24px;
  }
  .summary dd { font-size: 15px; }
}

@media (prefers-reduced-motion: reduce) {
  .enter-veil, .enter-mist { display: none; }
  .halo, .cloud, .censer .smoke path, .censer .ember, .waiting-track i, .panel, .waiting {
    animation: none !important;
  }
}
</style>
