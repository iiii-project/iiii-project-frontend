<script setup lang="ts">
/* 白話、神明指點、建議——分頁呈現，一次只讀一段。
   原本是把四段全部往下貼，手機要滑好幾個螢幕，讀的人抓不到重點；
   改成籤詩之下一排分頁，想看哪段點哪段，內容都在同一個位置出現。 */
import { computed, ref, watch } from 'vue'
import MarkdownText from '@/components/MarkdownText.vue'

interface ReadingInterpretation {
  overall_meaning?: string
  relation_to_question?: string
  suggested_actions?: string[]
}

const props = defineProps<{
  /** 籤詩自帶的白話翻譯 */
  translation?: string | null
  /** 籤詩的一般解釋／典故（有就併在白話後面） */
  explanation?: string | null
  interpretation?: ReadingInterpretation | null
  /** AI 解籤還在路上 */
  pending?: boolean
}>()

interface Tab {
  key: string
  label: string
}

const tabs = computed<Tab[]>(() => {
  const list: Tab[] = []
  if (props.translation || props.explanation) list.push({ key: 'plain', label: '白 話' })
  if (props.pending || props.interpretation?.overall_meaning || props.interpretation?.relation_to_question) {
    list.push({ key: 'reading', label: '神明指點' })
  }
  if (props.interpretation?.suggested_actions?.length) list.push({ key: 'actions', label: '可以這樣做' })
  return list
})

const active = ref('')

/* 分頁是跟著資料長出來的（解籤晚 20 秒才回來），所以每次資料變動都要確認
   目前這一頁還在；不在了才換到第一頁，避免把使用者正在讀的段落抽掉。 */
watch(
  tabs,
  (list) => {
    if (!list.length) {
      active.value = ''
      return
    }
    if (!list.some((tab) => tab.key === active.value)) active.value = list[0].key
  },
  { immediate: true }
)
</script>

<template>
  <section v-if="tabs.length" class="reading">
    <div class="tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ on: tab.key === active }"
        type="button"
        role="tab"
        :aria-selected="tab.key === active"
        @click="active = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="pane" role="tabpanel">
      <template v-if="active === 'plain'">
        <MarkdownText v-if="translation" :value="translation" />
        <MarkdownText v-if="explanation" class="soft" :value="explanation" />
      </template>

      <template v-else-if="active === 'reading'">
        <MarkdownText v-if="interpretation?.overall_meaning" :value="interpretation.overall_meaning" />
        <MarkdownText v-if="interpretation?.relation_to_question" class="quote" :value="interpretation.relation_to_question" />
        <p v-if="pending && !interpretation?.overall_meaning" class="waiting">
          <span class="smoke" aria-hidden="true"><i></i><i></i><i></i></span>
          神明正在為你解這支籤，稍待片刻…
        </p>
      </template>

      <template v-else-if="active === 'actions'">
        <ul>
          <li v-for="(item, i) in interpretation?.suggested_actions ?? []" :key="`a${i}`">
            <MarkdownText :value="item" as="span" inline />
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.reading { margin-top: 22px; }

.tabs {
  display: flex;
  gap: 4px;
  /* 分頁列不參與壓縮：外層高度不夠時要壓的是內容區（它自己會捲），
     不然放大字級時整排標籤會被擠扁、字被切掉一半。 */
  flex: none;
  overflow-x: auto;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.35);
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  position: relative;
  /* 標籤本身也不能被壓縮，寧可整排橫向捲動 */
  flex: 0 0 auto;
  min-height: calc(38px * var(--fs, 1));
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 10px 14px 11px;
  font-family: inherit;
  font-size: calc(13px * var(--fs, 1));
  letter-spacing: 0.14em;
  color: rgba(91, 70, 53, 0.62);
  white-space: nowrap;
}
.tab::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--jiang-hong, #a63a3a);
  transform: scaleX(0);
  transition: transform 0.24s ease;
}
.tab.on {
  color: var(--jiang-hong-deep, #7a2626);
  font-weight: 600;
}
.tab.on::after { transform: scaleX(1); }

.pane {
  /* 切換分頁時高度不要抖動 */
  min-height: 120px;
  padding: 16px 2px 0;
  animation: pane-in 0.26s ease-out both;
}
.pane p,
.pane :deep(p),
.pane :deep(h3),
.pane :deep(h4),
.pane :deep(h5) {
  margin: 0 0 12px;
  font-size: calc(14.5px * var(--fs, 1));
  line-height: 2;
  letter-spacing: 0.03em;
  color: var(--ink-soft, #5b4635);
}
.pane :deep(h3),
.pane :deep(h4),
.pane :deep(h5) {
  color: var(--jiang-hong-deep, #7a2626);
  font-weight: 700;
}
.pane .soft,
.pane .soft :deep(*) { color: rgba(91, 70, 53, 0.72); }
.pane .quote {
  padding-left: 12px;
  border-left: 2px solid rgba(212, 175, 55, 0.5);
  color: var(--ink, #3a2c22);
}
.pane ul,
.pane :deep(ul),
.pane :deep(ol) { margin: 0 0 12px; padding-left: 1.25em; }
.pane li,
.pane :deep(li) {
  margin-bottom: 8px;
  font-size: calc(14.5px * var(--fs, 1));
  line-height: 1.95;
  color: var(--ink-soft, #5b4635);
}
.pane :deep(strong) { color: var(--ink, #3a2c22); font-weight: 700; }
.pane :deep(em) { font-style: normal; color: var(--jiang-hong-deep, #7a2626); }
.pane :deep(code) {
  padding: 0.08em 0.35em;
  border-radius: 4px;
  background: rgba(212, 175, 55, 0.14);
  font-family: inherit;
}
.pane :deep(a) { color: var(--jiang-hong-deep, #7a2626); text-underline-offset: 3px; }

/* 等解籤：延用站上香煙裊裊的語彙，不要轉圈圈 */
.waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(91, 70, 53, 0.7) !important;
}
.smoke {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 18px;
}
.smoke i {
  display: block;
  width: 2px;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(180deg, rgba(150, 128, 104, 0), rgba(150, 128, 104, 0.75));
  animation: smoke-rise 1.6s ease-in-out infinite;
}
.smoke i:nth-child(2) { animation-delay: 0.35s; }
.smoke i:nth-child(3) { animation-delay: 0.7s; }

@keyframes pane-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes smoke-rise {
  0%, 100% { opacity: 0.25; transform: scaleY(0.6); }
  50% { opacity: 0.9; transform: scaleY(1); }
}

@media (prefers-reduced-motion: reduce) {
  .pane { animation: none; }
  .smoke i { animation: none; }
}
</style>
