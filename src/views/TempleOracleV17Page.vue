<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const htmlUrl = new URL('./temple_oracle_v17.html', import.meta.url).href
const iframeUrl = computed(() => (route.query.flow === 'quick' ? `${htmlUrl}?flow=quick` : htmlUrl))
</script>

<template>
  <div class="temple-oracle-page">
    <button class="return-home-button" type="button" @click="router.push('/')">返回首頁</button>
    <iframe
      class="temple-oracle-v17-frame"
      :src="iframeUrl"
      title="Temple Oracle V17"
      frameborder="0"
      allow="camera"
    ></iframe>
  </div>
</template>

<style scoped>
.temple-oracle-page {
  min-height: 100vh;
  position: relative;
}

.temple-oracle-v17-frame {
  display: block;
  width: 100%;
  min-height: 100vh;
  border: 0;
  background: #120d0a;
}

.return-home-button {
  position: fixed;
  top: 20px;
  right: 28px;
  z-index: 30;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid #b33d3c;
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.94);
  box-shadow: 0 5px 16px rgba(83, 52, 30, 0.16);
  color: #922f31;
  cursor: pointer;
  font: 600 13px/1 "Noto Serif TC", serif;
  letter-spacing: 0.12em;
}

.return-home-button:hover {
  background: #922f31;
  color: #fffaf2;
}
</style>
