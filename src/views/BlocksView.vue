<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { castBlocks, completePrayer, createDivination } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import BlockCups from '@/components/blocks/BlockCups.vue'
import CameraActionPanel from '@/components/camera/CameraActionPanel.vue'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'
import { useHistoryStore } from '@/stores/historyStore'

const router = useRouter()
const divination = useDivinationStore()
const history = useHistoryStore()
const isLoading = ref(false)
const errorMessage = ref('')
const lastCast = computed(() => divination.blockCasts[divination.blockCasts.length - 1] || null)
const remainingAttempts = computed(() => lastCast.value?.remaining_attempts ?? 3)

async function cast() {
  if (!divination.sessionId || isLoading.value || divination.confirmed || remainingAttempts.value <= 0) return

  isLoading.value = true
  errorMessage.value = ''
  try {
    const result = await castBlocks(divination.sessionId)
    divination.blockCasts.push(result)
    divination.confirmed = result.confirmed
    if (result.confirmed) divination.status = 'confirmed'
    if (!result.confirmed && result.remaining_attempts <= 0) divination.status = 'rejected'
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function redraw() {
  if (isLoading.value) return
  if (!divination.question || !divination.fortuneSet) {
    await router.push('/question')
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    const session = await createDivination({
      fortune_set_code: divination.fortuneSet.code,
      question: divination.question,
      category: divination.category,
      interaction_mode: divination.interactionMode,
      anonymous_user_id: history.anonymousUserId
    })
    const drawingSession = await completePrayer(session.session_id)
    divination.sessionId = drawingSession.session_id
    divination.status = drawingSession.status
    divination.fortuneSet = drawingSession.fortune_set
    divination.fortune = null
    divination.blockCasts = []
    divination.confirmed = false
    divination.interpretation = null
    await router.push('/draw')
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <section class="page-shell split">
    <div>
      <p class="eyebrow">擲筊確認</p>
      <h1>請擲筊確認這支籤</h1>
      <p class="notice">剩餘次數：{{ remainingAttempts }}</p>
      <div class="button-row">
        <button class="primary-button" type="button" :disabled="isLoading || divination.confirmed" @click="cast">
          {{ isLoading ? '擲筊中' : '擲筊' }}
        </button>
        <RouterLink v-if="divination.confirmed" class="secondary-button" to="/interpretation">查看 AI 解籤</RouterLink>
        <button v-if="remainingAttempts <= 0 && !divination.confirmed" class="secondary-button" type="button" @click="redraw">
          回到抽籤
        </button>
      </div>
      <StatusMessage
        v-if="lastCast"
        :message="`${lastCast.result_name}：${lastCast.confirmed ? '已取得聖筊，可進入 AI 解籤。' : '尚未確認，可再次擲筊。'}`"
        :tone="lastCast.confirmed ? 'success' : 'info'"
      />
      <StatusMessage :message="errorMessage" tone="error" />
    </div>
    <div>
      <BlockCups :cast="lastCast" :casting="isLoading" />
      <CameraActionPanel
        v-if="divination.interactionMode === 'motion' && !divination.confirmed"
        mode="blocks"
        label="擲筊動作辨識"
        @detected="cast"
        @fallback="divination.interactionMode = 'click'"
      />
    </div>
  </section>
</template>
