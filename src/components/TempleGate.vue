<script setup lang="ts">
/* 共用的廟門元件：首頁與掃碼取籤頁都用這一扇。
   logo 嵌在門縫中央、兩半各自長在門扇裡，所以開門時完全跟著門扇的 3D 變換走。
   門開完會發出 opened 事件，由外層決定要揭曉什麼。 */
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{ hint?: string }>(), { hint: '輕 觸 推 門' })
const emit = defineEmits<{ opening: []; opened: [] }>()

const logoUrl = new URL('../assets/images/logo.png', import.meta.url).href

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── 開門聲：合成的木門（現成音檔授權不明，自己做也好對準動畫）。
   門栓 clack → 轉軸吱呀（窄帶共振 + stick-slip 顆粒）→ 低頻滾動 → 到位悶響。 ── */
const DOOR_REVERB = 2.6
let doorCtx: AudioContext | null = null

function buildRoomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * DOOR_REVERB)
  const preDelay = Math.floor(ctx.sampleRate * 0.03)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      if (i < preDelay) { data[i] = 0; continue }
      const t = (i - preDelay) / (length - preDelay)
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2.2 * (1 - Math.exp(-t * 30))
    }
  }
  return buffer
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function renderDoorSound(ctx: BaseAudioContext, output: AudioNode, now: number) {
  const dry = ctx.createGain()
  dry.gain.value = 0.9
  dry.connect(output)

  const convolver = ctx.createConvolver()
  convolver.buffer = buildRoomImpulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.5
  convolver.connect(wet).connect(output)

  const bus = ctx.createGain()
  bus.gain.value = 0.85
  bus.connect(dry)
  bus.connect(convolver)

  // ① 門栓鬆開
  const clack = ctx.createBufferSource()
  const clackBand = ctx.createBiquadFilter()
  const clackAmp = ctx.createGain()
  clack.buffer = noiseBuffer(ctx, 0.06)
  clackBand.type = 'bandpass'
  clackBand.frequency.value = 1150
  clackBand.Q.value = 2.4
  clackAmp.gain.setValueAtTime(0.9, now)
  clackAmp.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
  clack.connect(clackBand).connect(clackAmp).connect(bus)
  clack.start(now)

  // ② 轉軸吱呀
  const creakSource = ctx.createBufferSource()
  creakSource.buffer = noiseBuffer(ctx, 1.2)
  const creakBand = ctx.createBiquadFilter()
  creakBand.type = 'bandpass'
  creakBand.Q.value = 17
  creakBand.frequency.setValueAtTime(280, now + 0.04)
  creakBand.frequency.exponentialRampToValueAtTime(780, now + 0.92)
  const creakBand2 = ctx.createBiquadFilter()
  creakBand2.type = 'peaking'
  creakBand2.frequency.value = 1600
  creakBand2.Q.value = 6
  creakBand2.gain.value = 8
  const creakAmp = ctx.createGain()
  creakAmp.gain.setValueAtTime(0.0001, now + 0.04)
  creakAmp.gain.exponentialRampToValueAtTime(0.55, now + 0.2)
  creakAmp.gain.setValueAtTime(0.55, now + 0.62)
  creakAmp.gain.exponentialRampToValueAtTime(0.0001, now + 1.05)

  const slip = ctx.createOscillator()
  const slipDepth = ctx.createGain()
  slip.type = 'sawtooth'
  slip.frequency.setValueAtTime(9, now)
  slip.frequency.linearRampToValueAtTime(24, now + 0.95)
  slipDepth.gain.value = 0.3
  slip.connect(slipDepth).connect(creakAmp.gain)
  slip.start(now)
  slip.stop(now + 1.1)

  const creakMakeup = ctx.createGain() // 窄帶濾完能量所剩無幾，補回來
  creakMakeup.gain.value = 14
  creakSource.connect(creakBand).connect(creakBand2).connect(creakMakeup).connect(creakAmp).connect(bus)
  creakSource.start(now + 0.04)

  // ③ 門扇轉動的低頻滾動
  const rumble = ctx.createBufferSource()
  rumble.buffer = noiseBuffer(ctx, 1.4)
  const rumbleLow = ctx.createBiquadFilter()
  rumbleLow.type = 'lowpass'
  rumbleLow.frequency.value = 150
  const rumbleAmp = ctx.createGain()
  rumbleAmp.gain.setValueAtTime(0.0001, now + 0.05)
  rumbleAmp.gain.exponentialRampToValueAtTime(1.6, now + 0.32)
  rumbleAmp.gain.exponentialRampToValueAtTime(0.0001, now + 1.25)
  rumble.connect(rumbleLow).connect(rumbleAmp).connect(bus)
  rumble.start(now + 0.05)

  // ④ 石臼摩擦
  const scrape = ctx.createBufferSource()
  scrape.buffer = noiseBuffer(ctx, 1)
  const scrapeBand = ctx.createBiquadFilter()
  scrapeBand.type = 'bandpass'
  scrapeBand.frequency.value = 2600
  scrapeBand.Q.value = 0.8
  const scrapeAmp = ctx.createGain()
  scrapeAmp.gain.setValueAtTime(0.0001, now + 0.06)
  scrapeAmp.gain.exponentialRampToValueAtTime(0.22, now + 0.35)
  scrapeAmp.gain.exponentialRampToValueAtTime(0.0001, now + 1)
  scrape.connect(scrapeBand).connect(scrapeAmp).connect(bus)
  scrape.start(now + 0.06)

  // ⑤ 到位悶響
  const settle = ctx.createOscillator()
  const settleAmp = ctx.createGain()
  settle.type = 'sine'
  settle.frequency.setValueAtTime(96, now + 1.16)
  settle.frequency.exponentialRampToValueAtTime(62, now + 1.34)
  settleAmp.gain.setValueAtTime(0.0001, now + 1.16)
  settleAmp.gain.exponentialRampToValueAtTime(0.3, now + 1.19)
  settleAmp.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)
  settle.connect(settleAmp).connect(bus)
  settle.start(now + 1.16)
  settle.stop(now + 1.65)
}

