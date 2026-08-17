<script setup lang="ts">
/* 查籤：/lookup
   跟求籤同一套精靈流程，只是抽籤那一段換成「你手上已經有籤號了」：
     第一步 籤號（或掃我們自己產的籤 QR）
     第二步 選方向
     第三步 說心事（可留白）→ 誠心送出
     過場   龍銜籤（與求籤同一段動畫）
     結果   籤紙 + 籤書解釋 + AI 解籤 + 可帶走的 QR

   送出時建立場次並帶上 fortune_number：後端會把這支籤釘在場次上、狀態直接是
   confirmed，所以不必走祈求→抽籤→擲筊就能解籤，也因此一定有 session id，
   QR 一律拿得到。AI 解籤是盡力而為——它慢（實測 ~21 秒）就先把籤詩與籤書解釋
   顯示出來，解籤回來再補進「神明指點」那一頁；真的失敗也只是少了那一段，
   籤詩、籤書解釋與 QR 都還在。 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toUserMessage } from '@/api/client'
import {
  createDivination,
  getFortuneByNumber,
  interpretFortune,
  listFortuneSets
} from '@/api/divinationApi'
import type { Category, Fortune, FortuneSet, Interpretation } from '@/types/divination'
import { useFontScale } from '@/utils/fontScale'
import { OFFLINE_MAX_NUMBER, offlineFortuneByNumber } from '@/utils/offlineFortunes'
import { fortuneShareUrl, makeQrDataUrl } from '@/utils/qr'
import { useSpeechInput } from '@/utils/speech'
import AmuletButton from '@/desktop/components/AmuletButton.vue'
import FontScaleControl from '@/desktop/components/FontScaleControl.vue'
import FortunePoem from '@/desktop/components/FortunePoem.vue'
import FortuneReading from '@/desktop/components/FortuneReading.vue'
import OracleTransition from '@/desktop/components/OracleTransition.vue'
import QrScanner from '@/desktop/components/QrScanner.vue'

const router = useRouter()
const { scaleStyle } = useFontScale()

const healthyIcon = new URL('../../assets/images/healthy.png', import.meta.url).href
const homeIcon = new URL('../../assets/images/home.png', import.meta.url).href
const moneyIcon = new URL('../../assets/images/money.png', import.meta.url).href
const wellnessIcon = new URL('../../assets/images/wellness.png', import.meta.url).href
const godOfWealthIcon = new URL('../../assets/images/god-of-wealth.png', import.meta.url).href

// 與求籤流程同一組方向與說明，解籤才會落在同一個語彙裡
const CATEGORIES: { value: Category; label: string; icon: string; hint: string }[] = [
  { value: 'health', label: '身體健康', icon: healthyIcon, hint: '身體、看病、平安' },
  { value: 'family', label: '家庭平安', icon: homeIcon, hint: '家人、子女、和睦' },
  { value: 'career', label: '工作錢財', icon: moneyIcon, hint: '工作、生意、財運' },
  { value: 'love', label: '感情姻緣', icon: wellnessIcon, hint: '感情、對象、緣分' },
  { value: 'other', label: '其他心事', icon: godOfWealthIcon, hint: '任何想問的事' }
]

const STEPS = ['籤號', '選方向', '說心事']
const QUESTION_MAX = 200
const DEFAULT_SET = 'SIXTY_JIAZI'
// 籤號上限跟離線備援表同一個來源，線上／離線的可查範圍才一致
const MAX_NUMBER = OFFLINE_MAX_NUMBER || 60

const step = ref(1)
const errorMessage = ref('')
const isLoading = ref(false)
/* 這一支籤是從離線備援表來的（後端連不上）。
   離線時籤詩照樣看得到，但 AI 解籤與可帶走的 QR 都需要伺服器，會明白講。 */
const isOffline = ref(false)

/* ── 第一步：籤號 ──
   v-model 綁在 <input type="number"> 上時，Vue 會自動幫值套上 number 轉型，
   所以這裡拿到的可能是數字、也可能是空字串，解析要能吃兩種。 */
const numberInput = ref<string | number>('')
const fortune = ref<Fortune | null>(null)
const fortuneSetCode = ref(DEFAULT_SET)
const fortuneSetName = ref('')

const parsedNumber = computed(() => {
  const raw = String(numberInput.value ?? '').trim()
  if (!raw) return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 && value <= MAX_NUMBER ? value : null
})

