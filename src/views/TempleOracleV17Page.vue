<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const iframeUrl = computed(() => {
  const url = new URL('./temple_oracle_v17.html', import.meta.url)
  const flow = route.query.flow
  const mode = route.query.mode
  const session = route.query.session
  const share = route.query.share

  if (typeof flow === 'string') url.searchParams.set('flow', flow)
  if (typeof mode === 'string') url.searchParams.set('mode', mode)
  if (typeof session === 'string') url.searchParams.set('session', session)
  if (typeof share === 'string') url.searchParams.set('share', share)

  return url.href
})
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

@media (max-width: 767px) {
  .temple-oracle-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #fffdf8;
  }

  .return-home-button {
    position: static;
    flex: 0 0 auto;
    align-self: flex-end;
    margin: 12px 16px;
  }

  .temple-oracle-v17-frame {
    min-height: 0;
    height: calc(100dvh - 68px);
    flex: 1 1 auto;
  }
}
</style>
