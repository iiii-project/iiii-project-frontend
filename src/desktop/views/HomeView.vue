<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

interface Mote {
  left: string
  top: string
  size: string
  dur: string
  delay: string
  dx: string
  peak: string
}

const router = useRouter()
const motes = ref<Mote[]>([])

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 金色光點：隨機生成，讓仙氣有顆粒感
function buildMotes() {
  const count = window.matchMedia('(max-width: 640px)').matches ? 26 : 46
  motes.value = Array.from({ length: count }, () => {
    const size = 2 + Math.random() * 5
    return {
      left: `${Math.random() * 100}%`,
      top: `${70 + Math.random() * 40}%`,
      size: `${size}px`,
      dur: `${16 + Math.random() * 26}s`,
      delay: `${-Math.random() * 40}s`,
      dx: `${(Math.random() - 0.5) * 160}px`,
      peak: `${0.35 + Math.random() * 0.55}`
    }
  })
}

// 滑鼠視差：雲霧、遠山與文字微幅錯位，加深景深
let raf = 0
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0

function onPointerMove(event: PointerEvent) {
  targetX = (event.clientX / window.innerWidth - 0.5) * 2
  targetY = (event.clientY / window.innerHeight - 0.5) * 2
  if (!raf) raf = requestAnimationFrame(step)
}

function step() {
  currentX += (targetX - currentX) * 0.06
  currentY += (targetY - currentY) * 0.06
  const root = document.documentElement
  root.style.setProperty('--px', currentX.toFixed(4))
  root.style.setProperty('--py', currentY.toFixed(4))
  raf =
    Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001
      ? requestAnimationFrame(step)
      : 0
}

// 玉皇大帝：去背後的插畫，取代原本的手繪 SVG
const jadeEmperorSrc = new URL('../../assets/images/jade-emperor.png', import.meta.url).href

// 入殿音效：實際錄好的廟宇音檔，點擊當下才播（瀏覽器要有使用者手勢才允許）
const ascendSoundUrl = new URL('../../assets/audio/temple-ascend.m4a', import.meta.url).href
let ascendSound: HTMLAudioElement | null = null

function primeAscendSound() {
  if (ascendSound) return
  ascendSound = new Audio(ascendSoundUrl)
  ascendSound.preload = 'auto'
  ascendSound.volume = 0.9
  ascendSound.load()
}

/* 音檔開頭有 1.5 秒的環境音空白，撞擊聲從 1.534 秒才進來。
   從 (撞擊點 − 預捲 − 畫面撞擊時間) 開始播，聲音的那一下就會正好砸在字被震碎的那一格。
   直接在點擊當下播放，不用計時器，才不會被瀏覽器的自動播放政策擋掉。 */
const AUDIO_IMPACT = 1.5 // 音檔裡撞擊聲的位置（秒）
const AUDIO_PREROLL = 0.04 // 保留一點起音，避免被切掉
const IMPACT_AT = 0.32 // 畫面上字被震碎的時間（秒）

function playAscendChime() {
  try {
    primeAscendSound()
    if (!ascendSound) return
    ascendSound.currentTime = Math.max(0, AUDIO_IMPACT - AUDIO_PREROLL - IMPACT_AT)
    // 換頁後音檔仍會播完，尾韻才不會被切斷
    void ascendSound.play().catch(() => undefined)
  } catch {
    // 音效失敗不影響轉場
  }
}

const TITLE_CHARS = ['籤', '好', '運']

// 入殿轉場用的霧絮：自中心朝四方捲開，角度均分再各自帶點偏移
const ascendPuffs = Array.from({ length: 12 }, (_, index) => {
  const angle = index * 30 + (index % 5) * 9
  return {
    id: index,
    angle: `${angle}deg`,
    dist: `${26 + (index % 6) * 8}vmax`,
    spin: `${(index % 2 ? 1 : -1) * (70 + (index % 5) * 26)}deg`,
    size: `${260 + (index % 5) * 110}px`,
    // 等玉皇大帝散去之後，雲霧才捲上來
    delay: `${1.22 + (index % 8) * 0.045}s`,
    dur: `${1 + (index % 5) * 0.13}s`,
    // 內層自己翻騰的速度，讓霧看起來一直在動
    churn: `${2.4 + (index % 6) * 0.5}s`
  }
})

// 入殿：玉皇大帝自雲霧中放大、光芒佔滿畫面後才換頁
const isAscending = ref(false)
let ascendTimer = 0

function enterHall() {
  if (isAscending.value) return
  isAscending.value = true
  playAscendChime()
  if (prefersReducedMotion()) {
    router.push('/oracle')
    return
  }
  // 0.32s 撞破標題（與音檔撞擊聲同格） → 1.5s 玉皇大帝散去 → 1.22s 雲霧捲上 → 2.35s 換頁
  ascendTimer = window.setTimeout(() => router.push('/oracle'), 2350)
}

function go(path: string) {
  router.push(path)
}

// 教學影片
const showTutorial = ref(false)
const tutorialVideo = ref<HTMLVideoElement | null>(null)

function openTutorial() {
  showTutorial.value = true
  void nextTick(() => {
    const video = tutorialVideo.value
    if (!video) return
    video.currentTime = 0
    void video.play().catch(() => undefined)
  })
}

function closeTutorial() {
  tutorialVideo.value?.pause()
  showTutorial.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showTutorial.value) closeTutorial()
}

onMounted(() => {
  document.body.classList.add('celestial-home-open')
  buildMotes()
  primeAscendSound() // 先把音檔載好，按下去才不會有延遲
  window.addEventListener('keydown', onKeydown)
  if (!prefersReducedMotion()) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('celestial-home-open')
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('keydown', onKeydown)
  if (raf) cancelAnimationFrame(raf)
  if (ascendTimer) clearTimeout(ascendTimer)
  const root = document.documentElement
  root.style.removeProperty('--px')
  root.style.removeProperty('--py')
})
</script>