/* 籤系用預設那一組；取不到就用 SIXTY_JIAZI，不讓查籤被這一步卡住。 */
async function resolveFortuneSet() {
  if (fortuneSetName.value) return
  try {
    const sets: FortuneSet[] = await listFortuneSets()
    const chosen = sets.find((item) => item.is_default) ?? sets[0]
    if (chosen) {
      fortuneSetCode.value = chosen.code
      fortuneSetName.value = chosen.name
    }
  } catch {
    fortuneSetCode.value = DEFAULT_SET
  }
}

/* 籤號在第一步就真的去查一次：號碼不存在要現在講，
   不要讓人把方向與問題都填完了才發現查不到。 */
async function confirmNumber() {
  const number = parsedNumber.value
  if (number === null) {
    errorMessage.value = `請輸入 1 到 ${MAX_NUMBER} 之間的籤號。`
    return
  }
  errorMessage.value = ''
  isLoading.value = true
  try {
    await resolveFortuneSet()
    fortune.value = await getFortuneByNumber(fortuneSetCode.value, number)
    isOffline.value = false
    step.value = 2
  } catch (error) {
    /* 連不上伺服器就改用本地那份 60 首籤詩表——沒有網路也要查得到籤。
       但如果是「這個籤號不存在」這種正常的 404，就照實說，不要拿別的資料頂替。 */
    const local = offlineFortuneByNumber(number)
    if (local && !isNotFound(error)) {
      fortune.value = local
      isOffline.value = true
      step.value = 2
    } else {
      fortune.value = null
      errorMessage.value = toUserMessage(error)
    }
  } finally {
    isLoading.value = false
  }
}

/* 404 是「查無此籤號」，那是真的要告訴使用者的錯；
   其他（斷網、逾時、5xx）才走離線備援。 */
function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404
}

// ── 第二步：方向 ──
const category = ref<Category | null>(null)
const chosen = computed(() => CATEGORIES.find((item) => item.value === category.value) ?? null)

function chooseCategory(value: Category) {
  errorMessage.value = ''
  category.value = value
}

// ── 第三步：說心事（可留白，跟求籤流程一致）──
const question = ref('')
const hasTypedQuestion = computed(() => question.value.trim().length > 0)
const askedQuestion = computed(() => {
  const typed = question.value.trim()
  return typed || `想請示關於${chosen.value?.label ?? '心中'}的事`
})

/* 用說的：與求籤流程共用同一套語音輸入（見 utils/speech）。
   語音辨識靠雲端，離線時會以連線錯誤收場——那時打字或直接留白送出都行。 */
const {
  supported: speechSupported,
  isRecording,
  hint: speechHint,
  stop: stopRecording,
  toggle: toggleRecording
} = useSpeechInput({
  get: () => question.value,
  set: (value) => { question.value = value },
  maxLength: QUESTION_MAX
})

function goStep(next: number) {
  if (isRecording.value) stopRecording()
  errorMessage.value = ''
  step.value = next
}

// ── 結果 ──
/* 領籤過場（龍銜籤）：跟求籤同一段動畫，在籤詩掀出來之前跑一次。 */
const transitionEl = ref<InstanceType<typeof OracleTransition> | null>(null)
const interpretation = ref<Interpretation | null>(null)
const waitingInterpretation = ref(false)
const aiNote = ref('')
const shareUrl = ref('')
const qrDataUrl = ref('')

/* 送出：先建場次（快，拿到 session id 就有 QR），接著跑領籤過場，
   AI 解籤在過場期間於背景跑——那 5 秒剛好拿來等它，揭曉時多半已經備好；
   還沒回來也不擋，籤詩先出，解籤回來再補進分頁。 */
