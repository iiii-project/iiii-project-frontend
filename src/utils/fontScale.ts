/* 籤詩字級：長輩在廟裡看籤，字太小就等於沒給。
   四段字級存在 localStorage，手機掃 QR 開的籤與電腦上的求籤流程共用同一個設定，
   調過一次之後每一支籤都照著走。

   用法：把 scaleStyle 掛在要縮放的容器上，容器內的字級寫成
   calc(15px * var(--fs))，就會跟著這裡的倍率一起放大。 */
import { computed, ref, watch } from 'vue'

export interface FontScaleStep {
  key: string
  /** 按鈕上的字，同時也是給讀屏軟體聽的名稱 */
  label: string
  value: number
}

export const FONT_SCALE_STEPS: FontScaleStep[] = [
  { key: 'sm', label: '小', value: 0.9 },
  { key: 'md', label: '中', value: 1 },
  { key: 'lg', label: '大', value: 1.16 },
  { key: 'xl', label: '特大', value: 1.34 }
]

const DEFAULT_KEY = 'md'
const STORAGE_KEY = 'temple.fortune.fontScale'

function readStored(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && FONT_SCALE_STEPS.some((step) => step.key === saved)) return saved
  } catch {
    /* 無痕模式讀不到 localStorage，用預設值就好 */
  }
  return DEFAULT_KEY
}

// 模組層級的單一狀態：同一個分頁裡的所有籤都共用
const activeKey = ref(readStored())

watch(activeKey, (key) => {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* 寫不進去就算了，不影響當次閱讀 */
  }
})

export function useFontScale() {
  const step = computed(
    () => FONT_SCALE_STEPS.find((item) => item.key === activeKey.value) ?? FONT_SCALE_STEPS[1]
  )
  const scale = computed(() => step.value.value)
  /* 綁在容器上的 CSS 變數。內容字級一律用 calc(..px * var(--fs))，
     版面骨架（間距、圓角）不跟著放大，避免大字級把卡片撐爛。 */
  const scaleStyle = computed(() => ({ '--fs': String(scale.value) }))

  function setScale(key: string) {
    if (FONT_SCALE_STEPS.some((item) => item.key === key)) activeKey.value = key
  }

  /** delta = +1 放大一級、-1 縮小一級，到底就停住 */
  function stepScale(delta: number) {
    const index = FONT_SCALE_STEPS.findIndex((item) => item.key === activeKey.value)
    const next = Math.min(FONT_SCALE_STEPS.length - 1, Math.max(0, index + delta))
    activeKey.value = FONT_SCALE_STEPS[next].key
  }

  return { activeKey, step, scale, scaleStyle, setScale, stepScale, steps: FONT_SCALE_STEPS }
}
