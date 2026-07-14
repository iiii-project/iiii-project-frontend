<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { castBlocks, completePrayer, createDivination } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import BlockCups from '@/components/blocks/BlockCups.vue'
import CameraActionPanel from '@/components/camera/CameraActionPanel.vue'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { triggerRitualEffect } from '@/utils/ritualEffect'

const router = useRouter()
const divination = useDivinationStore()
const history = useHistoryStore()
const isLoading = ref(false)
const errorMessage = ref('')
const forwarding = ref(false)
const autoMessage = ref('')
const lastCast = computed(() => divination.blockCasts[divination.blockCasts.length - 1] || null)
const remainingAttempts = computed(() => lastCast.value?.remaining_attempts ?? 3)
let autoTimer = 0

async function cast() {
  if (!divination.sessionId || isLoading.value || divination.confirmed || remainingAttempts.value <= 0) return

  window.clearTimeout(autoTimer)
  isLoading.value = true
  errorMessage.value = ''
  autoMessage.value = ''
  try {
    const result = await castBlocks(divination.sessionId)
    divination.blockCasts.push(result)
    divination.confirmed = result.confirmed
    if (result.confirmed) {
      divination.status = 'confirmed'
      forwarding.value = true
      await triggerRitualEffect('sheng', '聖筊允准')
      await router.push('/interpretation')
    }
    if (!result.confirmed && result.remaining_attempts <= 0) {
      divination.status = 'rejected'
      autoMessage.value = '三次未得聖筊，將回到抽籤。'
      await triggerRitualEffect('reject', '重新求籤')
      isLoading.value = false
      await redraw()
    } else if (!result.confirmed) {
      autoMessage.value = '尚未取得聖筊，將自動再次擲筊。'
      await triggerRitualEffect('retry', '再請示一次')
      isLoading.value = false
      await cast()
    }
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function redraw() {
  if (isLoading.value) return
  window.clearTimeout(autoTimer)
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
      categories: divination.categories?.length ? divination.categories : [divination.category],
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

onBeforeUnmount(() => window.clearTimeout(autoTimer))
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
      <StatusMessage v-if="autoMessage" :message="autoMessage" tone="info" />
      <StatusMessage v-if="forwarding" message="聖筊已確認，正在進入 AI 解籤。" tone="success" />
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