<template>
  <div class="celestial-home" :class="{ 'is-ascending': isAscending }">
    <!-- ============ SVG 素材庫 ============ -->
    <svg width="0" height="0" class="asset-defs" aria-hidden="true">
      <defs>
        <linearGradient id="gRobe" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f6e4bd" />
          <stop offset="45%" stop-color="#e0b96a" />
          <stop offset="100%" stop-color="#b3592f" />
        </linearGradient>
        <linearGradient id="gRobe2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff3dc" />
          <stop offset="50%" stop-color="#d9a94f" />
          <stop offset="100%" stop-color="#a63a3a" />
        </linearGradient>
        <linearGradient id="gRibbon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(212,175,55,0)" />
          <stop offset="35%" stop-color="rgba(212,175,55,0.85)" />
          <stop offset="100%" stop-color="rgba(166,58,58,0.9)" />
        </linearGradient>
        <radialGradient id="gHalo">
          <stop offset="0%" stop-color="rgba(255,246,214,0.9)" />
          <stop offset="62%" stop-color="rgba(240,205,120,0.45)" />
          <stop offset="100%" stop-color="rgba(240,205,120,0)" />
        </radialGradient>
        <linearGradient id="gCloudFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.96)" />
          <stop offset="100%" stop-color="rgba(250,235,205,0.68)" />
        </linearGradient>
        <linearGradient id="gMountain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8fa9ad" />
          <stop offset="100%" stop-color="#c3d0cb" />
        </linearGradient>
        <!-- 祥雲（如意雲頭） -->
        <symbol id="ruyi" viewBox="0 0 300 120">
          <path
            d="M14,104 C-6,92 -3,62 20,56 C18,34 40,20 60,29 C68,10 96,6 110,22
               C124,4 154,6 164,26 C182,12 210,20 214,42 C240,34 264,52 258,76
               C254,94 236,106 216,104 Z"
            fill="url(#gCloudFill)"
          />
          <path
            d="M20,56 C26,44 42,40 52,48 C58,53 58,62 51,65 C45,68 38,64 39,58"
            fill="none" stroke="rgba(212,175,55,0.55)" stroke-width="3" stroke-linecap="round"
          />
          <path
            d="M214,42 C222,30 240,30 248,40 C254,48 251,58 243,60 C236,62 230,57 232,50"
            fill="none" stroke="rgba(212,175,55,0.55)" stroke-width="3" stroke-linecap="round"
          />
          <path
            d="M110,22 C120,14 136,16 142,26 C147,34 143,44 134,45 C127,46 122,41 124,35"
            fill="none" stroke="rgba(212,175,55,0.4)" stroke-width="3" stroke-linecap="round"
          />
          <path
            d="M14,104 C60,110 92,96 130,98 C170,100 194,110 216,104"
            fill="none" stroke="rgba(212,175,55,0.5)" stroke-width="2.5" stroke-linecap="round"
          />
        </symbol>

        <!-- 飛天：持蓮飛舞，長帛帶曳於身後 -->
        <symbol id="apsara" viewBox="0 0 360 200">
          <g class="sway">
            <path d="M6,146 C58,150 96,132 126,116" fill="none" stroke="url(#gRibbon)" stroke-width="5" stroke-linecap="round" opacity="0.75" />
            <path d="M0,118 C48,104 84,110 122,98" fill="none" stroke="url(#gRibbon)" stroke-width="7" stroke-linecap="round" opacity="0.9" />
            <path d="M18,86 C64,72 98,86 128,82" fill="none" stroke="url(#gRibbon)" stroke-width="4.5" stroke-linecap="round" opacity="0.6" />
          </g>
          <!-- 曳地長裙，末端收成飄尾 -->
          <path
            d="M256,92 C252,112 236,130 212,142 C186,154 152,156 122,150
               C100,146 80,150 62,162 C74,138 100,126 128,126
               C154,126 178,120 194,106 C208,94 214,84 216,74 Z"
            fill="url(#gRobe)"
          />
          <!-- 曲膝後掠的腿 -->
          <path d="M238,116 C218,132 194,140 170,140" fill="none" stroke="#eccb90" stroke-width="11" stroke-linecap="round" />
          <path d="M170,140 C160,142 152,146 146,152" fill="none" stroke="#f3ddb8" stroke-width="8" stroke-linecap="round" />
          <!-- 斜傾的軀幹 -->
          <path
            d="M272,56 C286,62 288,78 278,90 C268,102 252,110 240,114
               C228,116 221,107 224,97 C229,83 250,62 262,55 Z"
            fill="url(#gRobe2)"
          />
          <!-- 後臂 -->
          <path d="M256,80 C242,76 228,74 214,76" fill="none" stroke="#eccb90" stroke-width="7.5" stroke-linecap="round" />
          <!-- 前伸手臂與蓮花 -->
          <path d="M270,66 C288,58 302,52 314,50" fill="none" stroke="#eccb90" stroke-width="8.5" stroke-linecap="round" />
          <g>
            <path d="M322,38 C328,44 328,52 322,57 C316,52 316,44 322,38 Z" fill="#e79a9a" />
            <path d="M308,50 C316,45 323,47 325,54 C317,59 310,57 308,50 Z" fill="#d97f7f" />
            <path d="M336,50 C328,45 321,47 319,54 C327,59 334,57 336,50 Z" fill="#d97f7f" />
            <circle cx="322" cy="54" r="5" fill="#f6e2b6" />
          </g>
          <!-- 頸與頭 -->
          <path d="M268,50 L276,60" stroke="#f3ddb8" stroke-width="7" stroke-linecap="round" />
          <circle cx="270" cy="40" r="27" fill="url(#gHalo)" />
          <circle cx="270" cy="40" r="21" fill="none" stroke="rgba(212,175,55,0.7)" stroke-width="1.4" />
          <ellipse cx="270" cy="40" rx="11.5" ry="13.5" fill="#f3ddb8" transform="rotate(12 270 40)" />
          <path d="M259,36 C260,23 279,20 283,30 C285,37 281,41 275,39 C268,37 262,39 259,36 Z" fill="#6c4326" />
          <circle cx="271" cy="19" r="6" fill="#6c4326" />
          <!-- 後拋長帶 -->
          <path
            d="M232,62 C192,54 146,66 106,54 C74,44 46,50 28,64"
            fill="none" stroke="url(#gRibbon)" stroke-width="6" stroke-linecap="round" opacity="0.85"
          />
        </symbol>

        <!-- 神佛：乘祥雲、結印、圓光背屏 -->
        <symbol id="buddha" viewBox="0 0 300 240">
          <circle cx="150" cy="86" r="76" fill="url(#gHalo)" />
          <circle cx="150" cy="86" r="62" fill="none" stroke="rgba(212,175,55,0.6)" stroke-width="1.6" />
          <circle cx="150" cy="86" r="50" fill="none" stroke="rgba(212,175,55,0.35)" stroke-width="1" />
          <!-- 盤坐的下襬 -->
          <path
            d="M104,150 C112,132 128,124 150,124 C172,124 188,132 196,150
               C186,158 166,162 150,162 C134,162 114,158 104,150 Z"
            fill="url(#gRobe)"
          />
          <!-- 袈裟上身：肩線內收，腰腹放寬 -->
          <path
            d="M150,80 C164,80 176,88 182,100 C190,116 194,134 192,146
               C176,152 164,154 150,154 C136,154 124,152 108,146
               C106,134 110,116 118,100 C124,88 136,80 150,80 Z"
            fill="url(#gRobe2)"
          />
          <!-- 斜襟 -->
          <path d="M150,84 C142,98 138,116 138,134 C138,144 142,150 150,152" fill="none" stroke="rgba(255,246,220,0.55)" stroke-width="3" />
          <path d="M150,84 C160,92 168,104 172,118" fill="none" stroke="rgba(255,246,220,0.4)" stroke-width="2.5" />
          <!-- 雙臂垂下、結印 -->
          <path d="M120,104 C112,118 114,130 126,138" fill="none" stroke="#e6c07a" stroke-width="9" stroke-linecap="round" />
          <path d="M180,104 C188,118 186,130 174,138" fill="none" stroke="#e6c07a" stroke-width="9" stroke-linecap="round" />
          <path d="M128,140 C138,132 162,132 172,140 C162,148 138,148 128,140 Z" fill="#f3ddb8" />
          <!-- 頸、頭與肉髻 -->
          <path d="M150,74 L150,84" stroke="#f3ddb8" stroke-width="12" stroke-linecap="round" />
          <ellipse cx="150" cy="58" rx="15.5" ry="17.5" fill="#f3ddb8" />
          <path d="M134,52 C135,34 165,34 166,52 C158,45 142,45 134,52 Z" fill="#6c4326" />
          <circle cx="150" cy="31" r="7.5" fill="#6c4326" />
          <path d="M143,58 C145,56 147,56 149,58" fill="none" stroke="#8a6a4a" stroke-width="1.4" stroke-linecap="round" />
          <path d="M151,58 C153,56 155,56 157,58" fill="none" stroke="#8a6a4a" stroke-width="1.4" stroke-linecap="round" />
          <!-- 蓮座 -->
          <path d="M96,160 C110,152 190,152 204,160 C196,174 172,180 150,180 C128,180 104,174 96,160 Z" fill="#f6e2b6" />
          <path d="M112,160 C120,170 132,176 150,177 C168,176 180,170 188,160" fill="none" stroke="rgba(212,175,55,0.6)" stroke-width="2" />
          <path d="M150,155 C142,164 140,172 141,178 M150,155 C158,164 160,172 159,178" fill="none" stroke="rgba(212,175,55,0.5)" stroke-width="2" />
          <!-- 承托祥雲 -->
          <g transform="translate(20,158) scale(0.87)">
            <use href="#ruyi" width="300" height="120" />
          </g>
        </symbol>

        <!-- 仙鶴 -->
        <symbol id="crane" viewBox="0 0 220 120">
          <path d="M96,68 C74,58 46,58 22,72 C46,64 72,66 90,76 Z" fill="#fdfbf4" />
          <ellipse cx="112" cy="70" rx="34" ry="15" fill="#fdfbf4" />
          <path d="M120,62 C126,44 138,32 152,26 C142,38 136,50 136,64 Z" fill="#fdfbf4" />
          <path d="M150,28 C160,20 172,18 182,20 L196,22 L182,28 C170,32 158,32 150,28 Z" fill="#f6f1e4" />
          <path d="M196,22 L214,18 L198,28 Z" fill="#c9922f" />
          <circle cx="176" cy="24" r="4" fill="#a63a3a" />
          <path d="M84,78 C70,88 56,96 40,100" fill="none" stroke="#e7ddc7" stroke-width="4" stroke-linecap="round" />
          <path d="M92,80 C80,92 66,100 50,106" fill="none" stroke="#e7ddc7" stroke-width="3" stroke-linecap="round" />
          <path d="M78,62 C56,44 40,40 22,44 C42,48 58,58 74,74 Z" fill="#f2ece0" />
          <path d="M96,60 C86,44 76,36 62,32 C78,42 86,54 90,68 Z" fill="rgba(212,175,55,0.35)" />
        </symbol>
      </defs>
    </svg>

    <!-- ============ 舞台 ============ -->
    <div class="stage" aria-hidden="true">
      <div class="layer sky"></div>
      <div class="rays"></div>
      <div class="layer halo-glow"></div>

      <svg class="mountains" viewBox="0 0 1440 420" preserveAspectRatio="none">
        <path
          d="M0,300 L150,190 L250,250 L380,120 L520,240 L640,180 L760,270 L900,150 L1040,246 L1180,166 L1320,254 L1440,196 L1440,420 L0,420 Z"
          fill="url(#gMountain)" opacity="0.4"
        />
        <path
          d="M0,340 L180,254 L320,320 L470,220 L620,318 L780,246 L920,330 L1080,258 L1240,336 L1400,270 L1440,300 L1440,420 L0,420 Z"
          fill="#a9bcbb" opacity="0.34"
        />
      </svg>

      <!-- 中央玉皇大帝：置於霧氣與雲帶之後，時隱時現 -->
      <div class="sovereign">
        <span class="sovereign-float">
          <img :src="jadeEmperorSrc" alt="" class="sovereign-img" />
        </span>
      </div>

      <div class="mist m1"></div>
      <div class="mist m2"></div>
      <div class="mist m3"></div>
      <div class="mist m4"></div>

      <!-- 遠景雲帶 -->
      <div class="band band-far">
        <svg viewBox="0 0 2400 140" preserveAspectRatio="none">
          <g id="cloudsFar">
            <use href="#ruyi" x="40" y="30" width="300" height="120" />
            <use href="#ruyi" x="420" y="8" width="240" height="96" />
            <use href="#ruyi" x="760" y="42" width="330" height="132" />
            <use href="#ruyi" x="1180" y="16" width="270" height="108" />
          </g>
          <use href="#cloudsFar" x="1200" />
        </svg>
      </div>

      <!-- 飛天神佛 -->
      <div class="flyer f1 far" style="--top:13%; --size:150px; --dur:104s; --delay:-6s; --bob:8s; --alpha:0.4;">
        <span class="bob"><svg viewBox="0 0 360 200"><use href="#apsara" width="360" height="200" /></svg></span>
      </div>

      <div class="flyer f2 rtl mid" style="--top:64%; --size:186px; --dur:118s; --delay:-30s; --bob:6.4s; --alpha:0.5;">
        <span class="bob"><svg viewBox="0 0 360 200"><use href="#apsara" width="360" height="200" /></svg></span>
      </div>

      <div class="flyer f3 mid" style="--top:6%; --size:132px; --dur:150s; --delay:-52s; --bob:9s; --alpha:0.46;">
        <span class="bob"><svg viewBox="0 0 300 240"><use href="#buddha" width="300" height="240" /></svg></span>
      </div>

      <div class="flyer f4 far rtl" style="--top:24%; --size:104px; --dur:132s; --delay:-14s; --bob:7.6s; --alpha:0.34;">
        <span class="bob"><svg viewBox="0 0 220 120"><use href="#crane" width="220" height="120" /></svg></span>
      </div>

      <div class="flyer f5 mid" style="--top:76%; --size:120px; --dur:112s; --delay:-40s; --bob:5.8s; --alpha:0.42;">
        <span class="bob"><svg viewBox="0 0 220 120"><use href="#crane" width="220" height="120" /></svg></span>
      </div>

      <div class="flyer f6 far" style="--top:72%; --size:140px; --dur:146s; --delay:-72s; --bob:7.2s; --alpha:0.3;">
        <span class="bob"><svg viewBox="0 0 360 200"><use href="#apsara" width="360" height="200" /></svg></span>
      </div>

      <!-- 中景雲帶 -->
      <div class="band band-mid">
        <svg viewBox="0 0 2400 150" preserveAspectRatio="none">
          <g id="cloudsMid">
            <use href="#ruyi" x="0" y="26" width="380" height="152" />
            <use href="#ruyi" x="440" y="54" width="300" height="120" />
            <use href="#ruyi" x="820" y="18" width="420" height="168" />
          </g>
          <use href="#cloudsMid" x="1200" />
        </svg>
      </div>

      <!-- 金色光點 -->
      <div class="motes">
        <span
          v-for="(mote, index) in motes"
          :key="index"
          class="mote"
          :style="{
            left: mote.left,
            top: mote.top,
            width: mote.size,
            height: mote.size,
            '--dur': mote.dur,
            '--delay': mote.delay,
            '--dx': mote.dx,
            '--peak': mote.peak
          }"
        ></span>
      </div>

      <!-- 近景雲帶 -->
      <div class="band band-near">
        <svg viewBox="0 0 2400 160" preserveAspectRatio="none">
          <g id="cloudsNear">
            <use href="#ruyi" x="-40" y="20" width="460" height="184" />
            <use href="#ruyi" x="520" y="46" width="380" height="152" />
            <use href="#ruyi" x="960" y="10" width="420" height="168" />
          </g>
          <use href="#cloudsNear" x="1200" />
        </svg>
      </div>

      <div class="layer vignette"></div>
    </div>

    <!-- ============ 主視覺文案 ============ -->
    <main class="celestial-hero">
      <p class="celestial-eyebrow">雲深不知處　神明在人間</p>
      <h1 class="title"><span
          v-for="char in TITLE_CHARS"
          :key="char"
          class="glyph"
        ><span class="glyph-face">{{ char }}</span
        ><span
          v-for="band in 3"
          :key="band"
          class="shard"
          :class="`s${band}`"
          aria-hidden="true"
        >{{ char }}</span
        ></span></h1>
      <p class="subtitle">誠 心 一 問 · 天 意 自 來</p>
      <p class="desc">合十靜心，於雲霧之間叩問神明。線上求籤、擲筊解惑，把廟埕的溫度帶到你身邊。</p>
      <div class="actions">
        <button class="btn btn-primary" type="button" :disabled="isAscending" @click="enterHall()">入 殿 求 籤</button>
        <button class="btn btn-ghost" type="button" @click="go('/lookup')">線 上 查 籤</button>
      </div>
      <div class="tutorial-link">
        <button class="link-btn" type="button" @click="openTutorial">
          <span class="play-dot" aria-hidden="true"></span>第一次來？看 90 秒求籤教學
        </button>
      </div>
    </main>

    <!-- 教學影片 -->
    <div v-if="showTutorial" class="tutorial-overlay" role="dialog" aria-modal="true" aria-label="求籤教學影片" @click.self="closeTutorial">
      <div class="tutorial-box">
        <button class="tutorial-close" type="button" aria-label="關閉教學影片" @click="closeTutorial">✕</button>
        <video
          ref="tutorialVideo"
          class="tutorial-video"
          src="/videos/tutorial.mp4"
          controls
          playsinline
          preload="metadata"
          @ended="closeTutorial"
        ></video>
      </div>
    </div>

    <!-- 入殿光幕：玉皇大帝放大後的金光 -->
    <!-- 入殿轉場：玉皇大帝化去之後，雲霧才自中心繚繞捲開 -->
    <div v-if="isAscending" class="ascend-clouds" aria-hidden="true">
      <span class="break-flash"></span>
      <span class="break-wave"></span>
      <span class="swirl d1"></span>
      <span class="swirl d2"></span>
      <span class="fogbank f1"></span>
      <span class="fogbank f2"></span>
      <span class="fogbank f3"></span>
      <span
        v-for="puff in ascendPuffs"
        :key="puff.id"
        class="puff"
        :style="{
          '--angle': puff.angle,
          '--dist': puff.dist,
          '--spin': puff.spin,
          '--size': puff.size,
          '--delay': puff.delay,
          '--dur': puff.dur,
          '--churn': puff.churn
        }"
      >
        <i class="churn"></i>
      </span>
    </div>

    <div class="ascend-veil" aria-hidden="true"></div>
  </div>
