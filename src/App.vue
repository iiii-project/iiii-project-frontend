<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isImmersiveRoute = computed(() => route.meta.immersive === true)

watch(
  isImmersiveRoute,
  (isImmersive) => document.body.classList.toggle('is-immersive-route', isImmersive),
  { immediate: true }
)

</script>

<template>
  <template v-if="!isImmersiveRoute">
    <div class="temple-backdrop" aria-hidden="true">
      <div class="temple-vignette"></div>
      <div class="temple-cloud temple-cloud-left"></div>
      <div class="temple-cloud temple-cloud-right"></div>
      <div class="temple-dragon temple-dragon-left"></div>
      <div class="temple-dragon temple-dragon-right"></div>
    </div>
    <header class="app-header">
      <RouterLink class="brand" to="/">AI 求籤互動系統</RouterLink>
      <nav>
        <RouterLink to="/temple-oracle-v17">求籤</RouterLink>
        <RouterLink to="/donation">捐款</RouterLink>
        <RouterLink to="/history">歷史</RouterLink>
      </nav>
    </header>
  </template>
  <main :class="{ 'immersive-main': isImmersiveRoute }">
    <RouterView v-slot="{ Component }">
      <Transition :name="isImmersiveRoute ? '' : 'page-fade'" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
</template>