function playDoorSound() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    doorCtx = doorCtx ?? new Ctor()
    if (doorCtx.state === 'suspended') void doorCtx.resume()
    renderDoorSound(doorCtx, doorCtx.destination, doorCtx.currentTime)
  } catch {
    // 音效失敗不影響動畫
  }
}

// ── 推門 ──
const isOpening = ref(false)
const isOpen = ref(false)
let openTimer = 0

function openDoor() {
  if (isOpening.value) return
  isOpening.value = true
  emit('opening')
  playDoorSound()
  if (prefersReducedMotion()) {
    isOpen.value = true
    emit('opened')
    return
  }
  openTimer = window.setTimeout(() => {
    isOpen.value = true
    emit('opened')
  }, 1500)
}

defineExpose({ openDoor })

onBeforeUnmount(() => {
  if (openTimer) clearTimeout(openTimer)
  if (doorCtx) {
    const ctx = doorCtx
    doorCtx = null
    // 等殘響散完再關，尾音才不會被切掉
    window.setTimeout(() => void ctx.close(), DOOR_REVERB * 1000 + 500)
  }
})
</script>

<template>
  <div v-if="!isOpen" class="gate" :class="{ go: isOpening }">
    <!-- 門縫透出的神光 -->
    <div class="seam-light" aria-hidden="true"></div>

    <div class="leaf left" aria-hidden="true">
      <div class="leaf-face"><span class="studs"></span><span class="ring"></span></div>
      <!-- logo 左半：直接放在門扇裡，跟著門扇同一個 3D 變換走 -->
      <div class="logo-half">
        <div class="logo-art"><img :src="logoUrl" alt="" /></div>
      </div>
    </div>
    <div class="leaf right" aria-hidden="true">
      <div class="leaf-face"><span class="studs"></span><span class="ring"></span></div>
      <div class="logo-half">
        <div class="logo-art"><img :src="logoUrl" alt="" /></div>
      </div>
    </div>

    <p class="gate-hint">{{ isOpening ? '\u3000' : props.hint }}</p>
    <button class="gate-hit" type="button" :aria-label="props.hint" @click="openDoor"></button>
  </div>
