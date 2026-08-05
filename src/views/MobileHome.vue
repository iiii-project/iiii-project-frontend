<script setup lang="ts">
/* 手機版首頁：獨立於桌機版（index.vue）的一支頁面。
   共用同一套配色、字體、音效與玉皇大帝入殿轉場，但進場改成「推廟門」——
   logo 嵌在門縫正中央，門一開就從中線裂成兩半向兩側敞開。 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TempleGate from '../components/TempleGate.vue'

const router = useRouter()

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── 音效：與桌機版同一支音檔。音檔前 1.5 秒是空白，
   從撞擊點往回抓，聲音才會正好落在門敞開的那一刻。 ── */
const logoUrl = new URL('../assets/images/logo.png', import.meta.url).href
const ascendSoundUrl = new URL('../assets/audio/temple-ascend.m4a', import.meta.url).href
const AUDIO_IMPACT = 1.5
const AUDIO_PREROLL = 0.04
let ascendSound: HTMLAudioElement | null = null

function primeSound() {
  if (ascendSound) return
  ascendSound = new Audio(ascendSoundUrl)
  ascendSound.preload = 'auto'
  ascendSound.volume = 0.9
  ascendSound.load()
}

function playSound(visualImpact: number) {
  try {
    primeSound()
    if (!ascendSound) return
    ascendSound.currentTime = Math.max(0, AUDIO_IMPACT - AUDIO_PREROLL - visualImpact)
    void ascendSound.play().catch(() => undefined)
  } catch {
    // 音效失敗不影響動畫
  }
}

const TITLE_CHARS = ['籤', '好', '運']
const IMPACT_AT = 0.32 // 玉皇大帝撞上標題、字被震碎的時間（秒）

// ── 推門：門扇本體與開門聲都在 TempleGate 元件裡，這裡只接它的事件 ──
const isOpening = ref(false)
const isOpen = ref(false)

function onGateOpening() { isOpening.value = true }
function onGateOpened() { isOpen.value = true }

// ── 入殿：玉皇大帝迎面而來，門在身後闔上 ──
const isAscending = ref(false)
let ascendTimer = 0

function enterHall() {
  if (isAscending.value) return
  isAscending.value = true
  playSound(IMPACT_AT)
  if (prefersReducedMotion()) {
    router.push('/oracle')
    return
  }
  ascendTimer = window.setTimeout(() => router.push('/oracle'), 2050)
}

function go(path: string) {
  router.push(path)
}

// ── 教學影片 ──
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

// 金色光點：手機少放一點，省效能
const motes = Array.from({ length: 14 }, (_, index) => ({
  id: index,
  left: `${(index * 7.3 + (index % 5) * 6) % 100}%`,
  top: `${68 + (index % 6) * 6}%`,
  size: `${2 + (index % 4) * 1.4}px`,
  dur: `${17 + (index % 7) * 3.5}s`,
  delay: `${-index * 2.6}s`,
  dx: `${((index % 5) - 2) * 26}px`,
  peak: `${0.4 + (index % 4) * 0.16}`
}))

// 轉場用的霧絮：自中心往外捲
const puffs = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  angle: `${index * 36 + (index % 3) * 11}deg`,
  dist: `${30 + (index % 4) * 10}vmax`,
  size: `${220 + (index % 4) * 90}px`,
  delay: `${1.02 + (index % 5) * 0.05}s`,
  dur: `${0.95 + (index % 4) * 0.12}s`,
  churn: `${2.2 + (index % 5) * 0.4}s`
}))

onMounted(() => {
  document.body.classList.add('mobile-home-open')
  primeSound()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.body.classList.remove('mobile-home-open')
  window.removeEventListener('keydown', onKeydown)
  if (ascendTimer) clearTimeout(ascendTimer)
})
</script>

