<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Category } from '@/types/divination'
import { useFontScale } from '@/utils/fontScale'
import { useSpeechInput } from '@/utils/speech'
import { fortuneShareUrl, makeQrDataUrl } from '@/utils/qr'
import AmuletButton from '@/desktop/components/AmuletButton.vue'
import FontScaleControl from '@/desktop/components/FontScaleControl.vue'
import FortunePoem from '@/desktop/components/FortunePoem.vue'
import FortuneReading from '@/desktop/components/FortuneReading.vue'
// 註冊 <temple-ar-oracle>（插香 → 搖籤 → 擲筊 的 AR 引擎）
import '@/ar/temple-ar-oracle/index.js'
import { sendWhenReady } from '@/live2d/websocketService'
import { useLive2DCompanionStore } from '@/stores/live2dCompanionStore'

const router = useRouter()
// 籤詩字級由右上角控制，設定跨頁共用（見 utils/fontScale）
const { scaleStyle } = useFontScale()

// 第一～三步（選方向／說心事／確認送出）共用的地面背景
const groundSrc = new URL('../../assets/images/ground2.webp', import.meta.url).href

const healthyIcon = new URL('../../assets/images/healthy.webp', import.meta.url).href
const homeIcon = new URL('../../assets/images/home.webp', import.meta.url).href
const moneyIcon = new URL('../../assets/images/money.webp', import.meta.url).href
const wellnessIcon = new URL('../../assets/images/wellness.webp', import.meta.url).href
const godOfWealthIcon = new URL('../../assets/images/god-of-wealth.webp', import.meta.url).href

// 沿用舊版（v17）的五個方向與說明文案
/* arLabel 是傳給 AR 引擎的分類名稱。引擎內部的 CATEGORY_API_MAP 只認得它自己那份
   中文對照表，這裡的顯示名稱（身體健康／家庭平安…）不在表內，若直接傳過去會全部
   被歸成 other，所以另外標一組引擎看得懂的值。 */
const CATEGORIES: { value: Category; label: string; icon: string; hint: string; arLabel: string }[] = [
  { value: 'health', label: '身體健康', icon: healthyIcon, hint: '身體、看病、平安', arLabel: '健康平安' },
  { value: 'family', label: '家庭平安', icon: homeIcon, hint: '家人、子女、和睦', arLabel: '家庭生活' },
  { value: 'career', label: '工作錢財', icon: moneyIcon, hint: '工作、生意、財運', arLabel: '工作事業' },
  { value: 'love', label: '感情姻緣', icon: wellnessIcon, hint: '感情、對象、緣分', arLabel: '感情婚姻' },
  { value: 'other', label: '其他心事', icon: godOfWealthIcon, hint: '任何想問的事', arLabel: '綜合運勢' }
]

const STEPS = ['選方向', '說心事', '確認送出']
const QUESTION_MAX = 200

const step = ref(1)
const category = ref<Category | null>(null)
const question = ref('')
const errorMessage = ref('')
const loadingLabel = ref('')
/* AR 儀式（插香 → 搖籤 → 擲筊）的狀態。場次由 AR 引擎自己建立，
   所以這裡不再另外呼叫 createDivination，避免同一次求籤開出兩個場次。 */
interface ArFortune { no: number; ganzhi: string; grade: string; poem: string; explain: string; modern: string }
interface ArInterpretation {
  overall_meaning?: string
  relation_to_question?: string
  suggested_actions?: string[]
  warnings?: string[]
  offline?: boolean
}
interface TempleArOracleEl extends HTMLElement {
  start(options: { question?: string; category?: string; inputMode?: string }): Promise<void>
  destroy(): void
}

const arEl = ref<TempleArOracleEl | null>(null)
const arNotice = ref('')
const isOffline = ref(false)
const fortune = ref<ArFortune | null>(null)
const interpretation = ref<ArInterpretation | null>(null)

