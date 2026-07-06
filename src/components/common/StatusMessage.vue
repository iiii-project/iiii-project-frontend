<script setup lang="ts">
defineProps<{
  message: string
  tone?: 'info' | 'error' | 'success'
}>()
</script>

<template>
  <p v-if="message" class="status-message" :class="tone || 'info'">{{ message }}</p>
</template>
