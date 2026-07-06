<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { castBlocks } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import BlockCups from '@/components/blocks/BlockCups.vue'
import CameraActionPanel from '@/components/camera/CameraActionPanel.vue'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'

const router = useRouter()
const divination = useDivinationStore()
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
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}

function restart() {
  divination.reset()
  router.push('/mode')
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
        <button v-if="remainingAttempts <= 0 && !divination.confirmed" class="secondary-button" type="button" @click="restart">
          重新求籤
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