<template>
  <div class="mobile-home" :class="{ opening: isOpening, opened: isOpen, ascending: isAscending }">
    <!-- ============ SVG 素材 ============ -->
    <svg width="0" height="0" class="defs" aria-hidden="true">
      <defs>
        <linearGradient id="mRobe" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stop-color="#fff7e4" />
          <stop offset="42%" stop-color="#e6c274" />
          <stop offset="100%" stop-color="#9c3131" />
        </linearGradient>
        <linearGradient id="mCrown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fdf0cd" />
          <stop offset="100%" stop-color="#c9922f" />
        </linearGradient>
        <linearGradient id="mJade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f2f8ee" />
          <stop offset="100%" stop-color="#a8c9b4" />
        </linearGradient>
        <radialGradient id="mHalo">
          <stop offset="0%" stop-color="rgba(255,246,214,0.9)" />
          <stop offset="62%" stop-color="rgba(240,205,120,0.45)" />
          <stop offset="100%" stop-color="rgba(240,205,120,0)" />
        </radialGradient>
        <linearGradient id="mWood" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%" stop-color="#7d2320" />
          <stop offset="45%" stop-color="#9c2f28" />
          <stop offset="100%" stop-color="#6d1c1a" />
        </linearGradient>

        <!-- 祥雲（如意雲頭） -->
        <symbol id="mRuyi" viewBox="0 0 300 120">
          <path d="M14,104 C-6,92 -3,62 20,56 C18,34 40,20 60,29 C68,10 96,6 110,22
                   C124,4 154,6 164,26 C182,12 210,20 214,42 C240,34 264,52 258,76
                   C254,94 236,106 216,104 Z"
                fill="rgba(255,255,255,0.92)" />
          <path d="M20,56 C26,44 42,40 52,48 C58,53 58,62 51,65 C45,68 38,64 39,58"
                fill="none" stroke="rgba(212,175,55,0.5)" stroke-width="3" stroke-linecap="round" />
          <path d="M214,42 C222,30 240,30 248,40 C254,48 251,58 243,60 C236,62 230,57 232,50"
                fill="none" stroke="rgba(212,175,55,0.5)" stroke-width="3" stroke-linecap="round" />
          <path d="M14,104 C60,110 92,96 130,98 C170,100 194,110 216,104"
                fill="none" stroke="rgba(212,175,55,0.45)" stroke-width="2.5" stroke-linecap="round" />
        </symbol>

        <!-- 仙鶴 -->
        <symbol id="mCrane" viewBox="0 0 220 120">
          <path d="M96,68 C74,58 46,58 22,72 C46,64 72,66 90,76 Z" fill="#fdfbf4" />
          <ellipse cx="112" cy="70" rx="34" ry="15" fill="#fdfbf4" />
          <path d="M120,62 C126,44 138,32 152,26 C142,38 136,50 136,64 Z" fill="#fdfbf4" />
          <path d="M150,28 C160,20 172,18 182,20 L196,22 L182,28 C170,32 158,32 150,28 Z" fill="#f6f1e4" />
          <path d="M196,22 L214,18 L198,28 Z" fill="#c9922f" />
          <circle cx="176" cy="24" r="4" fill="#a63a3a" />
          <path d="M84,78 C70,88 56,96 40,100" fill="none" stroke="#e7ddc7" stroke-width="4" stroke-linecap="round" />
          <path d="M78,62 C56,44 40,40 22,44 C42,48 58,58 74,74 Z" fill="#f2ece0" />
          <path d="M96,60 C86,44 76,36 62,32 C78,42 86,54 90,68 Z" fill="rgba(212,175,55,0.35)" />
        </symbol>

        <!-- 玉皇大帝（與桌機版同一套造型，簡化細節） -->
        <symbol id="mEmperor" viewBox="0 0 400 560">
          <circle cx="200" cy="158" r="150" fill="url(#mHalo)" />
          <circle cx="200" cy="158" r="126" fill="none" stroke="rgba(212,175,55,0.4)" stroke-width="1.6" />
          <path
            d="M200,196 C228,196 248,212 254,238 L286,478 C264,494 230,502 200,502
               C170,502 136,494 114,478 L146,238 C152,212 172,196 200,196 Z"
            fill="url(#mRobe)"
          />
          <path
            d="M152,228 C120,248 94,300 80,360 C72,398 70,428 72,452
               C100,446 124,432 138,414 C130,360 134,296 154,258 Z"
            fill="url(#mRobe)"
          />
          <path
            d="M248,228 C280,248 306,300 320,360 C328,398 330,428 328,452
               C300,446 276,432 262,414 C270,360 266,296 246,258 Z"
            fill="url(#mRobe)"
          />
          <path d="M200,198 C228,200 250,214 258,240 C238,250 216,254 200,254
                   C184,254 162,250 142,240 C150,214 172,200 200,198 Z"
                fill="rgba(255,246,220,0.45)" />
          <path d="M200,202 L180,244 L200,284 L220,244 Z" fill="#fdf5e2" opacity="0.9" />
          <path d="M146,330 L254,330" stroke="url(#mCrown)" stroke-width="15" stroke-linecap="round" />
          <path d="M188,254 L200,236 L212,254 L212,352 L188,352 Z" fill="url(#mJade)" />
          <path d="M170,300 C180,290 220,290 230,300 C230,316 220,322 200,322
                   C180,322 170,316 170,300 Z" fill="#f3ddb8" />
          <path d="M200,176 L200,200" stroke="#eccb90" stroke-width="22" stroke-linecap="round" />
          <ellipse cx="200" cy="152" rx="31" ry="35" fill="#f3ddb8" />
          <path d="M184,142 C189,137 196,137 199,142" fill="none" stroke="#6f5744" stroke-width="2.2" stroke-linecap="round" />
          <path d="M201,142 C204,137 211,137 216,142" fill="none" stroke="#6f5744" stroke-width="2.2" stroke-linecap="round" />
          <path d="M184,170 C190,177 210,177 216,170" fill="none" stroke="#7a6250" stroke-width="3.4" stroke-linecap="round" />
          <path d="M188,182 C190,214 195,248 200,278 C205,248 210,214 212,182
                   C207,189 193,189 188,182 Z" fill="#7a6250" opacity="0.55" />
          <path d="M174,108 C174,92 226,92 226,108 L226,126 C226,134 174,134 174,126 Z" fill="#8a4a28" />
          <path d="M150,94 L250,86 L254,100 L154,108 Z" fill="url(#mCrown)" />
          <g stroke-linecap="round" stroke-dasharray="0.1 12" opacity="0.8">
            <path d="M160,104 L160,164" stroke="#f0e0b0" stroke-width="6" />
            <path d="M175,102 L175,156" stroke="#cfe0d2" stroke-width="6" />
            <path d="M225,98 L225,156" stroke="#cfe0d2" stroke-width="6" />
            <path d="M240,96 L240,164" stroke="#f0e0b0" stroke-width="6" />
          </g>
        </symbol>
      </defs>
    </svg>

    <!-- ============ 門後的仙境 ============ -->
    <div class="scene" aria-hidden="true">
      <div class="sky"></div>
      <div class="godlight"></div>
      <svg class="peaks" viewBox="0 0 375 240" preserveAspectRatio="none">
        <path d="M0,150 L60,86 L110,124 L170,60 L230,126 L290,74 L340,132 L375,104 L375,240 L0,240 Z"
              fill="#9fb5b8" opacity="0.38" />
        <path d="M0,178 L70,126 L140,170 L210,116 L280,172 L350,132 L375,152 L375,240 L0,240 Z"
              fill="#adc0bd" opacity="0.32" />
      </svg>
      <div class="haze h1"></div>
      <div class="haze h2"></div>
      <div class="emperor">
        <svg viewBox="0 0 400 560"><use href="#mEmperor" width="400" height="560" /></svg>
      </div>
      <div class="cloudbelt"></div>

      <!-- 遠處掠過的仙鶴：小、慢、淡，只當背景層次 -->
      <div class="flyer f1"><span class="bob">
        <svg viewBox="0 0 220 120"><use href="#mCrane" width="220" height="120" /></svg>
      </span></div>
      <div class="flyer f2 rtl"><span class="bob">
        <svg viewBox="0 0 220 120"><use href="#mCrane" width="220" height="120" /></svg>
      </span></div>

      <!-- 兩道祥雲帶橫向流動 -->
      <div class="band band-far">
        <svg viewBox="0 0 1200 130" preserveAspectRatio="none">
          <g id="mCloudsFar">
            <use href="#mRuyi" x="20" y="20" width="240" height="96" />
            <use href="#mRuyi" x="300" y="42" width="190" height="76" />
            <use href="#mRuyi" x="530" y="10" width="260" height="104" />
          </g>
          <use href="#mCloudsFar" x="600" />
        </svg>
      </div>
      <div class="band band-near">
        <svg viewBox="0 0 1200 140" preserveAspectRatio="none">
          <g id="mCloudsNear">
            <use href="#mRuyi" x="-30" y="16" width="330" height="132" />
            <use href="#mRuyi" x="330" y="40" width="270" height="108" />
          </g>
          <use href="#mCloudsNear" x="600" />
        </svg>
      </div>

      <!-- 香爐輕煙：呼應 logo 中央的三炷香 -->
      <div class="censer">
        <svg viewBox="0 0 160 190">
          <g class="smoke" fill="none" stroke="rgba(255,252,242,0.85)" stroke-width="3" stroke-linecap="round">
            <path class="w1" d="M80,120 C68,98 92,84 80,62 C71,45 88,34 80,18" />
            <path class="w2" d="M62,124 C52,106 68,94 58,78" />
            <path class="w3" d="M98,124 C108,106 92,94 102,78" />
          </g>
          <path d="M52,124 h56 l-7,22 h-42 Z" fill="rgba(201,146,47,0.55)" />
          <rect x="58" y="112" width="44" height="14" rx="3" fill="rgba(201,146,47,0.6)" />
        </svg>
      </div>

      <!-- 金色光點 -->
      <div class="motes">
        <span v-for="mote in motes" :key="mote.id" class="mote" :style="{
          left: mote.left, top: mote.top, width: mote.size, height: mote.size,
          '--dur': mote.dur, '--delay': mote.delay, '--dx': mote.dx, '--peak': mote.peak
        }"></span>
      </div>
    </div>

    <!-- ============ 門後的內容 ============ -->
    <main class="content">
      <p class="eyebrow">雲深不知處　神明在人間</p>
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
      <div class="actions">
        <button class="btn primary" type="button" :disabled="isAscending" @click="enterHall">入 殿 求 籤</button>
        <button class="btn ghost" type="button" @click="go('/temple-oracle-v17?mode=lookup')">線 上 查 籤</button>
      </div>
      <button class="tutorial-link" type="button" @click="openTutorial">
        <span class="play-dot" aria-hidden="true"></span>第一次來？看 90 秒求籤教學
      </button>
    </main>

    <!-- ============ 廟門 ============ -->
    <!-- 廟門：抽成共用元件，掃碼取籤頁用的是同一扇 -->
    <TempleGate @opening="onGateOpening" @opened="onGateOpened" />


    <!-- ============ 入殿轉場 ============ -->
    <div v-if="isAscending" class="ascend" aria-hidden="true">
      <span class="break-flash"></span>
      <span class="break-wave"></span>
      <span
        v-for="puff in puffs"
        :key="puff.id"
        class="puff"
        :style="{
          '--angle': puff.angle,
          '--dist': puff.dist,
          '--size': puff.size,
          '--delay': puff.delay,
          '--dur': puff.dur,
          '--churn': puff.churn
        }"
      ><i></i></span>
      <span class="veil"></span>
    </div>

    <!-- ============ 教學影片 ============ -->
    <div
      v-if="showTutorial"
      class="tutorial-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="求籤教學影片"
      @click.self="closeTutorial"
    >
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
  </div>
