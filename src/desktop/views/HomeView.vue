
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

// 首頁背景：水墨山水，廟宇立於群山之間、旭日高懸
const heroBackgroundSrc = new URL('../../assets/images/blackground.jpg', import.meta.url).href

// 左右下角祥雲：單張圖已經把兩側雲紋畫在一起、中間留空（見 .corner-clouds 註解）
const cornerCloudsSrc = new URL('../../assets/images/cloud.png', import.meta.url).href

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

/* 背景音樂：進首頁就開始播，播完自動從頭再來，一直循環。
   不用 <audio loop> 的原生硬切，是因為銜接處聽得出喀一聲；改成自己在快播完時
   淡出，ended 事件觸發後歸零重播、再淡入，循環才聽不出接點。 */
const templeMusicUrl = new URL('../../assets/audio/templemusic.mp3', import.meta.url).href
const TEMPLE_MUSIC_VOLUME = 0.5
const MUSIC_FADE_MS = 1800
let templeMusic: HTMLAudioElement | null = null
let musicFadeRaf = 0
let musicFadingOut = false

function fadeAudioVolume(audio: HTMLAudioElement, target: number, duration: number) {
  if (musicFadeRaf) cancelAnimationFrame(musicFadeRaf)
  const start = audio.volume
  const startedAt = performance.now()
  const step = (now: number) => {
    const t = duration > 0 ? Math.min(1, (now - startedAt) / duration) : 1
    audio.volume = start + (target - start) * t
    musicFadeRaf = t < 1 ? requestAnimationFrame(step) : 0
  }
  musicFadeRaf = requestAnimationFrame(step)
}

function primeTempleMusic() {
  if (templeMusic) return
  const audio = new Audio(templeMusicUrl)
  audio.preload = 'auto'
  audio.volume = 0
  templeMusic = audio

  // 快播完時提早淡出，避免循環接點卡一聲
  audio.addEventListener('timeupdate', () => {
    if (!Number.isFinite(audio.duration) || musicFadingOut) return
    const remainingMs = (audio.duration - audio.currentTime) * 1000
    if (remainingMs <= MUSIC_FADE_MS) {
      musicFadingOut = true
      fadeAudioVolume(audio, 0, Math.max(remainingMs, 50))
    }
  })
  audio.addEventListener('ended', () => {
    musicFadingOut = false
    audio.currentTime = 0
    void audio.play().then(() => fadeAudioVolume(audio, TEMPLE_MUSIC_VOLUME, MUSIC_FADE_MS)).catch(() => undefined)
  })
  audio.load()
}

/* 瀏覽器的自動播放政策只允許「已有使用者互動過」的頁面播放有聲音的媒體，
   直接在 mounted 呼叫 play() 十之八九會被擋。先試一次，被拒絕就退而求其次，
   等使用者在頁面上第一次點擊/按鍵，才真的開始播（一樣有淡入，不會突然很大聲）。 */
function startTempleMusic() {
  primeTempleMusic()
  const audio = templeMusic
  if (!audio) return
  audio.volume = 0
  const attempt = audio.play()
  if (attempt && typeof attempt.catch === 'function') {
    attempt
      .then(() => fadeAudioVolume(audio, TEMPLE_MUSIC_VOLUME, MUSIC_FADE_MS))
      .catch(() => {
        const resume = () => {
          void audio.play().then(() => fadeAudioVolume(audio, TEMPLE_MUSIC_VOLUME, MUSIC_FADE_MS)).catch(() => undefined)
        }
        window.addEventListener('pointerdown', resume, { once: true })
        window.addEventListener('keydown', resume, { once: true })
      })
  }
}

