<script setup lang="ts">
import { useActionDetection } from '@/composables/useActionDetection'
import type { ActionEvent } from '@/types/divination'

const props = defineProps<{
  mode: 'prayer' | 'shake' | 'blocks'
  label: string
}>()

const emit = defineEmits<{
  detected: [event: ActionEvent]
  fallback: []
}>()

const { videoRef, errorMessage, isActive, statusText, start, stop } = useActionDetection(props.mode, (event) => {
  emit('detected', event)
})
</script>

<template>
  <section class="motion-panel" aria-label="動作辨識">
    <video ref="videoRef" class="camera-preview" playsinline muted></video>
    <div class="motion-controls">
      <strong>{{ label }}</strong>
      <span>{{ statusText }}</span>
      <div class="button-row">
        <button class="secondary-button" type="button" :disabled="isActive" @click="start">啟動攝影機</button>
        <button class="ghost-button" type="button" :disabled="!isActive" @click="stop">停止</button>
        <button class="ghost-button" type="button" @click="emit('fallback')">改用點擊</button>
      </div>
      <p v-if="errorMessage" class="field-error">{{ errorMessage }}</p>
    </div>
  </section>
</template>