</template>

<style>
body.mobile-home-open {
  overflow: hidden;
  overscroll-behavior: none;
}
</style>

<style scoped>
.mobile-home {
  --jiang-hong: #a63a3a;
  --jiang-hong-deep: #7a2626;
  --gold: #d4af37;
  --gold-soft: #f2e2b3;
  --gold-line: rgba(212, 175, 55, 0.45);
  --ink: #3a2c22;
  --ink-soft: #5b4635;

  --logo-w: min(74vw, 300px);
  --logo-top: 31%;

  position: fixed;
  inset: 0;
  height: 100dvh;
  overflow: hidden;
  background: #e9dfcb;
  color: var(--ink);
  font-family: 'Noto Serif TC', serif;
  -webkit-font-smoothing: antialiased;
  /* 門扇要有厚度感，整個舞台先給透視 */
  perspective: 900px;
  perspective-origin: 50% 44%;
}
.defs { position: absolute; }

/* ===================== 門後的仙境 ===================== */
.scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.sky {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 60% at 50% 12%, rgba(255, 252, 242, 0.95) 0%, rgba(255, 244, 214, 0.7) 30%, rgba(255, 255, 255, 0) 66%),
    linear-gradient(180deg, #b9d3d8 0%, #cfe0dc 20%, #e6e0cd 44%, #f4e6cc 64%, #fbf6ea 100%);
}
.godlight {
  position: absolute;
  left: 50%;
  top: 2%;
  width: 150vw;
  height: 90vh;
  margin-left: -75vw;
  background: radial-gradient(45% 40% at 50% 22%, rgba(255, 240, 198, 0.95), rgba(255, 236, 186, 0.35) 46%, rgba(255, 255, 255, 0) 74%);
  opacity: 0;
  transition: opacity 1.2s ease 0.5s;
}
.opening .godlight,
.opened .godlight { opacity: 1; animation: breathe 8s ease-in-out 1.6s infinite; }

