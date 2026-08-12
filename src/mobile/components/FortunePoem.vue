<script setup lang="ts">
/* 籤紙。
   一支籤最重要的就是那四句，所以它不跟白話、解籤擠成一團文字，而是自己一張紙：
   宣紙底、雙紅框、直排右起、句與句之間有界線，吉凶蓋成一枚硃印，干支落在紙腳。
   四句一個字一個字浮出來，讀的人自然會先看這裡。
   句子太長（例如資料塞了白話長句）排不成欄時，自動退回橫排。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fitsVertical, splitPoem } from '@/utils/poem'

const props = withDefaults(
  defineProps<{
    poem?: string | null
    number?: number | string | null
    ganzhi?: string | null
    level?: string | null
    title?: string | null
    /** 外面還沒準備好給人看（例如廟門還沒推開）時先按住，別讓動畫白播 */
    hold?: boolean
  }>(),
  { hold: false }
)

const lines = computed(() => splitPoem(props.poem))
const vertical = computed(() => fitsVertical(lines.value))

/* 逐字浮現的間隔。字多就縮短，整支籤一律在 1.6 秒內落完，
   不讓人為了看完一句而等。 */
const charDelay = computed(() => {
  const total = lines.value.reduce((sum, line) => sum + line.length, 0)
  return total > 0 ? Math.min(70, Math.max(28, Math.round(1600 / total))) : 60
})

function delayFor(lineIndex: number, charIndex: number) {
  const before = lines.value.slice(0, lineIndex).reduce((sum, line) => sum + line.length, 0)
  return `${(before + charIndex) * charDelay.value + 260}ms`
}

/* 直排要先知道最長的一句有幾個字，欄高才能一次給對；
   欄高不足會讓那一句自己折成第二欄（讀起來會變成兩句混在一起）。
   實際高度在 CSS 裡用字級算，這裡只給字數。 */
const longestLine = computed(() => lines.value.reduce((max, line) => Math.max(max, line.length), 0))

/* 紙腳落款：干支 + 籤名。有些籤的 title 本身就以干支開頭（例「己丑　綠柳蒼蒼」），
   那就別再多印一次干支。 */
const showGanzhi = computed(() => {
  const ganzhi = props.ganzhi?.trim()
  if (!ganzhi) return false
  return !props.title?.trim().startsWith(ganzhi)
})

/* 字要在紙真的進到畫面（而且外面沒有按住）之後才落，
   不然掃 QR 進來的人還在推廟門，開門後只會看到已經寫好的字。 */
const seen = ref(false)
const inked = computed(() => seen.value && !props.hold)
const rootEl = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let fallbackTimer = 0

onMounted(() => {
  const el = rootEl.value
  if (!el || typeof IntersectionObserver === 'undefined') {
    seen.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        seen.value = true
        observer?.disconnect()
        observer = null
      }
    },
    { threshold: 0.2 }
  )
  observer.observe(el)
  // 保底：不管觀察到什麼，籤詩不能永遠不顯示
  fallbackTimer = window.setTimeout(() => { seen.value = true }, 6000)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (fallbackTimer) window.clearTimeout(fallbackTimer)
})
</script>

<template>
  <figure ref="rootEl" class="qian-paper" :class="{ inked, vertical }">
    <!-- 雙紅框：外框粗、內框細，老籤紙的樣子 -->
    <span class="frame" aria-hidden="true"></span>

    <header class="paper-head">
      <!-- 籤號與硃印排在同一列：印不是絕對定位疊上去的，所以字級放大時
           兩者只會各自變寬，不會互相壓字。左邊留一格等寬的空位讓籤號居中。 -->
      <div class="head-row">
        <span class="head-spacer" aria-hidden="true"></span>
        <p v-if="number !== null && number !== undefined" class="no">第 {{ number }} 籤</p>
        <!-- 吉凶：蓋一枚硃印，不做成標籤 -->
        <span v-if="level" class="seal">{{ level }}</span>
        <span v-else class="head-spacer" aria-hidden="true"></span>
      </div>
      <p class="rule" aria-hidden="true"><i></i><b>❖</b><i></i></p>
    </header>

    <div class="body" :class="{ vertical }" :style="{ '--poem-cols': longestLine }">
      <!-- cols 這一層是直排的區塊容器：一句一個 block，在 vertical-rl 下
           自然由右往左各成一欄。這裡不能用 flex——vertical-rl 的 flex 主軸
           是「往下」，四句會變成上下疊在同一欄裡。 -->
      <div class="cols">
        <span v-for="(line, li) in lines" :key="li" class="line">
          <span
            v-for="(ch, ci) in Array.from(line)"
            :key="`${li}-${ci}`"
            class="ch"
            :style="{ '--d': delayFor(li, ci) }"
            >{{ ch }}</span
          >
        </span>
      </div>
      <!-- 斷不出句子時（資料異常）也要看得到原文 -->
      <p v-if="!lines.length && poem" class="raw">{{ poem }}</p>
    </div>

    <!-- 紙腳落款：干支與籤名 -->
    <figcaption v-if="showGanzhi || title" class="colophon">
      <span v-if="showGanzhi" class="ganzhi">{{ ganzhi }}</span>
      <span v-if="title" class="title">{{ title }}</span>
    </figcaption>

  </figure>
</template>