// Live2D 小夥伴現在是掛在 App.vue 的全站浮動元件（見 Live2DCompanionWidget.vue），
// 這裡只留籤詩相關的記憶邏輯，開合狀態改由 live2dCompanionStore 全域管理。
const companionStore = useLive2DCompanionStore()

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
/* 語音輸入與查籤共用同一套實作（見 utils/speech），
   兩邊的支援判斷、錯誤訊息、離線時的說法都一致。 */
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

onMounted(() => {
  // 雲霧散盡後把整層移除，之後就不再佔用繪圖資源
  mistTimer = window.setTimeout(() => (showEnterMist.value = false), 900)
})

onBeforeUnmount(() => {
  if (mistTimer) window.clearTimeout(mistTimer)
  setBodyLock(false)
  unbindAr()
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

/* ── AR 儀式事件 ──
   引擎會把整段儀式跑完，最後用 sequence-complete 把籤詩與解籤丟出來。
   後端連不上時引擎會自動改用離線籤詩，一樣會走到 sequence-complete，
   所以這裡不需要為了離線寫第二套流程。 */
function onArToast(event: Event) {
  const detail = (event as CustomEvent<{ message?: string }>).detail
  if (detail?.message) arNotice.value = detail.message
}

function onArOffline(event: Event) {
  const detail = (event as CustomEvent<{ message?: string }>).detail
  isOffline.value = true
  if (detail?.message) arNotice.value = detail.message
}

function setBodyLock(on: boolean) {
  document.body.classList.toggle('ar-ritual-open', on)
}

/* 籤詩結果頁的 QR：掃了會開 /fortune/<sessionId>，
   在手機上先推廟門、再顯示這一支籤。 */
const shareUrl = ref('')
const qrDataUrl = ref('')

/* 離線模式時引擎會自己捏一個 offline-<timestamp> 的編號，後端查無此筆，
   照樣產 QR 只會得到一個掃了永遠載不到的死連結，所以這種情況不給 QR。 */
const canShare = ref(false)

async function buildShareQr(id: string) {
  canShare.value = Boolean(id) && !id.startsWith('offline-')
  if (!canShare.value) return
  shareUrl.value = fortuneShareUrl(id)
  try {
    qrDataUrl.value = await makeQrDataUrl(shareUrl.value, 320)
  } catch {
    qrDataUrl.value = '' // 產不出來就只顯示網址，不擋畫面
  }
}

/* 解籤比過場慢得多（實測 ~21 秒），所以籤詩會先出，
   等這個事件回來再把 AI 解籤填進畫面。 */
const waitingInterpretation = ref(false)

function onArInterpretation(event: Event) {
  const detail = (event as CustomEvent<{ interpretation?: ArInterpretation; fortune?: ArFortune; offline?: boolean }>).detail
  if (detail?.fortune) fortune.value = detail.fortune
  if (detail?.interpretation) interpretation.value = detail.interpretation
  isOffline.value = Boolean(detail?.offline)
  waitingInterpretation.value = false
}

/* 把「使用者問了什麼」+「抽到的籤跟解籤結果」組成一段文字，讓角色靜靜記住（不是拿來念的）。
   兩件事都要放進去，缺一不可：只放解籤結果，角色答得出籤詩意思，但答不出「你剛才問的
   是什麼」；只放問題，角色答得出方向，但答不出籤詩本身的內容。之後每一輪追問都是接著
   這個當下的籤詩+問題延續，不是每次都當成全新、無關的對話重新開始。 */
function buildFortuneContext(fortune: ArFortune | null, interpretation: ArInterpretation | null): string {
  const parts: string[] = []
  parts.push(`使用者剛才求籤時問的是：「${askedQuestion.value}」。`)
  if (fortune) {
    parts.push(`抽到第 ${fortune.no} 籤${fortune.grade ? `，${fortune.grade}` : ''}。`)
  }
  if (interpretation?.overall_meaning) parts.push(interpretation.overall_meaning)
  if (interpretation?.relation_to_question) parts.push(interpretation.relation_to_question)
  if (interpretation?.suggested_actions?.length) {
    parts.push(`建議你：${interpretation.suggested_actions.join('，')}。`)
  }
  if (interpretation?.warnings?.length) {
    parts.push(`要留意的是：${interpretation.warnings.join('，')}。`)
  }
  return parts.join(' ').trim()
}

/* 通用招呼語已經搬進 live2dCompanionStore（小夥伴變全站元件後不再是籤詩頁專屬）。
   這裡只負責：小夥伴已經打過招呼、且這輪籤詩解籤資料到齊時，把內容悄悄寫進角色記憶——
   不管使用者是先開小夥伴才抽完籤，還是抽完籤才開小夥伴，兩種順序都會觸發到一次。 */
watch(
  () => [companionStore.hasGreeted, interpretation.value] as const,
  ([greeted]) => {
    if (!greeted) return
    const context = buildFortuneContext(fortune.value, interpretation.value)
    if (context) sendWhenReady({ type: 'remember-context', text: context })
  }
)

function onArComplete(event: Event) {
  const detail = (event as CustomEvent<{ sessionId?: string; fortune?: ArFortune; interpretation?: ArInterpretation }>).detail
  fortune.value = detail?.fortune ?? null
  interpretation.value = detail?.interpretation ?? null
  waitingInterpretation.value = !detail?.interpretation
  if (detail?.interpretation?.offline) isOffline.value = true
  setBodyLock(false)
  step.value = 5
  void buildShareQr(detail?.sessionId ?? '')

  // 一進解籤頁面就先唸籤詩本身（原文），不是等 AI 解籤——解籤通常還要再等 ~21 秒
  // 才會透過 onArInterpretation 補進來，籤詩原文這時候已經有了，先讓角色唸給使用者聽。
  if (fortune.value?.poem) {
    sendWhenReady({ type: 'speak-text', text: fortune.value.poem })
  }
}

/* ── 儀式進行中，小夥伴主動彈出來講解每個階段 ──
   <temple-ar-oracle> 其實會發 8 種事件，這裡另外接的 3 個（input-mode-resolved／
   incense-complete／draw-complete）原本沒人在聽，正好是「進燒香」「進抽籤」
   「進擲筊」這三個階段轉換點。文案依 input-mode-resolved 給的模式分桌面／手機：
   camera（桌面鏡頭手勢）才會經過燒香，motion（手機搖動）跟 manual（桌面鏡頭
   失敗退成點擊）都直接跳過燒香、從抽籤開始。 */
type ArInputMode = 'camera' | 'motion' | 'manual'
let resolvedInputMode: ArInputMode | null = null
let ritualDismissed = false

watch(
  () => companionStore.isVisible,
  (visible, wasVisible) => {
    if (!visible && wasVisible) ritualDismissed = true
  }
)

function guideRitualStage(text: string) {
  if (ritualDismissed) return
  companionStore.open()
  sendWhenReady({ type: 'speak-text', text })
}

function drawInstruction(mode: ArInputMode | null): string {
  return mode === 'motion'
    ? '接下來搖一搖手機，就可以抽籤囉。'
    : '搖一搖籤筒，或是直接點擊籤條，就可以抽出籤囉。'
}

function bwaInstruction(mode: ArInputMode | null): string {
  return mode === 'motion'
    ? '接下來點擊螢幕，就可以擲筊囉。'
    : '把雙手捧著筊杯，然後向上拋出去。'
}

function onArInputModeResolved(event: Event) {
  const mode = (event as CustomEvent<{ mode?: ArInputMode }>).detail?.mode ?? null
  resolvedInputMode = mode
  if (mode === 'camera') {
    guideRitualStage('接下來要把雙手合十，誠心地說出你是誰，然後在心裡祈福拜拜。')
  } else {
    // motion／manual 都會跳過燒香，直接進抽籤
    guideRitualStage(drawInstruction(mode))
  }
}

function onArIncenseComplete() {
  guideRitualStage(drawInstruction('camera'))
}

function onArDrawComplete() {
  guideRitualStage(bwaInstruction(resolvedInputMode))
}

function bindAr(el: TempleArOracleEl) {
  el.addEventListener('toast', onArToast)
  el.addEventListener('offline', onArOffline)
  el.addEventListener('sequence-complete', onArComplete)
  // 解籤晚於過場才回來，補發的事件也要接
  el.addEventListener('interpretation-ready', onArInterpretation)
  el.addEventListener('input-mode-resolved', onArInputModeResolved)
  el.addEventListener('incense-complete', onArIncenseComplete)
  el.addEventListener('draw-complete', onArDrawComplete)
}

function unbindAr() {
  const el = arEl.value
  if (!el) return
  el.removeEventListener('toast', onArToast)
  el.removeEventListener('offline', onArOffline)
  el.removeEventListener('sequence-complete', onArComplete)
  el.removeEventListener('interpretation-ready', onArInterpretation)
  el.removeEventListener('input-mode-resolved', onArInputModeResolved)
  el.removeEventListener('incense-complete', onArIncenseComplete)
  el.removeEventListener('draw-complete', onArDrawComplete)
  try { el.destroy() } catch { /* 元件可能已卸載 */ }
}

// 收集完成 → 進入 AR 儀式
let isSubmitting = false

async function submit() {
  /* isBusy 目前恆為 false（loadingLabel 從未被賦值，見上面 99 行），單靠它擋不住
     連點——button 從 DOM 移除是等 Vue 下一輪渲染，兩次 click 事件仍可能在那之前
     都進到這裡，各自呼叫一次 api.create()。isSubmitting 是同步旗標，在事件迴圈
     的下一輪渲染前就先擋下第二次呼叫。 */
  if (isSubmitting || isBusy.value) return
  isSubmitting = true
  try {
    errorMessage.value = ''
    arNotice.value = ''
    resolvedInputMode = null
    ritualDismissed = false
    /* 注意：不能在這裡設 loadingLabel。等待動畫是 v-if="isBusy" 的獨立區塊，
       一旦 isBusy 為真，step 4 的面板整個不會被渲染，arEl 就拿不到元素。 */
    step.value = 4
    await nextTick()
    const el = arEl.value
    if (!el) {
      errorMessage.value = '無法載入求籤場景，請重新整理頁面再試一次。'
      return
    }
    bindAr(el)
    setBodyLock(true)
    try {
      /* 手機（含把視窗縮窄的桌機）一律用搖的；桌機維持 auto，
         會先試鏡頭手勢，失敗才降級成點擊。 */
      const useShake = window.matchMedia('(max-width: 640px)').matches
      await el.start({
        question: askedQuestion.value,
        category: chosen.value?.arLabel ?? '綜合運勢',
        inputMode: useShake ? 'motion' : 'auto'
      })
    } catch (error) {
      // 引擎本身已對後端錯誤做離線降級，這裡只處理連引擎都起不來的情況
      errorMessage.value = error instanceof Error ? error.message : '無法開始求籤，請稍後再試。'
    }
  } finally {
    isSubmitting = false
  }
}

function quitRitual() {
  setBodyLock(false)
  unbindAr()
  arEl.value = null
  arNotice.value = ''
  step.value = 3
}

function restart() {
  unbindAr()
  fortune.value = null
  interpretation.value = null
  isOffline.value = false
  arNotice.value = ''
  step.value = 1
  category.value = null
  question.value = ''
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

    <!-- 地面背景：只在前三步（選方向／說心事／確認送出）出現，
         AR 儀式（第四步）跟看籤結果（第五步）各自有自己的畫面，不需要這層 -->
    <div
      v-if="step <= 3"
      class="oracle-ground"
      :style="{ backgroundImage: `url(${groundSrc})` }"
      aria-hidden="true"
    ></div>

    <!-- 籤詩字級：只在看籤的那一步出現，免得跟步驟列擠在同一個角落 -->
    <FontScaleControl v-if="step === 5" />

    <header class="oracle-bar">
      <button class="link-btn" type="button" @click="router.push('/')">← 回首頁</button>
      <ol v-if="step < 5" class="steps">
        <li v-for="(name, index) in STEPS" :key="name" :class="{ on: step === index + 1, done: step > index + 1 }">
          <i>{{ index + 1 }}</i><span>{{ name }}</span>
        </li>
      </ol>
    </header>

    <main class="oracle-main" :class="{ wide: step === 5 }">
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
      <section v-else-if="step === 1" class="panel intro">
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
            <img class="choice-icon" :src="item.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" />
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
      <section v-else-if="step === 2" class="panel confide">
        <p class="kicker">第 二 步 </p>
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
      <section v-else-if="step === 3" class="panel confide">
        <p class="kicker">第 三 步</p>
        <h2>確認要向神明請示的內容</h2>
        <p class="lede">再看一次，確定沒問題就誠心送出。</p>
        <!-- 掃碼把籤帶走 -->

        <dl class="summary">
          <div>
            <dt>所問方向</dt>
            <dd class="chosen-value"><img class="chosen-icon lit" :src="chosen?.icon" alt="" /> {{ chosen?.label }}</dd>
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

      <!-- 步驟四：AR 儀式。引擎內部是 position:fixed 的整頁設計，
           必須掛在 body 底下全螢幕，放進面板會被 backdrop-filter 的
           containing block 困住（筊杯與提示框會錯位跑到面板外）。 -->
      <section v-else-if="step === 4" class="panel center">
        <p class="kicker">第 四 步 · {{ chosen?.label }}</p>
        <h2>儀式進行中</h2>
        <p class="lede">請在全螢幕畫面中完成合十、搖籤與擲筊。</p>
      </section>

      <!-- 步驟五：籤詩與解籤。
           籤詩自己一欄（逐字落下），白話與解籤收進右欄的分頁——
           解籤動輒好幾百字，全部貼成一長條沒有人會讀完。 -->
      <section v-else class="panel result" :style="scaleStyle">
        <p class="kicker">第 五 步 · 神 明 回 應</p>
        <p v-if="isOffline" class="ar-notice offline">
          目前連不上伺服器，以下是離線的預設籤詩與解說；恢復連線後可重新求籤取得 AI 解籤。
        </p>

        <div class="result-grid">
          <!-- 左：這支籤本身 -->
          <div v-if="fortune" class="fortune-paper">
            <FortunePoem
              variant="paper"
              :poem="fortune.poem"
              :number="fortune.no"
              :ganzhi="fortune.ganzhi"
            />
          </div>

          <!-- 右：讀的部分 -->
          <div class="result-side">
            <FortuneReading
              :translation="fortune?.explain"
              :explanation="fortune?.modern"
              :interpretation="interpretation"
              :pending="waitingInterpretation"
            />

            <div v-if="canShare" class="take-away">
              <div class="qr-frame">
                <img v-if="qrDataUrl" :src="qrDataUrl" alt="掃描以在手機上開啟這支籤" width="150" height="150" />
                <div v-else class="qr-fallback">QR 產生中…</div>
              </div>
              <div class="take-away-text">
                <h4>現 在 用 手 機 帶 走</h4>
                <p>用手機掃描，推開廟門就能收下這支籤。想留成圖片的話，下面的平安符也帶著同一個連結。</p>
                <p v-if="shareUrl" class="share-url">{{ shareUrl }}</p>
              </div>
            </div>

            <p v-else class="take-away-offline">
              這次是離線籤詩，沒有留下線上紀錄，暫時無法用 QR 帶走；連線恢復後重新求籤即可。
            </p>

            <!-- 平安符：符面依這一支籤而不同，可下載帶走 -->
            <div v-if="fortune" class="amulet-row">
              <AmuletButton
                :data="{
                  number: fortune.no,
                  ganzhi: fortune.ganzhi,
                  level: fortune.grade,
                  poem: fortune.poem,
                  note: fortune.modern || fortune.explain,
                  shareUrl: canShare ? shareUrl : null
                }"
              />
            </div>

            <dl class="summary compact">
              <div>
                <dt>所問方向</dt>
                <dd><img class="chosen-icon" :src="chosen?.icon" alt="" /> {{ chosen?.label }}</dd>
              </div>
              <div>
                <dt>要問的事</dt>
                <dd>
                  {{ askedQuestion }}
                  <span v-if="!hasTypedQuestion" class="dd-note">（未填寫，以所選方向請示）</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="row">
          <button class="btn ghost" type="button" @click="restart">再問一題</button>
          <button class="btn primary" type="button" @click="router.push('/')">回 首 頁</button>
        </div>
      </section>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </main>

    <!-- AR 儀式全螢幕層 -->
    <Teleport to="body">
      <div v-if="step === 4" class="ar-fullscreen">
        <temple-ar-oracle ref="arEl" api-base="/api/v1" transition-src="/videos/dragon.mp4"></temple-ar-oracle>
        <p v-if="arNotice" class="ar-toast">{{ arNotice }}</p>
        <button class="ar-exit" type="button" @click="quitRitual">離開儀式</button>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* AR 儀式全螢幕層：Teleport 到 body，所以這段不能是 scoped。
   引擎根節點本身是 position:fixed，這層只負責背景、離開鈕與層級。 */
body.ar-ritual-open { overflow: hidden; }

.ar-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: #120d0a;
}
.ar-fullscreen temple-ar-oracle {
  display: block;
  width: 100%;
  height: 100%;
  --gold: #d4af37;
  --jiang-hong: #a63a3a;
  --ink: #3a2c22;
}
.ar-exit {
  position: fixed;
  top: calc(14px + env(safe-area-inset-top));
  right: 14px;
  z-index: 80;
  padding: 9px 18px;
  border: 1px solid rgba(212, 175, 55, 0.5);
  border-radius: 999px;
  background: rgba(24, 14, 10, 0.72);
  color: #f2e2b3;
  font-family: 'Noto Serif TC', serif;
  font-size: 13px;
  letter-spacing: 0.16em;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.ar-toast {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom));
  z-index: 80;
  transform: translateX(-50%);
  max-width: min(88vw, 460px);
  margin: 0;
  padding: 11px 18px;
  border-radius: 999px;
  background: rgba(24, 14, 10, 0.82);
  border: 1px solid rgba(212, 175, 55, 0.4);
  color: #f2e2b3;
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
  backdrop-filter: blur(6px);
}
</style>

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