function stopTempleMusic() {
  if (musicFadeRaf) cancelAnimationFrame(musicFadeRaf)
  templeMusic?.pause()
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
  startTempleMusic()
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
  stopTempleMusic()
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

    </defs>
    </svg>

    <!-- ============ 舞台 ============ -->
    <div class="stage" aria-hidden="true">
      <div class="layer sky" :style="{ backgroundImage: `url(${heroBackgroundSrc})` }"></div>
      <div class="layer halo-glow"></div>

      <!-- 中央玉皇大帝：站在畫中廟宇與旭日之間的留白處 -->
      <div class="sovereign">
        <span class="sovereign-float">
          <img :src="jadeEmperorSrc" alt="" class="sovereign-img" />
        </span>
      </div>

      <div class="mist m1"></div>
      <div class="mist m2"></div>
      <div class="mist m3"></div>
      <div class="mist m4"></div>

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

      <div class="layer vignette"></div>
      <div class="corner-clouds" :style="{ backgroundImage: `url(${cornerCloudsSrc})` }"></div>
    </div>

    <!-- ============ 主視覺文案 ============ -->
    <main class="celestial-hero">
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

    <!-- 背景音樂版權標示：預設收成一顆小圖示，滑過／focus 到才展開文字，
         平常不佔畫面，但版權資訊仍找得到、點得到 -->
    <div class="music-credit">
      <span class="music-credit-icon" aria-hidden="true">♪</span>
      <span class="music-credit-text">
        <a href="https://breakingcopyright.com/song/neutrin05-timeless" target="_blank" rel="noopener noreferrer">Timeless</a> by Neutrin05
      </span>
    </div>
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

/* 天光：水墨山水背景圖（廟宇立於群山、旭日高懸），實際圖檔由行內 style 帶入 */
/* 錨點貼底：圖上緣本來就留了大片空白天空，寬螢幕裁切時寧可多切天空，
   也要讓廟宇完整留在畫面裡（原本 center 置中在較寬的視窗會把廟頂切掉）。
   inset 蓋回 0（.layer 共用的 -6% 是給舊版視差用的緩衝，天空圖本身不會位移，
   留著只會讓貼底錨點多犧牲 6% 圖高，廟宇還是會被切掉一截） */
.sky {
  inset: 0;
  background-color: #f3e6d2;
  background-repeat: no-repeat;
  background-position: center bottom;
  background-size: cover;
}

/* 佛光：疊在畫中旭日位置上的暈光，加強日光感 */
.halo-glow {
  background: radial-gradient(30% 22% at 50% 34%, rgba(255, 238, 190, 0.5), rgba(255, 232, 170, 0.16) 45%, rgba(255, 255, 255, 0) 72%);
  mix-blend-mode: screen;
  animation: breathe 9s ease-in-out infinite;
}
/* ===================== 中央玉皇大帝 ===================== */
/* 站滿整個「旭日頭頂～廟宇屋脊」的縱深：頭頂貼著太陽上緣、腳貼著廟頂，
   用 vh 定寬（而非 vw）是因為這段縱深是畫作垂直方向上的固定比例，
   跟視窗寬高比脫鉤，才不會在寬螢幕上被拉到跟太陽或屋頂疊在一起 */
.sovereign {
  position: absolute;
  left: 50%;
  top: 44%;
  width: clamp(170px, 30vh, 340px);
  transform: translate3d(-50%, -50%, 0);
  transform-origin: 50% 20%;
  pointer-events: none;
  /* 身形拉這麼大會蓋掉主文案，用低模糊、高不透明維持清楚可見 */
  filter: blur(0.5px);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 5%, #000 95%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 5%, #000 95%, transparent 100%);
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
/* m1／m3 蓋到畫面下半部的廟宇，濃度壓低一點，廟身的細節才看得出來；
   m2／m4 在上半部框山景，維持原本濃度。 */
.mist.m1 { left: -18%; top: 44%; width: 78vw; height: 34vh; animation: mist-a 46s ease-in-out infinite; opacity: 0.45; }
.mist.m2 { right: -22%; top: 36%; width: 86vw; height: 38vh; animation: mist-b 58s ease-in-out infinite; opacity: 0.85; }
.mist.m3 { left: 10%; bottom: -8%; width: 96vw; height: 40vh; animation: mist-a 38s ease-in-out infinite reverse; opacity: 0.35; }
.mist.m4 { right: 4%; top: 8%; width: 52vw; height: 26vh; animation: mist-b 64s ease-in-out infinite reverse; opacity: 0.6; }

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

/* 左右下角祥雲：cloud.png 本身就是「兩側雲紋 + 中間留空」畫在同一張圖上，
   所以直接鋪滿整個舞台寬度、貼底，中間那塊透明的 V 型缺口自然只會露出
   左下、右下兩個三角區的雲紋，不用切兩張圖或自己再切 clip-path。 */
.corner-clouds {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-position: center calc(100% + 80px);
  background-size: 100% auto;
  pointer-events: none;
}

/* ===================== 前景內容 ===================== */
.celestial-hero {
  /* .title 的字級本身就是 clamp() 出來的響應式值，下面 .actions 對齊用的寬度／
     位移是照這個字級等比例算出來的（見 .actions 註解），所以共用同一個變數，
     視窗窄到 .title 字變小時，按鈕排也會跟著等比縮，不會對不上。 */
  --hero-title-fs: clamp(58px, 12vw, 132px);
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
  font-size: var(--hero-title-fs);
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

/* 寬度／位移是照 .title 實測反推的比例算出來的，不是寫死的 px：
   .title 有 text-indent 把「籤」往右推了一截，但「運」那端沒有對應的縮排，
   兩個字的實際墨色範圍在 .title 的幾何置中線上並不對稱——字級 132px（桌機
   常見寬度下 .title 吃到 clamp() 的頂點）時量出來是墨色寬 501.6px、
   整排要再往右挪 21.1px 才會貼齊，換算成字級的倍數正好是 3.8 倍寬、
   0.16 倍位移（0.16 跟 .title 自己的 text-indent 是同一個值，不是巧合）。
   兩邊都用 var(--hero-title-fs) 算，視窗窄到 .title 字變小時兩邊才會一起縮，
   不會像固定 px 那樣只在字級頂到 132px 的寬螢幕才對得上。 */
.actions {
  margin-top: 12px;
  display: flex;
  width: calc(var(--hero-title-fs) * 3.8);
  max-width: 100%;
  transform: translateX(calc(var(--hero-title-fs) * 0.16));
  gap: 18px;
  flex-wrap: wrap;
  justify-content: space-between;
  opacity: 0;
  animation: reveal 1.4s 0.9s ease-out forwards;
}
.btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 17px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  padding: 19px 46px;
  border-radius: 999px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.25s ease, color 0.25s ease;
}
.btn-primary {
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  color: var(--gold-soft);
  box-shadow:
    0 5px 0 #5a1f1f,
    0 14px 34px rgba(122, 38, 38, 0.3),
    inset 0 0 0 2px rgba(242, 226, 179, 0.4);
}
.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow:
    0 8px 0 #5a1f1f,
    0 20px 44px rgba(122, 38, 38, 0.38),
    inset 0 0 0 2px rgba(242, 226, 179, 0.65);
}
.btn-primary:active {
  transform: translateY(3px);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
  box-shadow:
    0 1px 0 #5a1f1f,
    0 4px 10px rgba(122, 38, 38, 0.28),
    inset 0 0 0 2px rgba(242, 226, 179, 0.4);
}
.btn-ghost {
  background: rgba(255, 255, 255, 0.62);
  color: var(--ink);
  box-shadow:
    inset 0 0 0 2px var(--gold-line),
    0 5px 0 rgba(120, 90, 50, 0.28),
    0 10px 26px rgba(120, 90, 50, 0.12);
  backdrop-filter: blur(6px);
}
.btn-ghost:hover {
  transform: translateY(-3px);
  background: rgba(255, 255, 255, 0.86);
  color: var(--jiang-hong);
  box-shadow:
    inset 0 0 0 2px var(--gold-line),
    0 8px 0 rgba(120, 90, 50, 0.32),
    0 16px 34px rgba(120, 90, 50, 0.18);
}
.btn-ghost:active {
  transform: translateY(3px);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
  background: rgba(255, 255, 255, 0.62);
  box-shadow:
    inset 0 0 0 2px var(--gold-line),
    0 1px 0 rgba(120, 90, 50, 0.28),
    0 4px 10px rgba(120, 90, 50, 0.14);
}
.btn:focus-visible {
  outline: 2px solid var(--jiang-hong);
  outline-offset: 3px;
}

/* 教學影片入口 */
.tutorial-link {
  margin-top: 14px;
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

/* 背景音樂版權標示：放右下角、字很小，不搶畫面但需要時看得到、點得到 */
.music-credit {
  position: fixed;
  right: 16px;
  bottom: 12px;
  z-index: 20;
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: rgba(91, 70, 53, 0.55);
  pointer-events: auto;
}
.music-credit a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.music-credit a:hover {
  color: var(--jiang-hong);
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
@keyframes breathe {
  0%, 100% { opacity: 0.82; }
  50% { opacity: 1; }
}
@keyframes ascend {
  0% {
    transform: translate3d(-50%, -50%, 0) scale(1);
    opacity: 0.3;
    filter: blur(2.2px);
  }
  18% {
    opacity: 0.95;
    filter: blur(0.4px);
  }
  /* 撞上標題的瞬間：與字同高，才看得出是祂把字撞碎的 */
  21% {
    transform: translate3d(-50%, -48%, 0) scale(1.15);
    opacity: 1;
    filter: blur(0);
  }
  /* 撞破後先維持一下，讓碎片在還看得清的背景上飛出去 */
  42% {
    transform: translate3d(-50%, -46%, 0) scale(1.9);
    opacity: 1;
    filter: blur(0);
  }
  /* 再一口氣衝滿畫面 */
  72% {
    transform: translate3d(-50%, -43%, 0) scale(3.8);
    opacity: 1;
    filter: blur(0);
  }
  /* 就地化去，雲霧隨後才捲上來 */
  100% {
    transform: translate3d(-50%, -40%, 0) scale(5.8);
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
  0%, 100% { opacity: 0.78; }
  46% { opacity: 1; }
  70% { opacity: 0.88; }
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

/* .actions 對齊 .title 的 3.8 倍寬公式，是照兩顆按鈕「並排不換行」量出來的；
   視窗窄到一個程度（實測約 950–1000px 之間），公式算出的寬度會小於兩顆按鈕
   本身的最小內容寬度，flex-wrap 就會把它們拆成兩行、右邊那顆整個掉位。
   桌機版路由只保證視窗 > 640px（見 src/utils/device.ts），640–1024px 這段
   還是有機會出現，所以在還沒真的窄到需要整排改直式（見下面 640px 那段）之前，
   先在這裡放棄跟標題精準對齊，退回單純置中，讓兩顆按鈕至少不會拆行、不會爆版。 */
@media (max-width: 1024px) {
  .actions {
    width: auto;
    max-width: 480px;
    transform: none;
    justify-content: center;
  }
}

@media (max-width: 640px) {
  .celestial-home {
    /* 手機瀏覽器的網址列會吃掉 100vh，用 dvh 才不會被截 */
    height: 100dvh;
  }
  /* 直式螢幕：玉皇大帝放大一點，站位維持在畫中留白處置中 */
  .sovereign {
    width: min(30vh, 241px);
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
  .tutorial-video { max-height: 74vh; }
}

@media (prefers-reduced-motion: reduce) {
  .mist, .mote, .halo-glow,
  .sovereign, .sovereign-float, .title .glyph,
  .is-ascending, .title .shard, .glyph-face, .puff, .puff .churn,
  .fogbank, .swirl, .break-flash, .break-wave {
    animation: none !important;
  }
  .title .shard { opacity: 0 !important; }
  .sovereign { opacity: 0.32; }
  .celestial-eyebrow, .title, .subtitle, .desc, .actions {
    opacity: 1;
    animation: none;
  }
}
</style>
