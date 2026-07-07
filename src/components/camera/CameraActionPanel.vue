<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useActionDetection } from '@/composables/useActionDetection'
import { useCameraStore } from '@/stores/cameraStore'
import type { ActionEvent } from '@/types/divination'

const props = defineProps<{
  mode: 'prayer' | 'shake' | 'blocks'
  label: string
}>()

const emit = defineEmits<{
  detected: [event: ActionEvent]
  fallback: []
  armed: []
}>()

const cameraStore = useCameraStore()
const { videoRef, errorMessage, isActive, statusText, marker, start, stop } = useActionDetection(props.mode, (event) => {
  emit('detected', event)
})

onMounted(() => {
  start()
})

const pinchLineStyle = computed(() => {
  const dx = marker.value.index.x - marker.value.thumb.x
  const dy = marker.value.index.y - marker.value.thumb.y
  return {
    left: `${marker.value.thumb.x}vw`,
    top: `${marker.value.thumb.y}vh`,
    width: `${Math.hypot(dx, dy)}vmax`,
    transform: `rotate(${Math.atan2(dy, dx)}rad)`
  }
})

watch(
  () => marker.value.targetVisible,
  (visible) => {
    if (visible) emit('armed')
  }
)
</script>

<template>
  <Teleport to="body">
    <video ref="videoRef" class="camera-preview" :class="{ active: isActive }" playsinline muted></video>
    <div class="camera-vignette" :class="{ active: isActive }" aria-hidden="true"></div>
    <div
      v-if="marker.targetVisible"
      class="gesture-target"
      :class="{ aligned: marker.aligned }"
      :style="{ left: `${marker.target.x}vw`, top: `${marker.target.y}vh` }"
      aria-hidden="true"
    ></div>
    <template v-if="marker.visible">
      <div class="fingertip-marker" :style="{ left: `${marker.thumb.x}vw`, top: `${marker.thumb.y}vh` }" aria-hidden="true"></div>
      <div class="fingertip-marker" :style="{ left: `${marker.index.x}vw`, top: `${marker.index.y}vh` }" aria-hidden="true"></div>
      <div class="pinch-line" :style="pinchLineStyle" aria-hidden="true"></div>
    </template>
  </Teleport>
  <section class="motion-panel" :class="{ active: isActive }" aria-label="動作辨識">
    <div class="motion-controls">
      <strong>{{ label }}</strong>
      <span>{{ statusText }}</span>
      <div class="button-row">
        <button class="secondary-button" type="button" :disabled="isActive" @click="start">
          {{ cameraStore.permissionStatus === 'granted' ? '重新啟動' : '啟動攝影機' }}
        </button>
        <button class="ghost-button" type="button" :disabled="!isActive" @click="stop">停止</button>
        <button class="ghost-button" type="button" @click="emit('fallback')">改用點擊</button>
      </div>
      <p v-if="errorMessage" class="field-error">{{ errorMessage }}</p>
    </div>
  </section>
</template>
