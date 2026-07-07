<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { completePrayer } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import CameraActionPanel from '@/components/camera/CameraActionPanel.vue'
import IncenseRitual from '@/components/incense/IncenseRitual.vue'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'
import { triggerRitualEffect } from '@/utils/ritualEffect'

const router = useRouter()
const divination = useDivinationStore()
const lit = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')

async function finishPrayer() {
  if (isLoading.value) return
  if (!divination.sessionId) {
    errorMessage.value = '尚未建立求籤工作階段，請先回到問題頁送出問題。'
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    const session = await completePrayer(divination.sessionId)
    divination.status = session.status
    await triggerRitualEffect('prayer', '香火已成')
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
      <p class="eyebrow">燒香祈求</p>
      <h1>點香後，靜心完成祈求</h1>
      <p class="notice">動作辨識模式會等待雙手合十維持約 2 秒；點擊模式可直接完成。</p>
      <div class="button-row">
        <button class="secondary-button" type="button" @click="lit = true">點燃香</button>
        <button class="primary-button" type="button" :disabled="!lit || isLoading" @click="finishPrayer">
          {{ isLoading ? '送出中' : '祈求完成' }}
        </button>
      </div>
      <StatusMessage :message="errorMessage" tone="error" />
      <RouterLink v-if="errorMessage && !divination.sessionId" class="ghost-button" to="/question">
        回到問題頁
      </RouterLink>
    </div>
    <div>
      <IncenseRitual :active="lit" />
      <CameraActionPanel
        v-if="divination.interactionMode === 'motion'"
        mode="prayer"
        label="雙手合十辨識"
        @detected="finishPrayer"
        @fallback="divination.interactionMode = 'click'"
      />
    </div>
  </section>
</template>