.peaks {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 16%;
  width: 100%;
  height: 32%;
}
.haze {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.4) 48%, rgba(255, 255, 255, 0) 76%);
}
.haze.h1 { left: -30%; top: 46%; width: 110vw; height: 26vh; animation: drift-a 34s ease-in-out infinite; }
.haze.h2 { right: -34%; top: 62%; width: 120vw; height: 24vh; opacity: 0.82; animation: drift-b 44s ease-in-out infinite; }

.emperor {
  position: absolute;
  left: 50%;
  top: 46%;
  width: min(84vw, 380px);
  transform: translate3d(-50%, -54%, 0) scale(0.92);
  opacity: 0;
  filter: blur(2.4px);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 16%, #000 58%, rgba(0, 0, 0, 0.35) 82%, transparent 96%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 16%, #000 58%, rgba(0, 0, 0, 0.35) 82%, transparent 96%);
}
/* 門完全敞開之後，神明才從遠處的天光裡飛進殿內、緩緩落定；
   落定後接上原本的呼吸式明滅。 */
.opened .emperor {
  animation:
    deity-fly-in 1.7s cubic-bezier(0.18, 0.72, 0.24, 1) 0.15s both,
    emerge 17s ease-in-out 1.85s infinite;
}
.emperor svg { width: 100%; height: auto; display: block; }