</template>

<style>
/* 沉浸式首頁期間鎖住捲動（body 需全域選取器） */
body.celestial-home-open {
  overflow: hidden;
}
</style>

<style scoped>
.celestial-home {
  --jiang-hong: #a63a3a;
  --jiang-hong-deep: #7a2626;
  --cream: #fbf9f5;
  --gold: #d4af37;
  --gold-soft: #f2e2b3;
  --gold-line: rgba(212, 175, 55, 0.45);
  --ink: #3a2c22;
  --ink-soft: #5b4635;

  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #e9dfcb;
  color: var(--ink);
  font-family: 'Noto Serif TC', serif;
  -webkit-font-smoothing: antialiased;
}

.asset-defs {
  position: absolute;
}

/* ===================== 舞台 ===================== */
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.layer {
  position: absolute;
  inset: -6%;
  pointer-events: none;
}

/* 天光：上青下金的仙氣漸層 */
.sky {
  background:
    radial-gradient(120% 85% at 50% 8%, rgba(255, 252, 242, 0.95) 0%, rgba(255, 244, 214, 0.7) 26%, rgba(255, 255, 255, 0) 62%),
    linear-gradient(180deg, #b9d3d8 0%, #cfe0dc 18%, #e6e0cd 42%, #f4e6cc 62%, #f9efd9 80%, #fbf6ea 100%);
}

/* 佛光：中心暈光 + 放射光芒 */
.halo-glow {
  background: radial-gradient(38% 30% at 50% 16%, rgba(255, 238, 190, 0.95), rgba(255, 232, 170, 0.35) 45%, rgba(255, 255, 255, 0) 72%);
  mix-blend-mode: screen;
  animation: breathe 9s ease-in-out infinite;
}
.rays {
  position: absolute;
  top: -40%;
  left: 50%;
  width: 180vmax;
  height: 180vmax;
  margin-left: -90vmax;
  pointer-events: none;
  transform-origin: 50% 50%;
  background: repeating-conic-gradient(
    from 0deg at 50% 50%,
    rgba(255, 240, 200, 0.34) 0deg 3deg,
    rgba(255, 240, 200, 0) 3deg 11deg
  );
  -webkit-mask-image: radial-gradient(closest-side, #000 8%, rgba(0, 0, 0, 0.55) 34%, transparent 68%);
  mask-image: radial-gradient(closest-side, #000 8%, rgba(0, 0, 0, 0.55) 34%, transparent 68%);
  opacity: 0.55;
  animation: spin 150s linear infinite;
}

/* 遠山 */
.mountains {
  position: absolute;
  left: -4%;
  right: -4%;
  bottom: 16%;
  width: 108%;
  height: 46%;
  transform: translate3d(calc(var(--px, 0) * -6px), calc(var(--py, 0) * -4px), 0);
}

/* ===================== 中央玉皇大帝 ===================== */
.sovereign {
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(200px, 23vw, 335px);
  transform: translate3d(-50%, -62%, 0);
  transform-origin: 50% 20%;
  pointer-events: none;
  filter: blur(1.7px);
  /* 完全可見範圍原本只到 58%（腰部附近）就開始淡出，長袍下半身幾乎被遮罩吃掉、
     畫面觀感偏向只有臉+上半身。延伸到 88% 讓身體露出來，只在最頂端/最底端與霧氣融合。 */
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 8%, #000 88%, rgba(0, 0, 0, 0.5) 97%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 8%, #000 88%, rgba(0, 0, 0, 0.5) 97%, transparent 100%);
  animation: emerge 19s ease-in-out infinite;
  will-change: transform, opacity;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}
.sovereign-float {
  display: block;
  animation: sovereign-float 15s ease-in-out infinite;
}
.sovereign svg,
.sovereign img {
  width: 100%;
  height: auto;
  display: block;
}

/* ===================== 入殿轉場 ===================== */
/* 雲霧繚繞：兩層旋轉霧幕 + 十二朵向外捲開的祥雲 */
.ascend-clouds {
  position: absolute;
  inset: 0;
  z-index: 16;
  pointer-events: none;
  overflow: hidden;
}
/* 霧幕：柔邊交給漸層，blur 只補一點，避免整片畫面的模糊運算拖慢動畫 */
.swirl {
  position: absolute;
  left: 50%;
  top: 48%;
  width: 86vmax;
  height: 86vmax;
  margin: -43vmax 0 0 -43vmax;
  border-radius: 50%;
  opacity: 0;
  background: repeating-conic-gradient(
    from 0deg at 50% 50%,
    rgba(255, 255, 255, 0) 0deg,
    rgba(255, 255, 255, 0.58) 14deg,
    rgba(255, 252, 240, 0) 30deg,
    rgba(255, 255, 255, 0) 46deg
  );
  -webkit-mask-image: radial-gradient(closest-side, #000 14%, rgba(0, 0, 0, 0.7) 46%, transparent 78%);
  mask-image: radial-gradient(closest-side, #000 14%, rgba(0, 0, 0, 0.7) 46%, transparent 78%);
  animation: swirl-open 1s cubic-bezier(0.3, 0.5, 0.3, 1) 1.2s forwards;
}
.swirl.d2 {
  animation-name: swirl-open-back;
  animation-duration: 1.15s;
  animation-delay: 1.15s;
  opacity: 0;
}
/* 底霧：大片緩慢翻湧的霧氣，把畫面墊厚 */
.fogbank {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 64vmax;
  height: 44vmax;
  margin: -22vmax 0 0 -32vmax;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.9), rgba(255, 252, 240, 0.42) 52%, rgba(255, 250, 236, 0) 80%);
  opacity: 0;
  animation:
    fog-rise 1.2s ease-out 1.2s forwards,
    fog-billow 5s ease-in-out 1.2s infinite;
}
.fogbank.f2 { width: 84vmax; height: 38vmax; margin: -19vmax 0 0 -42vmax; animation-delay: 1.32s, 1.32s; animation-duration: 1.3s, 6.4s; }
.fogbank.f3 { width: 52vmax; height: 54vmax; margin: -27vmax 0 0 -26vmax; animation-delay: 1.4s, 1.4s; animation-duration: 1.2s, 4.2s; }

/* 霧絮：外層向外捲、內層自己翻騰，霧才會一直在動 */
.puff {
  position: absolute;
  left: 50%;
  top: 48%;
  width: var(--size, 300px);
  height: calc(var(--size, 300px) * 0.66);
  margin-left: calc(var(--size, 300px) / -2);
  margin-top: calc(var(--size, 300px) * -0.33);
  opacity: 0;
  animation: puff-out var(--dur, 1.4s) cubic-bezier(0.22, 0.6, 0.3, 1) var(--delay, 0s) forwards;
}
.puff .churn {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(255, 255, 255, 0.95),
    rgba(255, 252, 240, 0.55) 48%,
    rgba(255, 248, 228, 0) 78%
  );
  animation: churn var(--churn, 3s) ease-in-out infinite;
}

.ascend-veil {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(60% 45% at 50% 42%, rgba(255, 250, 232, 1) 0%, rgba(255, 240, 202, 0.9) 40%, rgba(250, 228, 186, 0.75) 70%, rgba(246, 222, 178, 0.6) 100%);
}
.is-ascending .ascend-veil {
  /* 雲霧捲滿之後才蓋上光幕，接到 wizard */
  animation: veil-in 0.72s ease-in 1.62s forwards;
}
.is-ascending .sovereign {
  z-index: 12;
  -webkit-mask-image: none;
  mask-image: none;
  /* 錨點改回頭部（50% 20%，與平時靜止的錨點一致），放大時以臉為軸往下擴張，
     衝向鏡頭時放大的是臉，不是身體。（先前這裡改成 50% 50% 置中是為了避免
     以頭為軸時「破題」撞擊那一格動勢看起來歪掉，如果放大後又覺得撞擊格畫面
     跑位，要調整的是下面 ascend keyframe 21% 那一格的 translate 值。） */
  transform-origin: 50% 20%;
  animation: ascend 1.5s cubic-bezier(0.42, 0, 0.3, 1) forwards;
}
.is-ascending .sovereign-float,
.is-ascending .rays {
  animation-play-state: paused;
}
/* 破題：標題浮到玉皇大帝之前，等祂撞上來再被震開 */
/* 震動掛在內層，根元素若有動畫，router 的 out-in 轉場會等它跑完才換頁 */
.is-ascending .stage,
.is-ascending .celestial-hero {
  animation: screen-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) 0.32s;
}
.is-ascending .celestial-hero {
  z-index: 14;
}
.is-ascending .celestial-eyebrow,
.is-ascending .subtitle,
.is-ascending .desc,
.is-ascending .actions {
  animation: hero-out 0.4s ease-in forwards;
}
/* 先愈抖愈兇，0.46 秒被撞上時才炸成五截 */
.is-ascending .title .glyph {
  animation: glyph-shudder 0.32s linear forwards;
}
.is-ascending .title .glyph:nth-child(2) { animation-delay: 0.02s; }
.is-ascending .title .glyph:nth-child(3) { animation-delay: 0.04s; }

.is-ascending .glyph-face {
  animation: face-out 0.05s linear 0.32s forwards;
}
.is-ascending .shard {
  opacity: 1;
  animation: shard-fly 0.8s cubic-bezier(0.1, 0.72, 0.3, 1) 0.32s forwards;
}
/* 五道橫截各飛各的：上下分離、中間那截被正面貫穿 */
.is-ascending .glyph .s1 { --fy: -1.05; --fr: -30deg; --fs: 1.3; }
.is-ascending .glyph .s2 { --fy: 0.08; --fr: 16deg; --fs: 1.45; animation-delay: 0.335s; }
.is-ascending .glyph .s3 { --fy: 1.05; --fr: -24deg; --fs: 1.3; animation-delay: 0.35s; }
/* 左字往左甩、右字往右甩，中間的字直接朝觀眾炸開 */
.is-ascending .glyph:nth-child(1) .shard { --dx: -1.15; }
.is-ascending .glyph:nth-child(2) .shard { --dx: 0.1; }
.is-ascending .glyph:nth-child(3) .shard { --dx: 1.15; }

/* 撞擊白光 */
.break-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(38% 28% at 50% 46%, rgba(255, 255, 255, 0.95), rgba(255, 246, 214, 0.5) 45%, rgba(255, 244, 208, 0) 75%);
  opacity: 0;
  animation: flash 0.42s ease-out 0.32s forwards;
}
/* 撞破瞬間的光環 */
.break-wave {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 40vmax;
  height: 40vmax;
  margin: -20vmax 0 0 -20vmax;
  border-radius: 50%;
  border: 2px solid rgba(255, 244, 208, 0.9);
  box-shadow: 0 0 60px rgba(255, 236, 180, 0.75), inset 0 0 50px rgba(255, 240, 195, 0.6);
  opacity: 0;
  animation: break-wave 0.8s cubic-bezier(0.15, 0.7, 0.3, 1) 0.32s forwards;
}
.is-ascending .band,
.is-ascending .flyer,
.is-ascending .mist {
  animation-play-state: running;
  opacity: 0;
  transition: opacity 0.9s ease;
}

