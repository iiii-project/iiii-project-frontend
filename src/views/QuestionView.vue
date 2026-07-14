<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createDivination, listFortuneSets } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'
import { useHistoryStore } from '@/stores/historyStore'
import type { Category, FortuneSet } from '@/types/divination'

const router = useRouter()
const divination = useDivinationStore()
const history = useHistoryStore()
const fortuneSets = ref<FortuneSet[]>([])
const isLoading = ref(false)
const errorMessage = ref('')

const categories: Array<{ value: Category; label: string }> = [
  { value: 'love', label: '感情' },
  { value: 'career', label: '工作' },
  { value: 'study', label: '學業' },
  { value: 'wealth', label: '財運' },
  { value: 'health', label: '健康' },
  { value: 'family', label: '家庭' },
  { value: 'relationship', label: '人際關係' },
  { value: 'travel', label: '出行' },
  { value: 'other', label: '其他' }
]

const trimmedQuestion = computed(() => divination.question.trim())
const canSubmit = computed(() => trimmedQuestion.value.length >= 2 && trimmedQuestion.value.length <= 300)

onMounted(async () => {
  try {
    fortuneSets.value = await listFortuneSets()
    divination.fortuneSet = fortuneSets.value.find((set) => set.is_default) || fortuneSets.value[0] || {
      code: 'SIXTY_JIAZI',
      name: '六十甲子籤'
    }
  } catch {
    divination.fortuneSet = { code: 'SIXTY_JIAZI', name: '六十甲子籤' }
  }
})

async function submitQuestion() {
  if (!canSubmit.value || !divination.fortuneSet || isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''
  try {
    const session = await createDivination({
      fortune_set_code: divination.fortuneSet.code,
      question: trimmedQuestion.value,
      category: divination.category,
      categories: [divination.category],
      interaction_mode: divination.interactionMode,
      anonymous_user_id: history.anonymousUserId
    })
    divination.sessionId = session.session_id
    divination.status = session.status
    divination.fortuneSet = session.fortune_set
    await router.push('/prayer')
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <section class="page-shell narrow">
    <p class="eyebrow">輸入問題</p>
    <h1>請留下這次想請教的方向</h1>
    <label>
      求籤主題
      <select v-model="divination.category">
        <option v-for="category in categories" :key="category.value" :value="category.value">
          {{ category.label }}
        </option>
      </select>
    </label>
    <label>
      問題
      <textarea v-model="divination.question" maxlength="300" rows="6" placeholder="例如：我最近是否適合轉換工作？"></textarea>
    </label>
    <div class="form-meta">
      <span>{{ trimmedQuestion.length }}/300</span>
      <span>不建議輸入身分證字號、電話或地址。</span>
    </div>
    <StatusMessage :message="errorMessage" tone="error" />
    <button class="primary-button" type="button" :disabled="!canSubmit || isLoading" @click="submitQuestion">
      {{ isLoading ? '建立中' : '下一步' }}
    </button>
  </section>
</template>
