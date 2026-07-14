<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const htmlUrl = new URL('./temple_oracle_v17.html', import.meta.url).href
const iframeUrl = computed(() => (route.query.flow === 'quick' ? `${htmlUrl}?flow=quick` : htmlUrl))
</script>

<template>
  <iframe
    class="temple-oracle-v17-frame"
    :src="iframeUrl"
    title="Temple Oracle V17"
    frameborder="0"
  ></iframe>
</template>

<style scoped>
.temple-oracle-v17-frame {
  display: block;
  width: 100%;
  min-height: 100vh;
  border: 0;
  background: #120d0a;
}
</style>