/* 霧氣：大面積柔光團 */
.mist {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.42) 46%, rgba(255, 255, 255, 0) 72%);
  filter: blur(18px);
  will-change: transform;
}
.mist.m1 { left: -18%; top: 44%; width: 78vw; height: 34vh; animation: mist-a 46s ease-in-out infinite; }
.mist.m2 { right: -22%; top: 36%; width: 86vw; height: 38vh; animation: mist-b 58s ease-in-out infinite; opacity: 0.85; }
.mist.m3 { left: 10%; bottom: -8%; width: 96vw; height: 40vh; animation: mist-a 38s ease-in-out infinite reverse; }
.mist.m4 { right: 4%; top: 8%; width: 52vw; height: 26vh; animation: mist-b 64s ease-in-out infinite reverse; opacity: 0.6; }

/* 祥雲帶：無縫橫向流動 */
.band {
  position: absolute;
  left: 0;
  width: 200%;
  height: auto;
  will-change: transform;
}
.band :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}
.band-far { bottom: 30%; opacity: 0.5; animation: flow 150s linear infinite; transform-origin: left bottom; --s: 0.75; }
.band-mid { bottom: 10%; opacity: 0.78; animation: flow 96s linear infinite reverse; --s: 1; }
.band-near { bottom: -14%; opacity: 1; animation: flow 64s linear infinite; transform-origin: left bottom; --s: 1.35; }

