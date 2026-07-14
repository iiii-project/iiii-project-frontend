<script setup lang="ts">
const htmlUrl = new URL('./index.html', import.meta.url).href
</script>

<template>
  <iframe
    class="temple-landing-frame"
    :src="htmlUrl"
    title="籤好運首頁"
    frameborder="0"
  ></iframe>
</template>

<style scoped>
.temple-landing-frame {
  display: block;
  width: 100%;
  height: 100vh;
  border: 0;
  background: #fbf9f5;
}
</style>