/* 地面背景：貼底鋪滿寬度，蓋在雲霧背景之上、內容面板之下 */
.oracle-ground {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background-repeat: no-repeat;
  background-position: center bottom;
  background-size: 100% auto;
}

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
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
  padding: 6px 2px;
}
.link-btn:hover { color: var(--jiang-hong); }

.steps {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin: 0 0 0 auto;
  padding: 0;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(91, 70, 53, 0.75);
}
.steps i {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--gold-line);
  font-style: normal;
  font-size: 15px;
  font-weight: 700;
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
/* 看籤那一步要放得下兩欄 */
.oracle-main.wide { max-width: 1060px; }
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
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.36em;
  text-indent: 0.36em;
  color: #b8860b;
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

/* 步驟一（開場白）／步驟二（說心事）／步驟三（確認送出）共用同一套
   開場排版：第 X 步／標題／說明，三句都置中，標題走思源宋體粗體，
   跟其他步驟的左對齊版面區隔出來。 */
.panel.intro .kicker, .panel.intro h2, .panel.intro .lede,
.panel.confide .kicker, .panel.confide h2, .panel.confide .lede {
  text-align: center;
}
/* kicker 保留原本的寬字距（「第　一　步」牌匾感不能拿掉），
   但置中時最後一個字後面那份字距一樣會把整行往左推半份寬度，
   跟已經真置中的 h2 對不齊；用 text-indent 補回一半字距抵銷掉，
   兩行字才會疊在同一條中線上。 */