async function submit() {
  const f = fortune.value
  const picked = category.value
  if (!f || !picked) return
  errorMessage.value = ''
  aiNote.value = ''
  /* 離線：籤詩與籤書解釋都在本地，直接掀結果頁。
     AI 解籤與 QR 都要伺服器，這裡明白講一句，不要讓人以為壞了。 */
  if (isOffline.value) {
    aiNote.value = '目前沒有連線，以下是本地籤詩與籤書上的解釋。AI 解籤與可帶走的 QR 需要連上伺服器，恢復連線後再送出一次就有。'
    // 離線也要有過場：影片載不到時引擎會自動退成墨染，一樣有東西看
    await revealWithTransition()
    return
  }
  isLoading.value = true
  try {
    const session = await createDivination({
      fortune_set_code: fortuneSetCode.value,
      question: askedQuestion.value,
      category: picked,
      categories: [picked],
      interaction_mode: 'click',
      anonymous_user_id: '',
      fortune_number: f.number
    })
    /* QR 與 AI 解籤在過場開始前就發出去，讓那 5 秒的動畫時間拿去等它們，
       揭曉的時候籤詩（多半連解籤）已經備好。 */
    void buildShareQr(session.session_id)
    void askAi(session.session_id)
    await revealWithTransition()
  } catch (error) {
    /* 送出的這一刻才斷線：籤詩已經查到了，還是把結果頁給他，
       只是少了 AI 解籤與 QR。 */
    isOffline.value = true
    aiNote.value = `${toUserMessage(error)} 以下先為你顯示籤詩與籤書上的解釋。`
    await revealWithTransition()
  } finally {
    isLoading.value = false
  }
}

/* 跑完過場才把結果頁換上。過場元件在揭曉點（影片尾聲／墨染蓋滿）resolve，
   所以畫面切換剛好落在動畫的那一格上，不會看到中間的空白。 */
async function revealWithTransition() {
  await transitionEl.value?.play()
  step.value = 4
}

async function buildShareQr(sessionId: string) {
  shareUrl.value = fortuneShareUrl(sessionId)
  try {
    qrDataUrl.value = await makeQrDataUrl(shareUrl.value, 300)
  } catch {
    qrDataUrl.value = '' // 產不出圖就只顯示網址，不擋畫面
  }
}

/* 有 AI 就問 AI。沒有（本機沒開模型、服務暫時掛掉）就明講一句，
   籤詩與籤書解釋照樣看得到。 */
async function askAi(sessionId: string) {
  waitingInterpretation.value = true
  try {
    const result = await interpretFortune(sessionId)
    interpretation.value = result.interpretation ?? null
    if (result.fortune && fortune.value) fortune.value = { ...fortune.value, ...result.fortune }
    if (!interpretation.value) aiNote.value = 'AI 解籤這次沒有回內容，以下是籤書上的解釋。'
  } catch {
    aiNote.value = 'AI 解籤暫時無法使用，以下先為你顯示籤詩與籤書上的解釋；這支籤的紀錄已經留著，稍後掃 QR 再看就會補上。'
  } finally {
    waitingInterpretation.value = false
  }
}

function restart() {
  step.value = 1
  numberInput.value = ''
  fortune.value = null
  category.value = null
  question.value = ''
  interpretation.value = null
  waitingInterpretation.value = false
  aiNote.value = ''
  shareUrl.value = ''
  qrDataUrl.value = ''
  errorMessage.value = ''
}

/* ── 籤書上的解釋 ──
   這是籤書資料（跟 AI 解籤是兩回事），依所選方向排在最前面。 */
const MEANING_LABELS: { key: keyof Fortune; label: string; category?: Category }[] = [
  { key: 'general_meaning', label: '一般' },
  { key: 'health_meaning', label: '身體健康', category: 'health' },
  { key: 'family_meaning', label: '家庭平安', category: 'family' },
  { key: 'career_meaning', label: '工作錢財', category: 'career' },
  { key: 'love_meaning', label: '感情姻緣', category: 'love' },
  { key: 'study_meaning', label: '功名學業', category: 'study' },
  { key: 'wealth_meaning', label: '財運投資', category: 'wealth' },
  { key: 'relationship_meaning', label: '人際關係', category: 'relationship' },
  { key: 'travel_meaning', label: '出行遠遊', category: 'travel' }
]

const bookMeanings = computed(() => {
  const f = fortune.value
  if (!f) return []
  const list = MEANING_LABELS.map((item) => ({
    label: item.label,
    text: String(f[item.key] ?? '').trim(),
    mine: item.category !== undefined && item.category === category.value
  })).filter((item) => item.text)
  // 自己問的那個方向排前面
  return [...list.filter((item) => item.mine), ...list.filter((item) => !item.mine)]
})
const openMeaning = ref('')
const shownMeaning = computed(
  () => bookMeanings.value.find((item) => item.label === openMeaning.value) ?? bookMeanings.value[0] ?? null
)