</template>

<style scoped>
/* 門扇需要透視才有立體感；外層若沒給，這裡自己補上 */
.gate {
  --logo-w: min(74vw, 300px);
  --logo-top: 31%;
  perspective: 900px;
  perspective-origin: 50% 44%;
}

/* ===================== 廟門 ===================== */
.gate {
  position: absolute;
  inset: 0;
  z-index: 6;
  transform-style: preserve-3d;
}
.gate-hit {
  position: absolute;
  inset: 0;
  z-index: 3;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.gate.go .gate-hit { pointer-events: none; }

/* 門縫的神光：門一鬆動就從中間迸出來 */
.seam-light {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 3px;
  margin-left: -1.5px;
  background: linear-gradient(180deg, rgba(255, 244, 208, 0) 0%, #fff8e4 22%, #fff8e4 78%, rgba(255, 244, 208, 0) 100%);
  box-shadow: 0 0 30px 8px rgba(255, 238, 190, 0.85);
  opacity: 0;
}
.gate.go .seam-light { animation: seam 1.5s cubic-bezier(0.3, 0.6, 0.3, 1) forwards; }

/* 兩扇門扇：以外緣為軸向外推開 */
.leaf {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50.4%;
  transform-style: preserve-3d;
  will-change: transform;
}
.leaf.left { left: 0; transform-origin: left center; }
.leaf.right { right: 0; transform-origin: right center; }
.gate.go .leaf.left { animation: swing-left 1.5s cubic-bezier(0.42, 0, 0.24, 1) 0.24s forwards; }
.gate.go .leaf.right { animation: swing-right 1.5s cubic-bezier(0.42, 0, 0.24, 1) 0.24s forwards; }

.leaf-face {
  position: absolute;
  inset: 0;
  background:
    /* 門板的直向木紋 */
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.08) 0 1px, rgba(255, 255, 255, 0.05) 1px 3px, rgba(0, 0, 0, 0) 3px 28px),
    linear-gradient(100deg, #591311, #711b17 46%, #4b0e0d);
  box-shadow:
    inset 0 0 90px rgba(40, 10, 8, 0.55),
    inset 0 0 0 10px rgba(212, 175, 55, 0.16);
}
.leaf.left .leaf-face {
  border-right: 2px solid rgba(20, 5, 4, 0.75);
  box-shadow:
    inset 0 0 90px rgba(40, 10, 8, 0.55),
    inset 0 0 0 10px rgba(212, 175, 55, 0.16),
    inset -26px 0 40px -18px rgba(0, 0, 0, 0.75);
}
.leaf.right .leaf-face {
  border-left: 2px solid rgba(20, 5, 4, 0.75);
  box-shadow:
    inset 0 0 90px rgba(40, 10, 8, 0.55),
    inset 0 0 0 10px rgba(212, 175, 55, 0.16),
    inset 26px 0 40px -18px rgba(0, 0, 0, 0.75);
}

/* 門釘：用平鋪的漸層排成整齊的釘陣，不用堆一堆節點 */
.studs {
  position: absolute;
  inset: 12% 14%;
  background-image: radial-gradient(
    circle at 50% 45%,
    #ffeab4 0 2.5px,
    #d9b449 2.5px 5px,
    #8a6412 5px 6.5px,
    rgba(0, 0, 0, 0.28) 6.5px 8px,
    transparent 8.5px
  );
  background-size: 33.4% 12.5%;
  opacity: 0.95;
}

/* 銜環：兩扇各一，離門縫遠一點才不會黏成一坨 */
.ring {
  position: absolute;
  top: 62%;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 5px solid transparent;
  background:
    linear-gradient(#5e1614, #5e1614) padding-box,
    linear-gradient(160deg, #ffeab4, #c9922f 55%, #7a5410) border-box;
  box-shadow: 0 4px 10px rgba(30, 8, 6, 0.45);
}
.ring::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -13px;
  width: 20px;
  height: 16px;
  margin-left: -10px;
  border-radius: 50% 50% 40% 40%;
  background: linear-gradient(160deg, #ffeab4, #c9922f 60%, #7a5410);
}
.leaf.left .ring { right: 15%; }
.leaf.right .ring { left: 15%; }

/* LOGO：兩半分別長在左右門扇裡，因此完全繼承門扇的 3D 旋轉，
   開門時是「門把 logo 撕成兩半帶走」，不會出現各走各的脫節感。 */
.leaf .logo-half {
  position: absolute;
  top: var(--logo-top, 31%);
  z-index: 2;
  width: calc(var(--logo-w, 300px) / 2);
  height: calc(var(--logo-w, 300px) * 1.16);
  transform: translateY(-50%);
  overflow: hidden;
  pointer-events: none;
}
/* 各自貼齊自己那側的門縫 */
.leaf.left .logo-half { right: 0; }
.leaf.right .logo-half { left: 0; }
.logo-art {
  position: absolute;
  top: 0;
  width: var(--logo-w, 300px);
  height: 100%;
}
/* 左扇露出圖的左半、右扇露出右半 */
.leaf.left .logo-art { left: 0; }
.leaf.right .logo-art { right: 0; }

/* 門上的鎏金雕刻：不另外掛匾額（會像貼紙浮在門上），
   而是把 logo 的深紅字樣整體轉成金色，鑲進門板裡。
   sepia→saturate→hue-rotate 會把紅色推成金黃，原本的金色細節則保留下來。 */
.logo-art {
  filter:
    sepia(0.86) saturate(2.1) hue-rotate(-8deg) brightness(1.24) contrast(1.04)
    drop-shadow(0 1.5px 0 rgba(56, 16, 10, 0.75))
    drop-shadow(0 -1px 0 rgba(255, 236, 190, 0.28))
    drop-shadow(0 10px 18px rgba(20, 5, 4, 0.55));
}
/* 雕刻後方的一圈微光，讓金色浮出深紅門板 */
.logo-art::before {
  content: '';
  position: absolute;
  inset: 4%;
  border-radius: 50%;
  background: radial-gradient(
    54% 50% at 50% 50%,
    rgba(255, 226, 160, 0.22),
    rgba(255, 220, 150, 0.1) 55%,
    rgba(255, 220, 150, 0) 78%
  );
}
/* logo 撐滿各自那一半的畫布；本體左右對稱，正好從中線劈開 */
.logo-art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.gate-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(74px + env(safe-area-inset-bottom));
  z-index: 2;
  margin: 0;
  text-align: center;
  font-size: 13px;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: rgba(255, 240, 205, 0.9);
  text-shadow: 0 2px 12px rgba(40, 10, 8, 0.7);
  animation: hint-pulse 2.6s ease-in-out infinite;
}
.gate.go .gate-hint { animation: none; opacity: 0; transition: opacity 0.3s ease; }


@keyframes swing-left {
  0% { transform: rotateY(0deg); }
  10% { transform: rotateY(2.5deg); }
  100% { transform: rotateY(-78deg); }
}
@keyframes swing-right {
  0% { transform: rotateY(0deg); }
  10% { transform: rotateY(-2.5deg); }
  100% { transform: rotateY(78deg); }
}
@keyframes seam {
  0% { opacity: 0; width: 3px; }
  22% { opacity: 1; width: 5px; }
  60% { opacity: 0.85; }
  100% { opacity: 0; width: 3px; }
}
@keyframes hint-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

</style>
