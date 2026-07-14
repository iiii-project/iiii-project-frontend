<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RITUAL_EFFECT_MS, type RitualEffectKind } from '@/utils/ritualEffect'

const route = useRoute()
const isImmersiveRoute = computed(() => route.meta.immersive === true)

watch(
  isImmersiveRoute,
  (isImmersive) => document.body.classList.toggle('is-immersive-route', isImmersive),
  { immediate: true }
)

const effectKind = ref<RitualEffectKind>('draw')
const effectText = ref('')
const showingEffect = ref(false)
let effectTimer = 0

function onRitualEffect(event: Event) {
  const detail = (event as CustomEvent<{ kind: RitualEffectKind; text: string }>).detail
  effectKind.value = detail.kind
  effectText.value = detail.text
  showingEffect.value = true
  window.clearTimeout(effectTimer)
  effectTimer = window.setTimeout(() => {
    showingEffect.value = false
  }, RITUAL_EFFECT_MS[detail.kind])
}

window.addEventListener('ritual-effect', onRitualEffect)

onBeforeUnmount(() => {
  window.clearTimeout(effectTimer)
  window.removeEventListener('ritual-effect', onRitualEffect)
  document.body.classList.remove('is-immersive-route')
})
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
  <Transition name="ritual-gate">
    <div v-if="showingEffect && !isImmersiveRoute" class="ritual-effect" :class="`is-${effectKind}`" aria-hidden="true">
      <div class="effect-flash"></div>
      <div class="effect-ring"></div>
      <div class="effect-rays"></div>
      <span v-for="i in 18" :key="i" class="effect-ash" :style="{ '--i': i }"></span>
      <p>{{ effectText }}</p>
    </div>
  </Transition>
</template>