/* ===================== 飛天神佛 ===================== */
.flyer {
  position: absolute;
  left: 0;
  top: var(--top, 30%);
  width: var(--size, 300px);
  will-change: transform;
  animation: cross var(--dur, 54s) linear infinite;
  animation-delay: var(--delay, 0s);
  opacity: var(--alpha, 1);
  filter: drop-shadow(0 10px 26px rgba(166, 105, 40, 0.22));
}
.flyer.rtl { animation-name: cross-back; }
.flyer .bob {
  display: block;
  animation: bob var(--bob, 7s) ease-in-out infinite;
  animation-delay: var(--delay, 0s);
}
.flyer.rtl .bob { transform-origin: 50% 50%; }
.flyer.rtl .bob svg { transform: scaleX(-1); }
.flyer svg {
  width: 100%;
  height: auto;
  display: block;
}
/* 景深：mid 稍遠、far 最遠 */
.flyer.mid { filter: blur(1.8px) saturate(0.72) drop-shadow(0 6px 16px rgba(166, 105, 40, 0.1)); }
.flyer.far { filter: blur(3.4px) saturate(0.55) drop-shadow(0 4px 12px rgba(166, 105, 40, 0.08)); }

/* symbol 內的帛帶擺動：需獨立選取器，<use> 影子樹才吃得到 */
.sway {
  animation: sway 5.5s ease-in-out infinite;
  transform-origin: 78% 42%;
}