.panel.intro .kicker, .panel.confide .kicker {
  font-size: 20px;
  font-weight: 900;
  text-indent: 0.18em;
}
.panel.intro h2, .panel.confide h2 {
  font-family: 'Noto Serif TC', serif;
  font-size: clamp(28px, 4.4vw, 40px);
  font-weight: 900;
  /* letter-spacing 在置中文字的最後一個字後面也會多留一份間距，
     等於整段字往左偏了半份間距的寬度才是「幾何置中」；蓋掉它，
     字才會真的對齊在框的正中間，不會看起來偏向一邊。 */
  letter-spacing: 0;
}
/* 「今天想請示哪一方面？」十個字是偶數，幾何正中心會落在
   第5字「示」跟第6字「哪」的中間縫，不會剛好對到單一個字上；
   往右推半個字寬，「示」的中心才會疊到「第一步」裡「一」的中心。
   這個微調是照這句字數量身算的，步驟二標題字數不同，不套用。 */
.panel.intro h2 { text-indent: 0.65em; }

/* ── 分類：沿用舊版的大圖示清單 ── */
/* 桌機橫著排：由左而右、換行往下，不要一路往下堆成細長條。
   grid-auto-rows: 1fr 讓每一列等高，最後單獨一張也維持同樣的矩形尺寸
   （不讓它跨欄撐成兩倍寬）。 */
