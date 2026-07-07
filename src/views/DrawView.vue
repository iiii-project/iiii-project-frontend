<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { drawFortune } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import CameraActionPanel from '@/components/camera/CameraActionPanel.vue'
import FortuneTube from '@/components/fortune-stick/FortuneTube.vue'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'
import { triggerRitualEffect } from '@/utils/ritualEffect'

const router = useRouter()
const divination = useDivinationStore()
const progress = ref(0)
const isLoading = ref(false)
const errorMessage = ref('')
const selected = ref(false)

async function draw() {
  if (!divination.sessionId || isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''
  selected.value = true
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    const session = await drawFortune(divination.sessionId)
    divination.status = session.status
    divination.fortune = session.fortune || null
    await triggerRitualEffect('draw', '神明賜籤')
    await router.push('/blocks')
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

function motionDraw() {
  progress.value = 100
  draw()
}
</script>

<template>
  <section class="draw-scene">
    <div class="draw-oracle-card glass-panel">
      <div class="ornament-row">
        <span></span>
        <p class="eyebrow">TAIWAN TEMPLE ORACLE · 六十甲子籤</p>
        <span></span>
      </div>
      <h1>祈願抽籤</h1>
      <div class="hairline"></div>
      <p id="draw-hint" class="notice">
        {{ divination.interactionMode === 'motion' ? '請對著籤筒握拳，上下搖晃' : '點擊搖籤，待光環集滿後請示抽籤' }}
      </p>
    </div>

    <div class="draw-stage">
      <FortuneTube :progress="progress" :shaking="progress > 0 && progress < 100 && !isLoading" :selected="selected" />
    </div>

    <div class="draw-controls glass-panel">
      <div class="button-row">
        <button class="primary-button" type="button" :disabled="isLoading" @click="shakeOnce">
          {{ isLoading ? '抽籤中' : '搖一下' }}
        </button>
        <button class="secondary-button" type="button" :disabled="isLoading" @click="draw">直接抽籤</button>
      </div>
      <StatusMessage :message="errorMessage" tone="error" />
      <CameraActionPanel
        v-if="divination.interactionMode === 'motion'"
        mode="shake"
        label="搖籤動作辨識"
        @armed="selected = true; progress = 100"
        @detected="motionDraw"
        @fallback="divination.interactionMode = 'click'"
      />
    </div>
  </section>
</template>
