<script setup lang="ts">
/* 掃 QR 取籤頁：/fortune/:sessionId
   先出現一扇廟門（與首頁同一個 TempleGate 元件），推開之後才顯示籤詩。
   後端連不上時仍然要能推門、並給出可讀的說明，不會停在空白畫面。

   手機是這一頁的主場，版面刻意做成「一個畫面就是一支籤」：整頁不捲動，
   上半是古風籤紙（直排、雙紅框、硃印），下半是白話與解籤的分頁，
   只有分頁內容自己在框裡捲。字級由右上角的控制決定（會記住）。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toUserMessage } from '@/api/client'
import { getDivination } from '@/api/divinationApi'
import type { DivinationSession } from '@/types/divination'
import { useFontScale } from '@/utils/fontScale'
import { fortuneShareUrl } from '@/utils/qr'
import AmuletButton from '../components/AmuletButton.vue'
import FontScaleControl from '../components/FontScaleControl.vue'
import FortunePoem from '../components/FortunePoem.vue'
import FortuneReading from '../components/FortuneReading.vue'
import TempleGate from '../components/TempleGate.vue'

const route = useRoute()
const router = useRouter()
const { scaleStyle } = useFontScale()

const sessionId = computed(() => String(route.params.sessionId || ''))
const session = ref<DivinationSession | null>(null)
const loadError = ref('')
const isOpened = ref(false)

/* 手機是「一頁不捲動」的版面，籤紙固定佔掉 220–330px，剩下給解籤的空間就很擠
   （實測 375×812 只剩 378px，字級開大更少）。所以籤紙可以收起來：
   收起時只留一條籤號列，整個下半部都讓給解籤，仍然維持一頁不捲。 */
const paperCollapsed = ref(false)

const fortune = computed(() => session.value?.fortune ?? null)
const interpretation = computed(() => session.value?.interpretation ?? null)

/* 一進頁面就先在背景取資料——使用者還在推門的這 1.5 秒剛好拿來載入，
   門開的時候內容通常已經就緒。 */
async function load() {
  if (!sessionId.value) {
    loadError.value = '網址不完整，找不到這支籤。'
    return
  }
  try {
    session.value = await getDivination(sessionId.value)
  } catch (error) {
    loadError.value = toUserMessage(error)
  }
}

function onGateOpened() {
  isOpened.value = true
}

function togglePaper() {
  paperCollapsed.value = !paperCollapsed.value
}

onMounted(() => {
  document.body.classList.add('fortune-share-open')
  void load()
})

onBeforeUnmount(() => {
  document.body.classList.remove('fortune-share-open')
})
</script>

<template>
  <div class="fortune-share" :class="{ opened: isOpened }" :style="scaleStyle">
    <!-- 背景：與站上其他頁同一套仙境調性 -->
    <div class="sky" aria-hidden="true"></div>
    <div class="godlight" aria-hidden="true"></div>
    <div class="haze h1" aria-hidden="true"></div>
    <div class="haze h2" aria-hidden="true"></div>

    <!-- 右上角字級（籤詩是要讀的，字級交給使用者決定）。門還沒推開時不出現 -->
    <FontScaleControl v-if="fortune && isOpened" />

    <main class="sheet">
      <p class="kicker">籤 詩 請 收</p>

      <template v-if="fortune">
        <FortunePoem
          v-show="!paperCollapsed"
          class="paper"
          :hold="!isOpened"
          :poem="fortune.poem"
          :number="fortune.number"
          :ganzhi="fortune.ganzhi"
          :title="fortune.title"
        />

        <!-- 收起／展開籤紙：解籤讀不夠時把籤紙收成一條，空間全給文字 -->
        <button class="paper-toggle" type="button" :aria-expanded="!paperCollapsed" @click="togglePaper">
          <template v-if="paperCollapsed">
            <span class="mini-no">第 {{ fortune.number }} 籤</span>
            <span v-if="fortune.fortune_level" class="mini-level">{{ fortune.fortune_level }}</span>
            <span class="toggle-hint">展 開 籤 紙 ▼</span>
          </template>
          <span v-else class="toggle-hint">收 起 籤 紙 ▲</span>
        </button>

        <!-- 白話／解籤：分頁，一次讀一段；只有這一塊會在框裡捲動 -->
        <FortuneReading
          class="reading-block"
          :translation="fortune.translation"
          :explanation="fortune.explanation"
          :interpretation="interpretation"
        />
      </template>

      <!-- 取不到資料時仍然給得出交代 -->
      <template v-else-if="loadError">
        <h1 class="fallback-title">籤詩暫時取不回來</h1>
        <p class="lede">{{ loadError }}</p>
        <p class="soft">這支籤仍留在神明那裡，稍後再掃一次就看得到。</p>
      </template>

      <template v-else>
        <p class="lede">正在向神明取回這支籤…</p>
      </template>

      <div class="foot">
        <!-- 平安符：符面依這一支籤而不同，可下載或長按存到相簿 -->
        <AmuletButton
          v-if="fortune"
          class="foot-amulet"
          ghost
          label="平 安 符"
          :data="{
            number: fortune.number,
            ganzhi: fortune.ganzhi,
            level: fortune.fortune_level,
            poem: fortune.poem,
            note: fortune.translation,
            shareUrl: fortuneShareUrl(sessionId)
          }"
        />
        <button class="btn" type="button" @click="router.push('/')">回 首 頁 求 籤</button>
      </div>
    </main>

    <!-- 廟門：與首頁同一扇。推開才見籤 -->
    <TempleGate hint="輕 觸 推 門 取 籤" @opened="onGateOpened" />
  </div>
</template>