.choice-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
}
.choice-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  height: 100%;
  min-height: 82px;
  /* 上下內距縮小，把省下來的空間讓給 icon，卡片本身的框（min-height／
     border／圓角／底色）都沒有變動，只有裡面比較擠一點。 */
  padding: 0.35rem 1.1rem;
  border-radius: 16px;
  border: 1px solid var(--gold-line);
  background: #fffdf8;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.choice-row:hover { border-color: rgba(166, 58, 58, 0.45); }
.choice-icon { flex: 0 0 auto; width: 68px; height: 68px; object-fit: contain; }
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
.mic-label { font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-indent: 0.2em; }

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

.ar-notice {
  margin: 12px 0 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(212, 175, 55, 0.14);
  border: 1px solid var(--gold-line);
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-soft);
}
.ar-notice.offline { background: rgba(166, 58, 58, 0.1); border-color: rgba(166, 58, 58, 0.3); }

/* ── 籤詩與解籤 ──
   看籤這一步比前面幾步寬：左邊掛籤紙、右邊讀解籤，兩欄並排才不會變成
   要一直往下捲的長條。 */
.panel.result { max-width: none; }
.result-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.86fr) minmax(0, 1.14fr);
  gap: 28px;
  align-items: start;
  margin-top: 18px;
}
/* 籤紙：像掛起來的一張紙 */
.fortune-paper {
  position: relative;
  border-radius: 16px;
  border: 1px solid var(--gold-line);
  background:
    linear-gradient(180deg, rgba(255, 252, 240, 0.95), rgba(253, 246, 230, 0.9)),
    rgba(255, 252, 244, 0.75);
  box-shadow: 0 16px 34px rgba(120, 90, 50, 0.14);
  overflow: hidden;
}
/* 紙上的紅邊，籤紙的老樣子 */
.fortune-paper::before {
  content: '';
  position: absolute;
  inset: 7px;
  border: 1px solid rgba(166, 58, 58, 0.22);
  border-radius: 10px;
  pointer-events: none;
}
.result-side { min-width: 0; }

