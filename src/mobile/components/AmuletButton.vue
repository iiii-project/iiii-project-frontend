<script setup lang="ts">
/* 「生成專屬平安符」按鈕 + 預覽彈窗 + 下載。
   符面由 utils/amulet 依這一支籤畫出來（吉凶決定配色與印文、籤號決定色相／雲紋／
   八卦轉向與印章做舊），所以每支籤的符都不一樣，而同一支籤永遠是同一張。

   手機上長按圖片就能存到相簿；桌機用下面的下載鈕（a[download]）。 */
import { onMounted, ref } from 'vue'
import { amuletFileName, renderAmulet, type AmuletData } from '@/utils/amulet'

const props = defineProps<{
  data: AmuletData
  /** 次要樣式（放在以主要動作為主的按鈕列裡時用） */
  ghost?: boolean
  label?: string
  /* 直接把符顯示出來（不用再按按鈕開彈窗），用在「帶回家」這種本來就是
     衝著平安符來的頁面——例如解籤結果頁，一進分頁就先把符畫出來，
     長按圖片就能存，比多一次點擊再等彈窗少一個步驟。 */
  inline?: boolean
}>()

const open = ref(false)
const isRendering = ref(false)
const dataUrl = ref('')
const errorMessage = ref('')

async function generate() {
  errorMessage.value = ''
  if (dataUrl.value) return // 同一支籤畫過就不必再畫
  isRendering.value = true
  try {
    dataUrl.value = await renderAmulet(props.data)
    if (!dataUrl.value) errorMessage.value = '這個瀏覽器沒辦法產生平安符圖檔，換一個瀏覽器再試一次。'
  } catch {
    errorMessage.value = '平安符產生失敗，請再試一次。'
  } finally {
    isRendering.value = false
  }
}

function openModal() {
  open.value = true
  void generate()
}

function close() {
  open.value = false
}

if (props.inline) {
  onMounted(() => void generate())
}
</script>

<template>
  <div v-if="inline" class="amulet-inline">
    <div class="amulet-stage">
      <img v-if="dataUrl" :src="dataUrl" class="amulet-img" alt="數位平安符" />
      <p v-else-if="isRendering" class="amulet-wait">正在為你開符…</p>
      <p v-else-if="errorMessage" class="amulet-error">{{ errorMessage }}</p>
    </div>
    <a
      v-if="dataUrl"
      class="amulet-btn primary"
      :href="dataUrl"
      :download="amuletFileName(props.data)"
    >
      下 載 平 安 符
    </a>
  </div>

  <template v-else>
    <button class="amulet-trigger" :class="{ ghost }" type="button" @click="openModal">
      <!-- 小硃印記號：比 emoji 收斂，也跟站上的印章語彙一致 -->
      <svg class="amulet-mark" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="1.6" />
        <path d="M8 4.4v7.2M5.2 7.2h5.6" />
      </svg>
      {{ label ?? '求 平 安 符' }}
    </button>

    <Teleport to="body">
      <div v-if="open" class="amulet-modal" role="dialog" aria-modal="true" aria-label="數位平安符" @click.self="close">
        <div class="amulet-box">
          <p class="amulet-kicker">數 位 平 安 符</p>

          <div class="amulet-stage">
            <img v-if="dataUrl" :src="dataUrl" class="amulet-img" alt="數位平安符" />
            <p v-else-if="isRendering" class="amulet-wait">正在為你開符…</p>
            <p v-else-if="errorMessage" class="amulet-error">{{ errorMessage }}</p>
          </div>

          <p class="amulet-hint">手機可長按圖片存到相簿，或用下面的按鈕下載。</p>

          <div class="amulet-actions">
            <a
              v-if="dataUrl"
              class="amulet-btn primary"
              :href="dataUrl"
              :download="amuletFileName(props.data)"
            >
              下 載 平 安 符
            </a>
            <button class="amulet-btn" type="button" @click="close">關　閉</button>
          </div>
        </div>
      </div>
    </Teleport>
  </template>
</template>

<style scoped>
.amulet-trigger {
  appearance: none;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: auto;
  min-height: 40px;
  padding: 9px 18px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 12.5px;
  letter-spacing: 0.16em;
  text-indent: 0.16em;
  color: #7a5410;
  background: rgba(255, 253, 246, 0.9);
  box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.6);
  transition: transform 0.2s ease, background 0.2s ease;
}
.amulet-trigger:hover { background: rgba(212, 175, 55, 0.16); transform: translateY(-1px); }
/* ghost 是給「已經有一排主要按鈕」的地方用的，更淡一階 */
.amulet-trigger.ghost {
  background: rgba(255, 255, 255, 0.7);
  box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.45);
}
.amulet-mark {
  width: 13px;
  height: 13px;
  flex: none;
  text-indent: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  opacity: 0.75;
}

/* ── inline 模式：直接畫在「帶回家」分頁裡，不開彈窗 ── */
.amulet-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.amulet-inline .amulet-stage { min-height: 120px; }
.amulet-inline .amulet-img {
  max-width: min(64vw, 240px);
  max-height: 48vh;
  box-shadow: 0 14px 34px rgba(120, 60, 40, 0.22);
}
.amulet-inline .amulet-btn {
  flex: none;
  width: 100%;
  max-width: 260px;
  /* 這顆 <a> 現在是「帶回家」分頁裡的一般子節點（inline 模式不再靠 Teleport
     搬到 body 外），FortuneReading.vue 給 markdown 連結用的 .pane :deep(a)
     顏色規則因為多一層 a 型別選擇器，特異度會贏過上面單純的 .amulet-btn，
     蓋成籤紅字看不清楚——這裡用 .amulet-inline .amulet-btn 兩個 class
     把特異度拉高蓋回來。 */
  color: #f2e2b3;
}

/* ── 預覽彈窗 ── */
.amulet-modal {
  position: fixed;
  inset: 0;
  z-index: 96;
  display: grid;
  place-items: center;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  background: rgba(10, 7, 6, 0.9);
  backdrop-filter: blur(6px);
  animation: amulet-in 0.24s ease-out both;
}
.amulet-box {
  width: 100%;
  max-width: 420px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  overflow-y: auto;
  font-family: 'Noto Serif TC', serif;
  text-align: center;
}
.amulet-kicker {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: rgba(242, 226, 179, 0.8);
}
.amulet-stage {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 180px;
}
.amulet-img {
  display: block;
  width: auto;
  max-width: min(76vw, 320px);
  max-height: 62dvh;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}
.amulet-wait,
.amulet-error {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
  letter-spacing: 0.12em;
  color: rgba(242, 226, 179, 0.85);
}
.amulet-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: rgba(242, 226, 179, 0.55);
}

.amulet-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
}
.amulet-btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  flex: 1;
  min-width: 130px;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 18px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.2em;
  text-indent: 0.2em;
  text-decoration: none;
  color: #f2e2b3;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.5);
}
.amulet-btn.primary {
  background: linear-gradient(150deg, #a63a3a, #7a2626);
  box-shadow: 0 12px 26px rgba(122, 38, 38, 0.32);
}

@keyframes amulet-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (hover: none) {
  .amulet-trigger:hover { transform: none; }
  .amulet-trigger:active { transform: scale(0.99); }
}
@media (prefers-reduced-motion: reduce) {
  .amulet-modal { animation: none; }
}
</style>