.cloudbelt {
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: -6%;
  height: 30vh;
  background:
    radial-gradient(closest-side, rgba(255, 255, 255, 0.95), rgba(255, 250, 235, 0) 76%) -10% 40% / 60% 70% no-repeat,
    radial-gradient(closest-side, rgba(255, 255, 255, 0.9), rgba(255, 250, 235, 0) 74%) 45% 20% / 70% 90% no-repeat,
    radial-gradient(closest-side, rgba(255, 255, 255, 0.95), rgba(255, 250, 235, 0) 76%) 105% 45% / 62% 76% no-repeat;
  animation: drift-a 40s ease-in-out infinite;
}

/* 香爐輕煙 */
.censer {
  position: absolute;
  left: 50%;
  bottom: 30%;
  width: 120px;
  margin-left: -60px;
  opacity: 0;
  transition: opacity 1.1s ease 1.1s;
}
.opening .censer, .opened .censer { opacity: 0.5; }
.censer svg { width: 100%; height: auto; display: block; }
.censer .smoke path {
  stroke-dasharray: 150;
  stroke-dashoffset: 150;
  animation: smoke 7s ease-in-out infinite;
}
.censer .w2 { animation-delay: 1.4s; }
.censer .w3 { animation-delay: 2.8s; }

/* 遠處的仙鶴 */
.flyer {
  position: absolute;
  left: 0;
  width: 96px;
  opacity: 0;
  filter: blur(1.6px) saturate(0.7);
  transition: opacity 1.2s ease 0.8s;
}
.flyer svg { width: 100%; height: auto; display: block; }
.flyer .bob { display: block; }
.flyer.f1 { top: 17%; animation: cross 96s linear -12s infinite; }
.flyer.f2 { top: 30%; width: 74px; animation: cross-back 124s linear -60s infinite; }
.flyer.f2 .bob svg { transform: scaleX(-1); }
.opening .flyer, .opened .flyer { opacity: 0.5; }
.opening .flyer.f2, .opened .flyer.f2 { opacity: 0.36; }
.flyer .bob { animation: bob 7s ease-in-out infinite; }
.flyer.f2 .bob { animation-duration: 8.4s; }

/* 祥雲帶：無縫橫向流動 */
.band {
  position: absolute;
  left: 0;
  width: 200%;
  opacity: 0;
  transition: opacity 1.2s ease 0.7s;
}
.band svg { width: 100%; height: auto; display: block; }
.band-far { bottom: 26%; animation: flow 118s linear infinite; }
.band-near { bottom: -4%; animation: flow 74s linear infinite reverse; }
.opening .band-far, .opened .band-far { opacity: 0.5; }
.opening .band-near, .opened .band-near { opacity: 0.9; }

/* 金色光點 */
.mote {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 244, 205, 1) 0%, rgba(212, 175, 55, 0.85) 40%, rgba(212, 175, 55, 0) 70%);
  animation: rise var(--dur, 20s) linear var(--delay, 0s) infinite;
  opacity: 0;
}
.opening .mote, .opened .mote { animation-play-state: running; }

