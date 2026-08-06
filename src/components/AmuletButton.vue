<script setup lang="ts">
/* 「生成專屬平安符」按鈕 + 預覽彈窗 + 下載。
   符面由 utils/amulet 依這一支籤畫出來（吉凶決定配色與印文、籤號決定色相／雲紋／
   八卦轉向與印章做舊），所以每支籤的符都不一樣，而同一支籤永遠是同一張。

   手機上長按圖片就能存到相簿；桌機用下面的下載鈕（a[download]）。 */
import { ref } from 'vue'
import { amuletFileName, renderAmulet, type AmuletData } from '@/utils/amulet'

const props = defineProps<{
  data: AmuletData
  /** 次要樣式（放在以主要動作為主的按鈕列裡時用） */
  ghost?: boolean
  label?: string
}>()

const open = ref(false)
const isRendering = ref(false)
const dataUrl = ref('')
const errorMessage = ref('')

async function generate() {
  open.value = true
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

function close() {
  open.value = false
}
</script>

<template>
  <button class="amulet-trigger" :class="{ ghost }" type="button" @click="generate">
    <span class="amulet-glyph" aria-hidden="true">🧿</span>
    {{ label ?? '生成專屬平安符' }}
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

<style scoped>
.amulet-trigger {
  appearance: none;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 13px 22px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13.5px;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  color: #f2e2b3;
  background: linear-gradient(150deg, #b8863b, #8a5a1f);
  box-shadow: 0 12px 26px rgba(122, 80, 20, 0.24);
  transition: transform 0.2s ease;
}
.amulet-trigger.ghost {
  color: #7a5410;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.55);
}
.amulet-trigger:hover { transform: translateY(-1px); }
.amulet-glyph { font-size: 15px; text-indent: 0; }

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
  font-size: 11.5px;
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
  font-size: 11.5px;
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
