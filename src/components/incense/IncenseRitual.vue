<script setup lang="ts">
defineProps<{ active: boolean }>()
</script>

<template>
  <div class="incense-scene" aria-label="燒香互動">
    <div class="smoke" :class="{ active }"></div>
    <div class="incense-stick" :class="{ active }"></div>
    <div class="burner"></div>
  </div>
</template>
