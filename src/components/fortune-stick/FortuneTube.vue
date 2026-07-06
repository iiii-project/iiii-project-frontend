<script setup lang="ts">
defineProps<{ progress: number; shaking: boolean }>()
</script>

<template>
  <div class="tube-scene" :class="{ shaking }" aria-label="籤筒">
    <div class="sticks">
      <span v-for="index in 8" :key="index"></span>
    </div>
    <div class="tube"></div>
    <progress :value="progress" max="100">{{ progress }}%</progress>
  </div>
</template>