/* ===================== 門後的內容 ===================== */
.content {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  text-align: center;
  padding: 0 24px calc(48px + env(safe-area-inset-bottom));
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.8s ease 0.95s, transform 0.8s ease 0.95s;
  pointer-events: none;
}
.opening .content,
.opened .content { opacity: 1; transform: none; pointer-events: auto; }
.ascending .content {
  /* 標題要留著被撞碎，所以整層不淡出，只把層級提到玉皇大帝之前 */
  z-index: 7;
  justify-content: center;
}
.ascending .eyebrow,
.ascending .subtitle,
.ascending .actions,
.ascending .tutorial-link {
  animation: hero-out 0.4s ease-in forwards;
}
/* 先愈抖愈兇，0.32 秒被撞上時炸成三截 */
.ascending .title .glyph {
  animation: glyph-shudder 0.32s linear forwards;
}
.ascending .title .glyph:nth-child(2) { animation-delay: 0.02s; }
.ascending .title .glyph:nth-child(3) { animation-delay: 0.04s; }
.ascending .glyph-face { animation: face-out 0.05s linear 0.32s forwards; }
.ascending .shard {
  opacity: 1;
  animation: shard-fly 0.8s cubic-bezier(0.1, 0.72, 0.3, 1) 0.32s forwards;
}
.ascending .glyph .s1 { --fy: -1.05; --fr: -30deg; --fs: 1.3; }
.ascending .glyph .s2 { --fy: 0.08; --fr: 16deg; --fs: 1.45; animation-delay: 0.335s; }
.ascending .glyph .s3 { --fy: 1.05; --fr: -24deg; --fs: 1.3; animation-delay: 0.35s; }
.ascending .glyph:nth-child(1) .shard { --dx: -1.15; }
.ascending .glyph:nth-child(2) .shard { --dx: 0.1; }
.ascending .glyph:nth-child(3) .shard { --dx: 1.15; }
/* 撞擊的瞬間整個畫面震一下 */
.ascending .scene,
.ascending .content {
  animation: screen-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) 0.32s;
}

/* 撞擊白光與衝擊環 */
.break-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(30% 18% at 50% 50%, rgba(255, 255, 255, 0.9), rgba(255, 246, 214, 0.4) 46%, rgba(255, 244, 208, 0) 74%);
  opacity: 0;
  animation: flash 0.36s ease-out 0.32s forwards;
}
.break-wave {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 60vmin;
  height: 60vmin;
  margin: -30vmin 0 0 -30vmin;
  border-radius: 50%;
  border: 2px solid rgba(255, 244, 208, 0.9);
  box-shadow: 0 0 50px rgba(255, 236, 180, 0.7), inset 0 0 40px rgba(255, 240, 195, 0.55);
  opacity: 0;
  animation: break-wave 0.8s cubic-bezier(0.15, 0.7, 0.3, 1) 0.32s forwards;
}

.eyebrow {
  margin: 0 0 14px;
  font-size: 11px;
  letter-spacing: 0.34em;
  text-indent: 0.34em;
  color: var(--ink-soft);
}
.title {
  margin: 0;
  font-size: clamp(52px, 17vw, 80px);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-indent: 0.16em;
  line-height: 1.1;
  color: var(--jiang-hong-deep);
  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.55), 0 16px 38px rgba(122, 38, 38, 0.2);
}
/* 標題三個字各自疊三截碎片，平時隱形，被撞破時才飛出去 */
.title .glyph {
  position: relative;
  display: inline-block;
}
.title .shard {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  pointer-events: none;
  text-shadow: 0 2px 10px rgba(90, 26, 26, 0.45), 0 0 2px rgba(90, 26, 26, 0.5);
  will-change: transform, opacity;
}
.title .s1 { clip-path: polygon(-14% -6%, 114% -6%, 114% 30%, -14% 38%); }
.title .s2 { clip-path: polygon(-14% 38%, 114% 30%, 114% 68%, -14% 74%); }
.title .s3 { clip-path: polygon(-14% 74%, 114% 68%, 114% 114%, -14% 114%); }

.subtitle {
  margin: 14px 0 0;
  font-size: 13px;
  font-weight: 300;
  letter-spacing: 0.24em;
  text-indent: 0.24em;
  color: var(--ink-soft);
}
.actions {
  margin-top: 30px;
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  width: 100%;
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 0.26em;
  text-indent: 0.26em;
  padding: 16px 24px;
  border-radius: 999px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.btn.primary {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  color: var(--gold-soft);
  box-shadow: 0 14px 30px rgba(122, 38, 38, 0.3), inset 0 0 0 1px rgba(242, 226, 179, 0.35);
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--gold-line), 0 10px 22px rgba(120, 90, 50, 0.12);
}
.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.7; }