/* 金色光點 */
.mote {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 244, 205, 1) 0%, rgba(212, 175, 55, 0.85) 40%, rgba(212, 175, 55, 0) 70%);
  animation: rise var(--dur, 22s) linear infinite;
  animation-delay: var(--delay, 0s);
  will-change: transform, opacity;
}

.vignette {
  background: radial-gradient(120% 90% at 50% 42%, rgba(0, 0, 0, 0) 52%, rgba(90, 64, 32, 0.14) 100%);
}

/* ===================== 前景內容 ===================== */
.celestial-hero {
  position: relative;
  z-index: 5;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 24px;
  transform: translate3d(calc(var(--px, 0) * 8px), calc(var(--py, 0) * 6px), 0);
}
.celestial-eyebrow {
  margin: 0 0 22px;
  font-size: 12px;
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  color: var(--ink-soft);
  opacity: 0;
  animation: reveal 1.2s 0.2s ease-out forwards;
}
.celestial-eyebrow::before,
.celestial-eyebrow::after {
  content: '';
  display: inline-block;
  width: 40px;
  height: 1px;
  vertical-align: middle;
  background: linear-gradient(90deg, transparent, var(--gold-line));
  margin: 0 16px 4px;
}
.celestial-eyebrow::after { background: linear-gradient(90deg, var(--gold-line), transparent); }

.title {
  margin: 0;
  font-size: clamp(58px, 12vw, 132px);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-indent: 0.16em;
  line-height: 1.08;
  color: var(--jiang-hong-deep);
  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.55), 0 18px 44px rgba(122, 38, 38, 0.18);
  opacity: 0;
  animation: reveal 1.4s 0.35s ease-out forwards;
}
.title .glyph {
  position: relative;
  display: inline-block;
  animation: float-glyph 6s ease-in-out infinite;
}
/* 三截碎片疊在字上，平時隱形，撞破時才各自飛出 */
.title .shard {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  pointer-events: none;
  will-change: transform, opacity;
}
/* 沿兩道斜裂縫切成三大塊，飛出去時還看得出原本是哪個字 */
.title .s1 { clip-path: polygon(-14% -6%, 114% -6%, 114% 30%, -14% 38%); }
.title .s2 { clip-path: polygon(-14% 38%, 114% 30%, 114% 68%, -14% 74%); }
.title .s3 { clip-path: polygon(-14% 74%, 114% 68%, 114% 114%, -14% 114%); }
/* 碎片壓一層暗影，飛過玉皇大帝的金光時才不會被吃掉 */
.title .shard {
  text-shadow: 0 2px 10px rgba(90, 26, 26, 0.45), 0 0 2px rgba(90, 26, 26, 0.5);
}
.title .glyph:nth-child(2) { animation-delay: 0.4s; }
.title .glyph:nth-child(3) { animation-delay: 0.8s; }

.subtitle {
  margin: 26px 0 0;
  font-size: clamp(14px, 2.2vw, 18px);
  font-weight: 300;
  letter-spacing: 0.32em;
  text-indent: 0.32em;
  color: var(--ink-soft);
  opacity: 0;
  animation: reveal 1.4s 0.55s ease-out forwards;
}
.desc {
  margin: 18px auto 0;
  max-width: 30em;
  font-size: 14.5px;
  line-height: 2.1;
  letter-spacing: 0.08em;
  color: rgba(91, 70, 53, 0.82);
  opacity: 0;
  animation: reveal 1.4s 0.7s ease-out forwards;
}