/* ── 把籤帶走（QR）──
   原本這塊沒有任何樣式，QR 跟說明字就這樣裸貼在頁面上。 */
.take-away {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 22px;
  padding: 16px;
  border-radius: 16px;
  border: 1px dashed var(--gold-line);
  background: rgba(255, 252, 240, 0.7);
}
.qr-frame {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 118px;
  height: 118px;
  padding: 7px;
  border-radius: 12px;
  background: #fffdf6;
  box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.45), 0 8px 18px rgba(120, 90, 50, 0.12);
}
.qr-frame img { width: 100%; height: 100%; display: block; }
.qr-fallback { font-size: 11.5px; letter-spacing: 0.1em; color: rgba(91, 70, 53, 0.55); text-align: center; }
.take-away-text { min-width: 0; }
.take-away-text h4 {
  margin: 0 0 6px;
  font-size: calc(13px * var(--fs, 1));
  letter-spacing: 0.2em;
  color: var(--jiang-hong);
}
.take-away-text p {
  margin: 0;
  font-size: calc(13px * var(--fs, 1));
  line-height: 1.9;
  color: var(--ink-soft);
}
.share-url {
  margin-top: 6px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px !important;
  word-break: break-all;
  color: rgba(91, 70, 53, 0.55) !important;
}
.take-away-offline {
  margin: 22px 0 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(166, 58, 58, 0.07);
  border: 1px solid rgba(166, 58, 58, 0.22);
  font-size: calc(13px * var(--fs, 1));
  line-height: 1.9;
  color: var(--ink-soft);
}