.tutorial-link {
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  margin-top: 18px;
  font-family: inherit;
  font-size: 12.5px;
  letter-spacing: 0.12em;
  color: rgba(91, 70, 53, 0.78);
  display: inline-flex;
  align-items: center;
  gap: 9px;
}
.play-dot {
  width: 21px;
  height: 21px;
  border-radius: 50%;
  border: 1px solid var(--gold-line);
  background: rgba(255, 255, 255, 0.7);
  position: relative;
  flex: none;
}
.play-dot::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 5.5px;
  border-style: solid;
  border-width: 4.5px 0 4.5px 7px;
  border-color: transparent transparent transparent var(--jiang-hong);
}

/* ===================== 入殿轉場 ===================== */
.ascend {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  overflow: hidden;
}
.ascending .emperor {
  opacity: 1;
  filter: blur(0);
  -webkit-mask-image: none;
  mask-image: none;
  animation: surge 1.5s cubic-bezier(0.42, 0, 0.3, 1) forwards;
  z-index: 4;
}
.puff {
  position: absolute;
  left: 50%;
  top: 48%;
  width: var(--size, 260px);
  height: calc(var(--size, 260px) * 0.66);
  margin-left: calc(var(--size, 260px) / -2);
  margin-top: calc(var(--size, 260px) * -0.33);
  opacity: 0;
  animation: puff-out var(--dur, 1.2s) cubic-bezier(0.22, 0.6, 0.3, 1) var(--delay, 1s) forwards;
}
.puff i {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.95), rgba(255, 252, 240, 0.55) 48%, rgba(255, 248, 228, 0) 78%);
  animation: churn var(--churn, 3s) ease-in-out infinite;
}
.veil {
  position: absolute;
  inset: 0;
  background: radial-gradient(70% 50% at 50% 44%, rgba(255, 250, 232, 1), rgba(255, 240, 202, 0.9) 45%, rgba(246, 222, 178, 0.7) 100%);
  opacity: 0;
  animation: veil-in 0.72s ease-in 1.4s forwards;
}

/* ===================== 教學影片 ===================== */
.tutorial-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 3vh 4vw calc(3vh + env(safe-area-inset-bottom));
  background: rgba(58, 44, 34, 0.66);
  backdrop-filter: blur(6px);
}
.tutorial-box {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: #0d0906;
  box-shadow: 0 20px 50px rgba(40, 26, 14, 0.5), 0 0 0 1px rgba(212, 175, 55, 0.35);
}
.tutorial-video { display: block; width: 100%; max-height: 64vh; background: #0d0906; }
.tutorial-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  color: var(--gold-soft);
  background: rgba(30, 20, 12, 0.7);
}

/* ===================== 動畫 ===================== */
@keyframes breathe {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}
@keyframes deity-fly-in {
  /* 從高處的雲深處遠遠飛來 */
  0% {
    transform: translate3d(-50%, -128%, 0) scale(0.2);
    opacity: 0;
    filter: blur(6px);
  }
  22% { opacity: 0.42; }
  /* 掠過殿門、略微前傾 */
  62% {
    transform: translate3d(-50%, -62%, 0) scale(1.08);
    opacity: 0.5;
    filter: blur(2px);
  }
  /* 回穩落定 */
  100% {
    transform: translate3d(-50%, -56%, 0) scale(1);
    opacity: 0.34;
    filter: blur(2.4px);
  }
}
@keyframes emerge {
  0%, 100% { opacity: 0.24; }
  46% { opacity: 0.5; }
}
@keyframes smoke {
  0% { stroke-dashoffset: 150; opacity: 0; }
  18% { opacity: 0.85; }
  70% { opacity: 0.5; }
  100% { stroke-dashoffset: -40; opacity: 0; }
}
@keyframes cross {
  from { transform: translate3d(-30vw, 0, 0); }
  to { transform: translate3d(130vw, 0, 0); }
}
@keyframes cross-back {
  from { transform: translate3d(130vw, 0, 0); }
  to { transform: translate3d(-30vw, 0, 0); }
}
@keyframes bob {
  0%, 100% { transform: translateY(-8px); }
  50% { transform: translateY(8px); }
}
@keyframes flow {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}
@keyframes rise {
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  14% { opacity: var(--peak, 0.7); }
  80% { opacity: var(--peak, 0.7); }
  100% { transform: translate3d(var(--dx, 20px), -80vh, 0); opacity: 0; }
}
@keyframes drift-a {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(6vw, -1.5vh, 0) scale(1.12); }
}
@keyframes drift-b {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1.08); }
  50% { transform: translate3d(-7vw, 2vh, 0) scale(0.94); }
}
/* 手機上玉皇大帝的底圖本來就接近整個螢幕寬，
   放大倍率要比桌機小得多，否則撞擊當下整片白掉、碎片全被吃掉。 */
