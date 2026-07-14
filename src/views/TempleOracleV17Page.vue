<script setup lang="ts">
const htmlUrl = new URL('./temple_oracle_v17.html', import.meta.url).href
</script>

<template>
  <iframe
    class="temple-oracle-v17-frame"
    :src="htmlUrl"
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
