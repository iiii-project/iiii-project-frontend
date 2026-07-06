<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useDivinationStore } from '@/stores/divinationStore'
import type { InteractionMode } from '@/types/divination'

const router = useRouter()
const divination = useDivinationStore()

function chooseMode(mode: InteractionMode) {
  divination.interactionMode = mode
  router.push('/question')
}
</script>

<template>
  <section class="page-shell">
    <p class="eyebrow">操作模式</p>
    <h1>選擇求籤方式</h1>
    <div class="choice-grid">
      <button class="choice-tile" type="button" @click="chooseMode('click')">
        <strong>點擊模式</strong>
        <span>使用滑鼠或觸控完成燒香、搖籤與擲筊。</span>
      </button>
      <button class="choice-tile" type="button" @click="chooseMode('motion')">
        <strong>動作辨識模式</strong>
        <span>使用攝影機辨識合十、搖籤與擲筊動作，並保留點擊備援。</span>
      </button>
    </div>
  </section>
</template>