.actions {
  margin-top: 46px;
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  justify-content: center;
  opacity: 0;
  animation: reveal 1.4s 0.9s ease-out forwards;
}
.btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  padding: 17px 42px;
  border-radius: 999px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease, color 0.25s ease;
}
.btn-primary {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  color: var(--gold-soft);
  box-shadow: 0 14px 34px rgba(122, 38, 38, 0.3), inset 0 0 0 1px rgba(242, 226, 179, 0.35);
}
.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 20px 44px rgba(122, 38, 38, 0.38), inset 0 0 0 1px rgba(242, 226, 179, 0.6);
}
.btn-ghost {
  background: rgba(255, 255, 255, 0.62);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--gold-line), 0 10px 26px rgba(120, 90, 50, 0.12);
  backdrop-filter: blur(6px);
}
.btn-ghost:hover {
  transform: translateY(-3px);
  background: rgba(255, 255, 255, 0.86);
  color: var(--jiang-hong);
}
.btn:focus-visible {
  outline: 2px solid var(--jiang-hong);
  outline-offset: 3px;
}

/* 教學影片入口 */
.tutorial-link {
  margin-top: 22px;
  opacity: 0;
  animation: reveal 1.4s 1.05s ease-out forwards;
}
.link-btn {
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.14em;
  color: rgba(91, 70, 53, 0.75);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.link-btn:hover {
  color: var(--jiang-hong);
  border-bottom-color: var(--gold-line);
}
.play-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--gold-line);
  background: rgba(255, 255, 255, 0.6);
  position: relative;
  flex: none;
}
.play-dot::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 6px;
  border-style: solid;
  border-width: 5px 0 5px 8px;
  border-color: transparent transparent transparent var(--jiang-hong);
}

/* 教學影片視窗 */
.tutorial-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 5vh 4vw;
  background: rgba(58, 44, 34, 0.62);
  backdrop-filter: blur(6px);
  animation: reveal 0.32s ease-out;
}
.tutorial-box {
  position: relative;
  width: min(960px, 100%);
  border-radius: 18px;
  overflow: hidden;
  background: #0d0906;
  box-shadow: 0 30px 80px rgba(40, 26, 14, 0.5), 0 0 0 1px rgba(212, 175, 55, 0.35);
}
.tutorial-video {
  display: block;
  width: 100%;
  max-height: 78vh;
  background: #0d0906;
}
.tutorial-close {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 15px;
  color: var(--gold-soft);
  background: rgba(30, 20, 12, 0.7);
  transition: background 0.2s ease, transform 0.2s ease;
}
.tutorial-close:hover { background: rgba(122, 38, 38, 0.85); transform: scale(1.06); }