/* ── 掃 QR（第一步的另一個入口）── */
const scanOpen = ref(false)
const scannerEl = ref<InstanceType<typeof QrScanner> | null>(null)
const scanNote = ref('')

async function openScanner() {
  scanOpen.value = true
  scanNote.value = ''
  errorMessage.value = ''
  await Promise.resolve() // 等元件掛上再開相機
  scannerEl.value?.start({ facingMode: 'environment' })
}

function closeScanner() {
  scannerEl.value?.stop()
  scanOpen.value = false
}

/* 從 QR 內容裡認出「本站的籤」。
   接受三種寫法：完整網址（任何網域，只看路徑）、/fortune/<id> 這樣的路徑、
   以及只有一組 UUID 的裸字串——實體籤上若只印 id，掃了照樣認得。 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function sessionIdFromQr(text: string): string | null {
  const trimmed = text.trim()
  const pathMatch = trimmed.match(/\/fortune\/([^/?#\s]+)/i)
  if (pathMatch) return pathMatch[1]
  if (UUID.test(trimmed) && trimmed.replace(UUID, '').trim() === '') return trimmed
  return null
}

function onDecoded(text: string) {
  const sessionId = sessionIdFromQr(text)
  if (!sessionId) {
    scanNote.value = '這張 QR 不是本站的籤，請掃籤詩頁上那一張，或直接輸入籤號。'
    scannerEl.value?.start({ facingMode: 'environment' }) // 讓人可以馬上再掃
    return
  }
  router.push(`/fortune/${sessionId}`)
}

function onScanError(message: string) {
  scanNote.value = message
}

onBeforeUnmount(() => scannerEl.value?.stop())
</script>

<template>
  <div class="lookup-page" :style="scaleStyle">
    <div class="sky" aria-hidden="true"></div>
    <div class="godlight" aria-hidden="true"></div>

    <!-- 領籤過場：送出之後、籤詩掀出來之前跑一次（與求籤同一段龍動畫） -->
    <OracleTransition ref="transitionEl" />

    <!-- 字級：每一步都能調（籤詩以外的說明文字也一起放大），固定在右上角 -->
    <FontScaleControl />

    <header class="bar">
      <button class="link-btn" type="button" @click="router.push('/')">← 回首頁</button>
      <!-- 步驟列自己一行：右上角留給字級控制，兩者不會擠在一起 -->
      <ol v-if="step < 4" class="steps">
        <li v-for="(name, index) in STEPS" :key="name" :class="{ on: step === index + 1, done: step > index + 1 }">
          <i>{{ index + 1 }}</i><span>{{ name }}</span>
        </li>
      </ol>
    </header>

    <main class="wrap">
      <!-- 第一步：籤號（或掃 QR） -->
      <section v-if="step === 1" class="panel">
        <p class="kicker">第 一 步</p>
        <h1>手上這支籤是第幾號？</h1>
        <p class="lede">
          輸入籤號就能查籤詩，接著可以請神明依你的處境解這支籤。
          <span class="note">如果拿到的是我們的籤詩 QR，直接掃更快。</span>
        </p>

        <template v-if="!scanOpen">
          <label class="field">
            <span class="field-label">籤 號</span>
            <input
              v-model="numberInput"
              class="no-input"
              type="number"
              inputmode="numeric"
              :min="1"
              :max="MAX_NUMBER"
              :placeholder="`1 - ${MAX_NUMBER}`"
              @keyup.enter="confirmNumber"
            />
          </label>
          <div class="row">
            <button class="btn ghost" type="button" @click="openScanner">掃 QR 取 籤</button>
            <button class="btn primary" type="button" :disabled="isLoading || parsedNumber === null" @click="confirmNumber">
              {{ isLoading ? '查 籤 中…' : '下 一 步' }}
            </button>
          </div>
        </template>

        <template v-else>
          <QrScanner ref="scannerEl" @decoded="onDecoded" @error="onScanError" />
          <p v-if="scanNote" class="scan-note">{{ scanNote }}</p>
          <p class="scan-help">籤詩頁上那張「把這支籤帶走」的 QR 就是。掃到會直接打開那一支籤。</p>
          <div class="row">
            <button class="btn ghost" type="button" @click="closeScanner">改 用 輸 入 籤 號</button>
          </div>
        </template>
      </section>

      <!-- 第二步：選方向 -->
      <section v-else-if="step === 2" class="panel">
        <p class="kicker">第 二 步 · 第 {{ fortune?.number }} 籤</p>
        <p v-if="isOffline" class="offline-note">
          目前連不上伺服器，這支籤來自機器內建的籤詩資料，籤詩與籤書解釋都能看；AI 解籤要等恢復連線。
        </p>
        <h1>想請示哪一方面？</h1>
        <p class="lede">先讓神明知道你要問的方向，解籤才會落在心坎上。</p>
        <div class="choice-list">
          <button
            v-for="item in CATEGORIES"
            :key="item.value"
            class="choice-row"
            :class="{ selected: category === item.value }"
            type="button"
            @click="chooseCategory(item.value)"
          >
            <img class="choice-icon" :src="item.icon" alt="" aria-hidden="true" />
            <span class="choice-text">
              <span class="choice-label">{{ item.label }}</span>
              <span class="choice-desc">{{ item.hint }}</span>
            </span>
            <span class="choice-check" aria-hidden="true">✓</span>
          </button>
        </div>
        <div class="row">
          <button class="btn ghost" type="button" @click="goStep(1)">上一步</button>
          <button class="btn primary" type="button" :disabled="!category" @click="goStep(3)">下 一 步</button>
        </div>
      </section>

      <!-- 第三步：說心事 -->
      <section v-else-if="step === 3" class="panel">
        <p class="kicker">第 三 步 · {{ chosen?.label }}</p>
        <h1>想跟神明說什麼？</h1>
        <p class="lede">
          像在神明面前稟告一樣，說清楚人、事、時間，解籤會更貼近你的處境。
          <span class="note">不想打字也沒關係，直接送出，神明會依你選的方向指點。</span>
        </p>
        <textarea
          v-model="question"
          class="ask"
          :class="{ recording: isRecording }"
          rows="5"
          :maxlength="QUESTION_MAX"
          placeholder="例：我在考慮下個月換工作，想請示這個決定是否合適？　（可留白，或按下面的麥克風用說的）"
        ></textarea>
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

        <dl class="summary">
          <div>
            <dt>籤號</dt>
            <dd>第 {{ fortune?.number }} 籤<span v-if="fortune?.fortune_level"> · {{ fortune.fortune_level }}</span></dd>
          </div>
          <div>
            <dt>所問方向</dt>
            <dd><img class="chosen-icon" :src="chosen?.icon" alt="" /> {{ chosen?.label }}</dd>
          </div>
        </dl>

        <div class="row">
          <button class="btn ghost" type="button" @click="goStep(2)">上一步</button>
          <button class="btn primary" type="button" :disabled="isLoading" @click="submit">
            {{ isLoading ? '送 出 中…' : hasTypedQuestion ? '誠 心 送 出' : '略 過 直 接 送 出' }}
          </button>
        </div>
      </section>

      <!-- 結果 -->
      <section v-else-if="fortune" class="panel result">
        <p class="kicker">神 明 回 應 · {{ fortuneSetName || '六十甲子籤' }}</p>

        <div class="paper">
          <FortunePoem
            :poem="fortune.poem"
            :number="fortune.number"
            :ganzhi="fortune.ganzhi"
            :title="fortune.title"
          />
        </div>

        <p v-if="aiNote" class="ai-note">{{ aiNote }}</p>

        <!-- 白話、典故、AI 解籤：分頁，一次讀一段 -->
        <FortuneReading
          :translation="fortune.translation"
          :explanation="fortune.story"
          :interpretation="interpretation"
          :pending="waitingInterpretation"
        />

        <!-- 籤書的各方向解釋：自己問的那個方向排最前面 -->
        <div v-if="bookMeanings.length" class="book">
          <p class="book-title">籤 書 解 釋</p>
          <div class="book-list">
            <button
              v-for="item in bookMeanings"
              :key="item.label"
              class="book-item"
              :class="{ on: shownMeaning?.label === item.label }"
              type="button"
              @click="openMeaning = item.label"
            >
              {{ item.label }}
            </button>
          </div>
          <p v-if="shownMeaning" class="book-text">{{ shownMeaning.text }}</p>
        </div>

        <!-- 帶走：線上查籤會留下紀錄，所以給得出 QR；
             離線時沒有場次可帶走，整塊就不出現（上面的 aiNote 已經說明原因）。 -->
        <div v-if="shareUrl" class="take-away">
          <div class="qr-frame">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="掃描以在手機上開啟這支籤" width="110" height="110" />
            <div v-else class="qr-fallback">QR 產生中…</div>
          </div>
          <div class="take-away-text">
            <h4>現 在 用 手 機 帶 走</h4>
            <p>用手機掃描，推開廟門就能收下這支籤。想留成圖片的話，下面的平安符也帶著同一個連結。</p>
            <p v-if="shareUrl" class="share-url">{{ shareUrl }}</p>
          </div>
        </div>

        <dl class="summary">
          <div>
            <dt>要問的事</dt>
            <dd>
              {{ askedQuestion }}
              <span v-if="!hasTypedQuestion" class="dd-note">（未填寫，以所選方向請示）</span>
            </dd>
          </div>
        </dl>

        <!-- 平安符：符面依這一支籤而不同（吉凶配色、印文、雲紋、八卦），可下載帶走 -->
        <div class="row amulet-row">
          <AmuletButton
            :data="{
              number: fortune.number,
              ganzhi: fortune.ganzhi,
              level: fortune.fortune_level,
              poem: fortune.poem,
              note: fortune.translation || fortune.general_meaning,
              shareUrl: shareUrl || null
            }"
          />
        </div>

        <div class="row">
          <button class="btn ghost" type="button" @click="restart">查 別 支 籤</button>
          <button class="btn primary" type="button" @click="router.push('/oracle')">我 要 求 籤</button>
        </div>
      </section>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </main>
  </div>
</template>

<style scoped>
.lookup-page {
  --jiang-hong: #a63a3a;
  --jiang-hong-deep: #7a2626;
  --gold: #d4af37;
  --gold-soft: #f2e2b3;
  --gold-line: rgba(212, 175, 55, 0.42);
  --ink: #3a2c22;
  --ink-soft: #5b4635;

  position: relative;
  min-height: 100dvh;
  padding: 0 16px calc(40px + env(safe-area-inset-bottom));
  color: var(--ink);
  font-family: 'Noto Serif TC', serif;
  overflow-x: hidden;
}

.sky {
  position: fixed;
  inset: 0;
  z-index: -2;
  background:
    radial-gradient(120% 60% at 50% 10%, rgba(255, 252, 242, 0.95) 0%, rgba(255, 244, 214, 0.7) 30%, rgba(255, 255, 255, 0) 66%),
    linear-gradient(180deg, #b9d3d8 0%, #cfe0dc 20%, #e6e0cd 44%, #f4e6cc 64%, #fbf6ea 100%);
}
.godlight {
  position: fixed;
  left: 50%;
  top: 0;
  z-index: -1;
  width: 150vw;
  height: 70vh;
  margin-left: -75vw;
  background: radial-gradient(45% 40% at 50% 18%, rgba(255, 240, 198, 0.85), rgba(255, 236, 186, 0.28) 46%, rgba(255, 255, 255, 0) 74%);
}

/* ── 頂部與步驟列（與求籤流程同一套語彙）── */
.bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: 640px;
  margin: 0 auto;
  /* 右邊留出字級按鈕的位置，回首頁與步驟列都不會被它壓到 */
  padding: calc(14px + env(safe-area-inset-top)) 96px 8px 0;
}
.link-btn {
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 6px 2px;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.14em;
  color: var(--ink-soft);
}
.link-btn:hover { color: var(--jiang-hong); }