/* 平安符按鈕：跟 QR 同一個「帶走」的區塊，置中、不拉滿 */
.amulet-row { margin-top: 14px; display: flex; justify-content: center; }

/* 這一次問了什麼：收成小字附註，不跟籤詩搶注意力 */
.summary.compact { margin-top: 18px; }
.summary.compact > div { padding: 0.6rem 0.2rem; }
.summary.compact dt { flex: 0 0 4.8em; font-size: calc(12.5px * var(--fs, 1)); }
.summary.compact dd { font-size: calc(13.5px * var(--fs, 1)); color: var(--ink-soft); }

.optional-note {
  display: block;
  margin-top: 6px;
  font-weight: 700;
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
.chosen-icon { width: 20px; height: 20px; object-fit: contain; vertical-align: -4px; margin-right: 2px; }
/* 所問方向：這是使用者選的那個方向，要像點燈一樣亮出來，
   跟「要問的事」那種純文字輸入區隔開，一眼就知道是自己選的選項。 */
.chosen-value {
  font-weight: 700;
  color: var(--jiang-hong-deep);
  text-shadow: 0 0 10px rgba(255, 189, 92, 0.55), 0 0 22px rgba(255, 189, 92, 0.3);
}
.chosen-icon.lit {
  width: 24px;
  height: 24px;
  filter: brightness(1.18) saturate(1.25) drop-shadow(0 0 7px rgba(255, 189, 92, 0.75));
}

/* ── 按鈕 ── */
.row { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin-top: 26px; }
.btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  padding: 17px 40px;
  border-radius: 999px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
.btn.primary {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  color: var(--gold-soft);
  box-shadow:
    0 5px 0 #5a1f1f,
    0 12px 28px rgba(122, 38, 38, 0.28);
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.7);
  color: var(--ink);
  box-shadow:
    inset 0 0 0 1px var(--gold-line),
    0 5px 0 rgba(120, 90, 50, 0.28),
    0 10px 22px rgba(120, 90, 50, 0.14);
}
.btn:hover:not(:disabled) { transform: translateY(-2px); }
.btn.primary:hover:not(:disabled) {
  box-shadow:
    0 7px 0 #5a1f1f,
    0 16px 34px rgba(122, 38, 38, 0.32);
}
.btn.ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.9);
  box-shadow:
    inset 0 0 0 1px var(--gold-line),
    0 7px 0 rgba(120, 90, 50, 0.32),
    0 14px 28px rgba(120, 90, 50, 0.18);
}
.btn:active:not(:disabled) {
  transform: translateY(3px);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.btn.primary:active:not(:disabled) {
  box-shadow:
    0 1px 0 #5a1f1f,
    0 4px 10px rgba(122, 38, 38, 0.24);
}
.btn.ghost:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 0 0 1px var(--gold-line),
    0 1px 0 rgba(120, 90, 50, 0.28),
    0 4px 10px rgba(120, 90, 50, 0.12);
}
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

  /* 窄視窗放不下兩欄，收回單欄 */
  .choice-list { grid-template-columns: 1fr; grid-auto-rows: auto; }
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

  /* 看籤：手機一欄，籤紙在上、解籤在下 */
  .result-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}

/* 平板寬度就已經放不下兩欄的籤紙，提早收成一欄 */
@media (max-width: 900px) {
  .result-grid { grid-template-columns: 1fr; gap: 20px; }
  .take-away { gap: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .enter-veil, .enter-mist { display: none; }
  .halo, .cloud, .censer .smoke path, .censer .ember, .waiting-track i, .panel, .waiting {
    animation: none !important;
  }
}
</style>