<style>
/* 一個畫面就是一支籤：整頁不捲動（要捲的只有解籤那一塊，見 .reading-block） */
body.fortune-share-open {
  overflow: hidden;
  overscroll-behavior: none;
}
</style>

<style scoped>
.fortune-share {
  --jiang-hong: #a63a3a;
  --jiang-hong-deep: #7a2626;
  --gold: #d4af37;
  --gold-line: rgba(212, 175, 55, 0.45);
  --ink: #3a2c22;
  --ink-soft: #5b4635;

  position: relative;
  height: 100dvh;
  overflow: hidden;
  color: var(--ink);
  font-family: 'Noto Serif TC', serif;
  -webkit-font-smoothing: antialiased;
}

.sky {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(120% 60% at 50% 10%, rgba(255, 252, 242, 0.95) 0%, rgba(255, 244, 214, 0.7) 30%, rgba(255, 255, 255, 0) 66%),
    linear-gradient(180deg, #b9d3d8 0%, #cfe0dc 20%, #e6e0cd 44%, #f4e6cc 64%, #fbf6ea 100%);
}
.godlight {
  position: fixed;
  left: 50%;
  top: 0;
  width: 150vw;
  height: 80vh;
  margin-left: -75vw;
  background: radial-gradient(45% 40% at 50% 20%, rgba(255, 240, 198, 0.9), rgba(255, 236, 186, 0.3) 46%, rgba(255, 255, 255, 0) 74%);
}
.haze {
  position: fixed;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.35) 48%, rgba(255, 255, 255, 0) 76%);
}
.haze.h1 { left: -30%; top: 42%; width: 110vw; height: 26vh; }
.haze.h2 { right: -34%; bottom: -6%; width: 120vw; height: 26vh; opacity: 0.85; }

/* 門後的內容：一欄到底、剛好一個畫面高，門開之後才浮上來 */
.sheet {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-width: 560px;
  margin: 0 auto;
  padding: calc(16px + env(safe-area-inset-top)) 18px calc(16px + env(safe-area-inset-bottom));
  /* 一個畫面就是一支籤：超出的部分不准溢到畫面外（要看的長文在 .pane 裡捲） */
  overflow: hidden;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.8s ease 0.15s, transform 0.8s ease 0.15s;
}
.opened .sheet { opacity: 1; transform: none; }

.kicker {
  flex: none;
  margin: 0 0 8px;
  text-align: center;
  font-size: 11.5px;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: var(--gold);
}

/* 籤紙：這一頁的主角，尺寸不壓縮 */
.paper {
  flex: none;
  border-radius: 4px;
  box-shadow: 0 14px 34px rgba(120, 90, 50, 0.16);
}

/* 收起／展開籤紙的那一條。展開時只佔 30px，收起時變成籤號列 */
.paper-toggle {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 34px;
  margin-top: 6px;
  padding: 4px 10px;
  appearance: none;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  background: none;
  font-family: inherit;
  color: rgba(91, 70, 53, 0.6);
}
.paper-toggle[aria-expanded='false'] {
  background: rgba(255, 253, 246, 0.9);
  box-shadow: inset 0 0 0 1px var(--gold-line);
  min-height: 44px;
}
.mini-no {
  font-size: calc(15px * var(--fs, 1));
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--jiang-hong-deep);
}
.mini-level {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: calc(11.5px * var(--fs, 1));
  letter-spacing: 0.12em;
  color: #fdf5e2;
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
}
.toggle-hint {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-indent: 0.24em;
}

/* 解籤區：吃掉剩下的高度，內容自己在框裡捲，整頁不動 */
.reading-block {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 14px;
}
.reading-block :deep(.pane) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.fallback-title {
  margin: 0;
  text-align: center;
  font-size: calc(24px * var(--fs, 1));
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--jiang-hong-deep);
}
.soft { color: rgba(91, 70, 53, 0.7); }
.lede {
  margin: 20px 0 0;
  text-align: center;
  font-size: calc(15px * var(--fs, 1));
  line-height: 2;
  color: var(--ink-soft);
}

/* 底部按鈕列：平安符與回首頁併排，一頁不捲動的前提下省高度 */
.foot {
  flex: none;
  display: flex;
  gap: 8px;
  align-items: stretch;
  max-width: 420px;
  width: 100%;
  margin: 12px auto 0;
}
.foot > * { flex: 1 1 0; min-width: 0; }
.foot-amulet :deep(.amulet-trigger),
.foot :deep(.amulet-trigger) { width: 100%; letter-spacing: 0.14em; text-indent: 0.14em; }

.btn {
  display: block;
  width: 100%;
  margin: 0;
  padding: 14px 24px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13.5px;
  letter-spacing: 0.26em;
  text-indent: 0.26em;
  color: #f2e2b3;
  background: linear-gradient(150deg, var(--jiang-hong), var(--jiang-hong-deep));
  box-shadow: 0 12px 26px rgba(122, 38, 38, 0.26);
}
.btn:active { transform: scale(0.99); }

/* 桌機／平板：不必硬塞成一個畫面，讓內容照正常高度呼吸 */
@media (min-width: 769px) {
  .fortune-share { height: auto; min-height: 100dvh; overflow: visible; }
  .sheet {
    height: auto;
    min-height: 100dvh;
    padding: calc(34px + env(safe-area-inset-top)) 20px calc(40px + env(safe-area-inset-bottom));
  }
  .reading-block :deep(.pane) { overflow: visible; }
  /* 桌機沒有一頁不捲動的限制，籤紙不必收起 */
  .paper-toggle { display: none; }
  .foot { margin-top: 26px; }
}

@media (prefers-reduced-motion: reduce) {
  .sheet { transition: none; opacity: 1; transform: none; }
}
</style>