.steps {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin: 0;
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

.wrap { max-width: 640px; margin: 0 auto; }
.panel {
  padding: 28px 22px 24px;
  border: 1px solid var(--gold-line);
  border-radius: 20px;
  background: rgba(255, 253, 247, 0.86);
  box-shadow: 0 20px 46px rgba(120, 90, 50, 0.14);
  backdrop-filter: blur(8px);
  animation: rise-in 0.45s ease-out both;
}
.kicker {
  margin: 0 0 12px;
  font-size: 11.5px;
  letter-spacing: 0.4em;
  text-indent: 0.4em;
  color: var(--gold);
}
.panel h1 {
  margin: 0 0 10px;
  font-size: clamp(21px, 4.6vw, 27px);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--jiang-hong-deep);
}
.lede {
  margin: 0 0 22px;
  font-size: calc(13.5px * var(--fs, 1));
  line-height: 1.95;
  color: rgba(91, 70, 53, 0.85);
}
.note {
  display: block;
  margin-top: 6px;
  color: rgba(166, 58, 58, 0.75);
}

/* 第一步：籤號 */
.field { display: grid; gap: 8px; margin-bottom: 6px; }
.field-label {
  font-size: 12px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  color: var(--ink-soft);
}
.no-input {
  width: 100%;
  padding: 15px 16px;
  border: 1px solid var(--gold-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  font-family: inherit;
  font-size: 24px;
  letter-spacing: 0.14em;
  text-align: center;
  color: var(--jiang-hong-deep);
}
.no-input:focus { outline: 2px solid rgba(212, 175, 55, 0.5); outline-offset: 1px; }

.scan-note {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(166, 58, 58, 0.08);
  border: 1px solid rgba(166, 58, 58, 0.24);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--jiang-hong-deep);
}
.scan-help {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.8;
  color: rgba(91, 70, 53, 0.65);
}