<style scoped>
.qian-paper {
  position: relative;
  margin: 0;
  padding: 26px 22px 20px;
  /* 宣紙：暖白底 + 極淡的纖維紋，不用貼圖 */
  background:
    repeating-linear-gradient(90deg, rgba(150, 120, 80, 0.045) 0 1px, rgba(150, 120, 80, 0) 1px 4px),
    repeating-linear-gradient(0deg, rgba(150, 120, 80, 0.035) 0 1px, rgba(150, 120, 80, 0) 1px 5px),
    radial-gradient(120% 90% at 30% 8%, #fffdf6 0%, #fdf7e8 52%, #f7eeda 100%);
  color: var(--jiang-hong-deep, #7a2626);
}

/* 雙紅框 */
.frame {
  position: absolute;
  inset: 8px;
  pointer-events: none;
  border: 1.5px solid rgba(166, 58, 58, 0.42);
  box-shadow: inset 0 0 0 3px rgba(255, 253, 246, 0.9), inset 0 0 0 4px rgba(166, 58, 58, 0.22);
}

/* 吉凶硃印 */
.seal {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--seal, 42px);
  height: var(--seal, 42px);
  padding: 2px;
  border-radius: 3px;
  transform: rotate(-5deg);
  background: linear-gradient(150deg, #b23c39, #8f2726);
  box-shadow: inset 0 0 0 1.5px rgba(255, 245, 225, 0.7), 0 3px 8px rgba(122, 38, 38, 0.28);
  color: #fdf3df;
  font-size: calc(14px * var(--fs, 1));
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.15;
  text-align: center;
  /* 「上籤」兩字上下排，才像印面 */
  writing-mode: vertical-rl;
  text-orientation: upright;
  opacity: 0.94;
}

/* 籤號與分隔線 */
.paper-head {
  text-align: center;
  --seal: calc(40px * var(--fs, 1));
}
.head-row {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 印不要壓到內框線上 */
  padding: 0 6px;
}
.head-spacer {
  flex: none;
  width: var(--seal, 40px);
}
.no {
  flex: 1 1 auto;
  margin: 0;
  font-size: calc(20px * var(--fs, 1));
  font-weight: 700;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  white-space: nowrap;
}
.rule {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 10px auto 0;
  max-width: 78%;
}
.rule i {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(166, 58, 58, 0), rgba(166, 58, 58, 0.4), rgba(166, 58, 58, 0));
}
.rule b {
  font-size: 9px;
  font-weight: 400;
  color: rgba(166, 58, 58, 0.55);
}

/* ── 四句本文 ── */
.body {
  margin-top: 6px;
  text-align: center;
}
.body.vertical {
  margin: 14px 0 4px;
  /* 直排一個字的大小：跟著字級走，但同時被畫面高度封頂。
     手機是「一個畫面一支籤」，字級開到特大也不能把籤紙撐出畫面之外。
     欄高由同一個變數算出來，所以字放大時欄位一定跟著長高，不會切字。 */
  --ch: min(calc(20px * var(--fs, 1)), 3.6dvh);
}
/* 直排的欄位群：inline-block 讓寬度跟著欄數縮放，外層用 text-align 居中。
   欄高＝最長那句的字數 × 單字進距（字級 + 字距）；給足才不會折欄，
   也因為先算好，逐字浮現的過程中版面不會跳。 */
.body.vertical .cols {
  display: inline-block;
  writing-mode: vertical-rl;
  text-orientation: upright;
  /* 欄高＝最長那句的字數 × 單字進距（字身 + 字距）。給足才不會折欄或切字 */
  height: calc(var(--poem-cols, 7) * var(--ch) * 1.2 + 6px);
  text-align: start;
}
.body.vertical .ch { font-size: var(--ch); }
.body.vertical .line {
  display: block;
  padding: 0 9px;
  /* 一句就是一欄，絕不允許自己折到下一欄去 */
  white-space: nowrap;
  /* 界線：句與句之間的細紅線，老籤紙都有 */
  border-left: 1px solid rgba(166, 58, 58, 0.16);
}
.body.vertical .line:first-child { border-right: 1px solid rgba(166, 58, 58, 0.16); }
.body:not(.vertical) .line {
  display: block;
  padding: 0 4px;
}

.ch {
  display: inline-block;
  font-size: calc(20px * var(--fs, 1));
  line-height: 1.85;
  letter-spacing: 0.1em;
  /* 還沒落字：先藏起來，等逐字浮現 */
  opacity: 0;
}
.inked .ch {
  animation: ch-in 0.62s ease-out var(--d, 0ms) both;
}

.raw {
  margin: 0;
  font-size: calc(16px * var(--fs, 1));
  line-height: 2;
  white-space: pre-line;
}

/* 紙腳落款 */
.colophon {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
  color: rgba(122, 38, 38, 0.62);
}
.colophon .ganzhi {
  font-size: calc(12.5px * var(--fs, 1));
  letter-spacing: 0.3em;
  text-indent: 0.3em;
}
.colophon .title {
  font-size: calc(12.5px * var(--fs, 1));
  letter-spacing: 0.16em;
  color: rgba(91, 70, 53, 0.7);
}

@keyframes ch-in {
  0% { opacity: 0; transform: translateY(-3px) scale(1.1); }
  100% { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ch, .inked .ch { animation: none; opacity: 1; transform: none; }
}
</style>