/* ===================== 動畫 ===================== */
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes breathe {
  0%, 100% { opacity: 0.82; }
  50% { opacity: 1; }
}
@keyframes flow {
  from { transform: translate3d(0, 0, 0) scale(var(--s, 1)); }
  to { transform: translate3d(-50%, 0, 0) scale(var(--s, 1)); }
}
@keyframes ascend {
  0% {
    transform: translate3d(-50%, -62%, 0) scale(1);
    opacity: 0.3;
    filter: blur(2.2px);
  }
  18% {
    opacity: 0.95;
    filter: blur(0.4px);
  }
  /* 撞上標題的瞬間：與字同高，才看得出是祂把字撞碎的。
     底圖從 500px 縮成 335px 之後，原本的 2 倍會讓祂在撞擊當下就吞掉整個標題，
     這裡依新尺寸重算成 1.15 倍。 */
  21% {
    transform: translate3d(-50%, -60%, 0) scale(1.15);
    opacity: 1;
    filter: blur(0);
  }
  /* 撞破後先維持一下，讓碎片在還看得清的背景上飛出去 */
  42% {
    transform: translate3d(-50%, -58%, 0) scale(1.9);
    opacity: 1;
    filter: blur(0);
  }
  /* 再一口氣衝滿畫面 */
  72% {
    transform: translate3d(-50%, -55%, 0) scale(3.8);
    opacity: 1;
    filter: blur(0);
  }
  /* 就地化去，雲霧隨後才捲上來 */
  100% {
    transform: translate3d(-50%, -52%, 0) scale(5.8);
    opacity: 0;
    filter: blur(10px);
  }
}
@keyframes swirl-open {
  0% { transform: rotate(0deg) scale(0.3); opacity: 0; }
  26% { opacity: 0.95; }
  100% { transform: rotate(168deg) scale(1.45); opacity: 1; }
}
@keyframes swirl-open-back {
  0% { transform: rotate(40deg) scale(0.42); opacity: 0; }
  30% { opacity: 0.8; }
  100% { transform: rotate(-150deg) scale(1.6); opacity: 1; }
}
@keyframes puff-out {
  0% {
    transform: rotate(var(--angle, 0deg)) translateX(0) rotate(calc(var(--angle, 0deg) * -1)) scale(0.3);
    opacity: 0;
  }
  18% { opacity: 0.95; }
  100% {
    transform: rotate(var(--angle, 0deg)) translateX(var(--dist, 40vmax))
      rotate(calc(var(--angle, 0deg) * -1 + var(--spin, 90deg))) scale(2.4);
    opacity: 0.92;
  }
}
/* 霧團自己的翻騰：邊捲邊變形，不是單純放大 */
@keyframes churn {
  0%, 100% { transform: rotate(0deg) scale(1, 1); }
  33% { transform: rotate(14deg) scale(1.18, 0.86); }
  66% { transform: rotate(-11deg) scale(0.88, 1.16); }
}
@keyframes fog-rise {
  0% { opacity: 0; }
  100% { opacity: 0.85; }
}
@keyframes fog-billow {
  0%, 100% { transform: translate3d(-2%, 2%, 0) scale(1) rotate(0deg); }
  50% { transform: translate3d(3%, -3%, 0) scale(1.22) rotate(8deg); }
}
@keyframes veil-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes hero-out {
  0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
  100% { opacity: 0; transform: translate3d(0, 24px, 0) scale(0.96); }
}
/* 撞擊前的抖動：幅度一路放大到整個字在震 */
@keyframes glyph-shudder {
  0% { transform: translate3d(0, 0, 0); }
  10% { transform: translate3d(-3px, 2px, 0) rotate(-0.8deg); }
  20% { transform: translate3d(5px, -3px, 0) rotate(1.2deg); }
  30% { transform: translate3d(-7px, 4px, 0) rotate(-1.8deg) scale(1.02); }
  40% { transform: translate3d(9px, -5px, 0) rotate(2.4deg) scale(1.03); }
  50% { transform: translate3d(-11px, 6px, 0) rotate(-3deg) scale(1.04); }
  60% { transform: translate3d(13px, -7px, 0) rotate(3.6deg) scale(1.05); }
  70% { transform: translate3d(-15px, 8px, 0) rotate(-4.2deg) scale(1.06); }
  80% { transform: translate3d(16px, -9px, 0) rotate(4.6deg) scale(1.08); }
  90% { transform: translate3d(-17px, 9px, 0) rotate(-5deg) scale(1.1); }
  /* 撞上前一瞬間被壓住，反差更大 */
  100% { transform: translate3d(0, 0, 0) scale(1.14); }
}
/* 字面在撞上的瞬間消失，改由三截碎片接手 */
@keyframes face-out {
  to { opacity: 0; }
}
/* 碎片飛散：前半段保持清晰看得出是字，後半段才拖糊消失 */
@keyframes shard-fly {
  0% {
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
    opacity: 1;
    filter: blur(0);
  }
  14% {
    transform: translate3d(calc(var(--dx, 0) * 4vw), calc(var(--fy, 0) * 3vh), 0)
      rotate(calc(var(--fr, 0deg) * 0.22)) scale(1.06);
    opacity: 1;
    filter: blur(0);
  }
  62% {
    transform: translate3d(calc(var(--dx, 0) * 20vw), calc(var(--fy, 0) * 15vh), 0)
      rotate(calc(var(--fr, 0deg) * 0.62)) scale(calc(1 + (var(--fs, 1.3) - 1) * 0.55));
    opacity: 0.92;
    filter: blur(0.5px);
  }
  100% {
    transform: translate3d(calc(var(--dx, 0) * 52vw), calc(var(--fy, 0) * 42vh), 0)
      rotate(var(--fr, 0deg)) scale(var(--fs, 1.3));
    opacity: 0;
    filter: blur(7px);
  }
}
@keyframes flash {
  0% { opacity: 0; }
  18% { opacity: 1; }
  100% { opacity: 0; }
}
/* 撞擊時整個畫面震一下 */
@keyframes screen-shake {
  0%, 100% { transform: translate3d(0, 0, 0); }
  15% { transform: translate3d(-9px, 5px, 0); }
  30% { transform: translate3d(8px, -6px, 0); }
  45% { transform: translate3d(-6px, -3px, 0); }
  60% { transform: translate3d(5px, 4px, 0); }
  80% { transform: translate3d(-3px, 2px, 0); }
}
@keyframes break-wave {
  0% { transform: scale(0.12); opacity: 0; border-width: 6px; }
  22% { opacity: 0.95; }
  100% { transform: scale(3.6); opacity: 0; border-width: 1px; }
}
@keyframes emerge {
  0%, 100% { opacity: 0.2; }
  46% { opacity: 0.66; }
  70% { opacity: 0.38; }
}
@keyframes sovereign-float {
  0%, 100% { transform: translateY(6px); }
  50% { transform: translateY(-10px); }
}
@keyframes mist-a {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(7vw, -2vh, 0) scale(1.14); }
}
@keyframes mist-b {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1.08); }
  50% { transform: translate3d(-8vw, 3vh, 0) scale(0.94); }
}
@keyframes cross {
  from { transform: translate3d(-38vw, 0, 0); }
  to { transform: translate3d(138vw, 0, 0); }
}
@keyframes cross-back {
  from { transform: translate3d(138vw, 0, 0); }
  to { transform: translate3d(-38vw, 0, 0); }
}
@keyframes bob {
  0%, 100% { transform: translateY(-16px) rotate(-1.5deg); }
  50% { transform: translateY(16px) rotate(1.5deg); }
}
@keyframes sway {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
@keyframes rise {
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  12% { opacity: var(--peak, 0.9); }
  80% { opacity: var(--peak, 0.9); }
  100% { transform: translate3d(var(--dx, 20px), -92vh, 0); opacity: 0; }
}
@keyframes reveal {
  from { opacity: 0; transform: translateY(18px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes float-glyph {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* 觸控裝置不要留下卡住的 hover 效果 */
@media (hover: none) {
  .btn:hover,
  .btn-primary:hover,
  .btn-ghost:hover,
  .link-btn:hover {
    transform: none;
    background: inherit;
  }
  .btn-primary:active { transform: scale(0.98); }
  .btn-ghost:active { transform: scale(0.98); }
}

@media (max-width: 640px) {
  .celestial-home {
    /* 手機瀏覽器的網址列會吃掉 100vh，用 dvh 才不會被截 */
    height: 100dvh;
  }
  .flyer { width: calc(var(--size, 300px) * 0.62); }

  /* 直式螢幕：玉皇大帝放大一點、往下挪，臉才不會頂在畫面外 */
  .sovereign {
    width: min(54vw, 241px);
    transform: translate3d(-50%, -56%, 0);
  }

  .celestial-hero { padding: 0 22px; }
  .celestial-eyebrow { font-size: 11px; letter-spacing: 0.34em; text-indent: 0.34em; }
  .celestial-eyebrow::before,
  .celestial-eyebrow::after { width: 22px; margin: 0 10px 4px; }
  .subtitle { margin-top: 20px; letter-spacing: 0.24em; text-indent: 0.24em; }
  .desc { margin-top: 14px; font-size: 14px; line-height: 1.95; }

  /* 按鈕改成整排，單手好按 */
  .actions {
    margin-top: 34px;
    gap: 12px;
    width: 100%;
    max-width: 320px;
    flex-direction: column;
  }
  .btn {
    width: 100%;
    padding: 16px 24px;
    font-size: 14px;
  }
  .tutorial-link { margin-top: 18px; }
  .link-btn { font-size: 12.5px; }

  /* 教學影片：留出上下安全距離，控制列才點得到 */
  .tutorial-overlay { padding: 3vh 4vw calc(3vh + env(safe-area-inset-bottom)); }
  .tutorial-box { border-radius: 14px; }
  .tutorial-video { max-height: 64vh; }
  .tutorial-close { width: 34px; height: 34px; top: 8px; right: 8px; }
}

/* 直式且螢幕偏矮：把上下留白再收一點 */
@media (max-width: 640px) and (max-height: 700px) {
  .desc { display: none; }
  .actions { margin-top: 26px; }
}

/* 螢幕高度不足（手機橫放、矮視窗）：只留標題與兩顆按鈕 */
@media (max-height: 560px) {
  .celestial-eyebrow { display: none; }
  .title { font-size: clamp(38px, 13vh, 72px); }
  .subtitle {
    margin-top: 12px;
    font-size: 13px;
    letter-spacing: 0.22em;
    text-indent: 0.22em;
  }
  .desc { display: none; }
  .actions {
    margin-top: 20px;
    flex-direction: row;
    width: auto;
    max-width: none;
  }
  .btn { width: auto; padding: 12px 28px; font-size: 13px; }
  .tutorial-link { margin-top: 12px; }
  .sovereign { transform: translate3d(-50%, -52%, 0); }
  .tutorial-video { max-height: 74vh; }
}

@media (prefers-reduced-motion: reduce) {
  .rays, .mist, .band, .flyer, .flyer .bob, .sway, .mote, .halo-glow,
  .sovereign, .sovereign-float, .title .glyph,
  .is-ascending, .title .shard, .glyph-face, .puff, .puff .churn,
  .fogbank, .swirl, .break-flash, .break-wave {
    animation: none !important;
  }
  .title .shard { opacity: 0 !important; }
  .sovereign { opacity: 0.32; }
  .flyer { opacity: calc(var(--alpha, 1) * 0.9); }
  .flyer.f1 { transform: translate3d(8vw, 0, 0); }
  .flyer.f2 { transform: translate3d(64vw, 0, 0); }
  .flyer.f3 { transform: translate3d(30vw, 0, 0); }
  .flyer.f4 { transform: translate3d(76vw, 0, 0); }
  .flyer.f5 { transform: translate3d(46vw, 0, 0); }
  .flyer.f6 { transform: translate3d(14vw, 0, 0); }
  .celestial-eyebrow, .title, .subtitle, .desc, .actions {
    opacity: 1;
    animation: none;
  }
}
</style>