@keyframes surge {
  0% { transform: translate3d(-50%, -56%, 0) scale(1); opacity: 0.34; }
  16% { opacity: 0.9; }
  /* 撞上標題：與字同高，還看得見背景 */
  21% { transform: translate3d(-50%, -58%, 0) scale(1.14); opacity: 1; }
  /* 撞破後停一拍，讓碎片在還看得清的背景上飛出去 */
  44% { transform: translate3d(-50%, -57%, 0) scale(1.7); opacity: 1; }
  74% { transform: translate3d(-50%, -55%, 0) scale(3.6); opacity: 1; }
  100% { transform: translate3d(-50%, -52%, 0) scale(6); opacity: 0; filter: blur(10px); }
}
@keyframes hero-out {
  0% { opacity: 1; transform: translate3d(0, 0, 0); }
  100% { opacity: 0; transform: translate3d(0, 20px, 0) scale(0.96); }
}
@keyframes glyph-shudder {
  0% { transform: translate3d(0, 0, 0); }
  20% { transform: translate3d(4px, -2px, 0) rotate(1.2deg); }
  40% { transform: translate3d(-7px, 4px, 0) rotate(-2.4deg) scale(1.03); }
  60% { transform: translate3d(10px, -5px, 0) rotate(3.4deg) scale(1.05); }
  80% { transform: translate3d(-12px, 6px, 0) rotate(-4.2deg) scale(1.08); }
  100% { transform: translate3d(0, 0, 0) scale(1.12); }
}
@keyframes face-out {
  to { opacity: 0; }
}
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
  18% { opacity: 0.8; }
  100% { opacity: 0; }
}
@keyframes break-wave {
  0% { transform: scale(0.12); opacity: 0; border-width: 6px; }
  22% { opacity: 0.95; }
  100% { transform: scale(3.4); opacity: 0; border-width: 1px; }
}
@keyframes screen-shake {
  0%, 100% { transform: translate3d(0, 0, 0); }
  15% { transform: translate3d(-8px, 4px, 0); }
  30% { transform: translate3d(7px, -5px, 0); }
  45% { transform: translate3d(-5px, -3px, 0); }
  60% { transform: translate3d(4px, 3px, 0); }
  80% { transform: translate3d(-2px, 2px, 0); }
}
@keyframes puff-out {
  0% {
    transform: rotate(var(--angle, 0deg)) translateX(0) rotate(calc(var(--angle, 0deg) * -1)) scale(0.3);
    opacity: 0;
  }
  18% { opacity: 0.95; }
  100% {
    transform: rotate(var(--angle, 0deg)) translateX(var(--dist, 34vmax)) rotate(calc(var(--angle, 0deg) * -1)) scale(2.4);
    opacity: 0.92;
  }
}
@keyframes churn {
  0%, 100% { transform: rotate(0deg) scale(1, 1); }
  33% { transform: rotate(13deg) scale(1.16, 0.87); }
  66% { transform: rotate(-10deg) scale(0.89, 1.15); }
}
@keyframes veil-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

/* 螢幕偏矮（橫放）時把內容壓縮 */
@media (max-height: 560px) {
  .eyebrow { display: none; }
  .title { font-size: clamp(40px, 13vh, 62px); }
  .subtitle { margin-top: 10px; }
  .actions { margin-top: 18px; flex-direction: row; max-width: 420px; }
  .tutorial-link { margin-top: 12px; }
  .mobile-home {
    --logo-w: min(40vw, 210px);
    --logo-top: 30%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gate.go .leaf.left, .gate.go .leaf.right,
  .gate.go .seam-light, .gate-hint, .godlight, .haze, .cloudbelt,
  .emperor, .puff, .puff i, .veil, .flyer, .flyer .bob, .band, .mote,
  .censer .smoke path, .title .glyph, .glyph-face, .title .shard,
  .break-flash, .break-wave {
    animation: none !important;
    transition: none !important;
  }
  .opened .emperor { opacity: 0.3; }
}
</style>
