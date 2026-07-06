<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { drawFortune } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import CameraActionPanel from '@/components/camera/CameraActionPanel.vue'
import FortuneTube from '@/components/fortune-stick/FortuneTube.vue'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'

const router = useRouter()
const divination = useDivinationStore()
const progress = ref(0)
const isLoading = ref(false)
const errorMessage = ref('')

async function draw() {
  if (!divination.sessionId || isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''
  try {
    const session = await drawFortune(divination.sessionId)
    divination.status = session.status
    divination.fortune = session.fortune || null
    await router.push('/fortune')
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}

function shakeOnce() {
  if (isLoading.value) return
  progress.value = Math.min(100, progress.value + 20)
  if (progress.value >= 100) draw()
}
</script>

<template>
  <section class="page-shell split">
    <div>
      <p class="eyebrow">搖籤</p>
      <h1>搖動籤筒，等待籤支落下</h1>
      <p class="notice">前端只累積搖籤進度；抽中的籤詩由後端決定。</p>
      <div class="button-row">
        <button class="primary-button" type="button" :disabled="isLoading" @click="shakeOnce">
          {{ isLoading ? '抽籤中' : '搖一下' }}
        </button>
        <button class="secondary-button" type="button" :disabled="isLoading" @click="draw">直接抽籤</button>
      </div>
      <StatusMessage :message="errorMessage" tone="error" />
    </div>
    <div>
      <FortuneTube :progress="progress" :shaking="progress > 0 && progress < 100" />
      <CameraActionPanel
        v-if="divination.interactionMode === 'motion'"
        mode="shake"
        label="搖籤動作辨識"
        @detected="draw"
        @fallback="divination.interactionMode = 'click'"
      />
    </div>
  </section>
</template>