/* 第二步：方向（沿用求籤流程的大圖示清單） */
.choice-list { display: grid; gap: 10px; }
.choice-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 78px;
  padding: 0.85rem 1rem;
  border: 1px solid var(--gold-line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.66);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}
.choice-row.selected {
  border-color: var(--jiang-hong);
  background: rgba(166, 58, 58, 0.08);
}
.choice-icon { flex: 0 0 auto; width: 44px; height: 44px; object-fit: contain; }
.choice-text { flex: 1; min-width: 0; }
.choice-label {
  display: block;
  font-size: calc(17px * var(--fs, 1));
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
}
.choice-desc {
  display: block;
  margin-top: 3px;
  font-size: calc(13px * var(--fs, 1));
  color: var(--ink-soft);
}
.choice-check {
  flex: 0 0 auto;
  opacity: 0;
  color: var(--jiang-hong);
  font-size: 18px;
}
.choice-row.selected .choice-check { opacity: 1; }

/* 第三步：說心事 */
.ask {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--gold-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  font-family: inherit;
  font-size: calc(14.5px * var(--fs, 1));
  line-height: 1.95;
  color: var(--ink);
  resize: vertical;
}
/* 「用說的」：與求籤流程同一套視覺 */
.ask.recording { border-color: var(--jiang-hong); box-shadow: 0 0 0 3px rgba(166, 58, 58, 0.12); }
.ask-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}
.mic {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  appearance: none;
  cursor: pointer;
  min-height: 44px;
  padding: 10px 18px 10px 13px;
  border: 1px solid var(--gold-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
  font-family: inherit;
  color: var(--ink-soft);
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.mic.on {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  border-color: transparent;
  color: #f7e7bd;
}
.mic-icon svg {
  width: 18px;
  height: 18px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.mic-icon svg path:first-child { fill: currentColor; stroke: none; }
.mic-wave { display: none; align-items: center; gap: 2px; height: 14px; }
.mic.on .mic-wave { display: inline-flex; }
.mic-wave i {
  width: 2px;
  height: 100%;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.7;
  animation: mic-wave 1s ease-in-out infinite;
}
.mic-wave i:nth-child(2) { animation-delay: 0.12s; }
.mic-wave i:nth-child(3) { animation-delay: 0.24s; }
.mic-wave i:nth-child(4) { animation-delay: 0.36s; }
.mic-wave i:nth-child(5) { animation-delay: 0.48s; }
.mic-label { font-size: 12.5px; letter-spacing: 0.14em; text-indent: 0.14em; }
.speech-hint {
  margin: 10px 2px 0;
  font-size: calc(12.5px * var(--fs, 1));
  line-height: 1.85;
  color: rgba(91, 70, 53, 0.72);
}
.count { margin: 0 0 0 auto; text-align: right; font-size: 12px; color: rgba(91, 70, 53, 0.55); }

/* 離線提示 */
.offline-note {
  margin: 0 0 16px;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(166, 58, 58, 0.08);
  border: 1px solid rgba(166, 58, 58, 0.24);
  font-size: calc(12.5px * var(--fs, 1));
  line-height: 1.85;
  color: var(--ink-soft);
}

@keyframes mic-wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

.summary { margin: 18px 0 0; }
.summary > div {
  display: flex;
  gap: 14px;
  padding: 0.7rem 0.2rem;
  border-bottom: 1px dashed var(--gold-line);
}
.summary dt {
  flex: 0 0 5em;
  font-size: calc(13px * var(--fs, 1));
  color: var(--ink-soft);
  line-height: 1.8;
}
.summary dd {
  flex: 1;
  margin: 0;
  font-size: calc(14.5px * var(--fs, 1));
  line-height: 1.8;
  color: var(--ink);
  word-break: break-word;
}
.dd-note { color: rgba(91, 70, 53, 0.55); font-size: calc(12.5px * var(--fs, 1)); }
.chosen-icon { width: 18px; height: 18px; object-fit: contain; vertical-align: -3px; margin-right: 2px; }

/* 結果 */
.paper {
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 12px 30px rgba(120, 90, 50, 0.14);
}
.ai-note {
  margin: 16px 0 0;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(212, 175, 55, 0.12);
  border: 1px solid rgba(212, 175, 55, 0.35);
  font-size: calc(12.5px * var(--fs, 1));
  line-height: 1.85;
  color: var(--ink-soft);
}

.book { margin-top: 22px; }
.book-title {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: var(--jiang-hong);
}
.book-list { display: flex; flex-wrap: wrap; gap: 6px; }
.book-item {
  appearance: none;
  cursor: pointer;
  padding: 8px 13px;
  border: 1px solid var(--gold-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  font-family: inherit;
  font-size: calc(12.5px * var(--fs, 1));
  color: var(--ink-soft);
}
.book-item.on {
  background: rgba(212, 175, 55, 0.2);
  border-color: var(--gold);
  color: var(--jiang-hong-deep);
}
.book-text {
  margin: 12px 2px 0;
  font-size: calc(14px * var(--fs, 1));
  line-height: 2;
  color: var(--ink-soft);
}

.take-away {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 22px;
  padding: 14px;
  border: 1px dashed var(--gold-line);
  border-radius: 16px;
  background: rgba(255, 252, 240, 0.7);
}
.qr-frame {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 98px;
  height: 98px;
  padding: 6px;
  border-radius: 12px;
  background: #fffdf6;
  box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.45);
}
.qr-frame img { width: 100%; height: 100%; display: block; }
.qr-fallback { font-size: 11px; letter-spacing: 0.08em; color: rgba(91, 70, 53, 0.5); text-align: center; }
.take-away-text { min-width: 0; }
.take-away-text h4 {
  margin: 0 0 6px;
  font-size: calc(12.5px * var(--fs, 1));
  letter-spacing: 0.2em;
  color: var(--jiang-hong);
}
.take-away-text p {
  margin: 0;
  font-size: calc(12.5px * var(--fs, 1));
  line-height: 1.85;
  color: var(--ink-soft);
}
.share-url {
  margin-top: 6px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px !important;
  word-break: break-all;
  color: rgba(91, 70, 53, 0.55) !important;
}

.error {
  margin: 16px auto 0;
  max-width: 640px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(166, 58, 58, 0.08);
  border: 1px solid rgba(166, 58, 58, 0.26);
  font-size: 13px;
  line-height: 1.85;
  color: var(--jiang-hong-deep);
  text-align: center;
}

.row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
/* 平安符自己一列，置中、不拉滿——它是附加的紀念品，不是主要動作 */
.amulet-row { margin-top: 18px; justify-content: center; }
.btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  flex: 1;
  min-width: 140px;
  min-height: 48px;
  padding: 13px 20px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13.5px;
  letter-spacing: 0.2em;
  text-indent: 0.2em;
  transition: transform 0.2s ease;
}
.btn.primary {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  color: var(--gold-soft);
  box-shadow: 0 12px 26px rgba(122, 38, 38, 0.26);
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.7);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--gold-line);
}
.btn:disabled { opacity: 0.55; cursor: default; }
.btn:hover:not(:disabled) { transform: translateY(-1px); }

@keyframes rise-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 640px) {
  .steps li span { display: none; }
  .steps li.on span { display: inline; font-size: 12px; }
  .row { flex-direction: column; }
  .btn { width: 100%; }
}

@media (hover: none) {
  .btn:hover, .choice-row:hover { transform: none; }
  .btn:active:not(:disabled), .choice-row:active { transform: scale(0.99); }
}
@media (prefers-reduced-motion: reduce) {
  .panel { animation: none; }
}
</style>
