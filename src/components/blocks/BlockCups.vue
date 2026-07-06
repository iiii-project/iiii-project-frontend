<script setup lang="ts">
import type { BlockCast } from '@/types/divination'

defineProps<{ cast?: BlockCast | null; casting: boolean }>()
</script>

<template>
  <div class="blocks-scene" :class="{ casting }" aria-label="擲筊結果">
    <div class="block-cup" :class="cast?.block_one || 'idle'">{{ cast?.block_one === 'flat' ? '平' : '凸' }}</div>
    <div class="block-cup" :class="cast?.block_two || 'idle'">{{ cast?.block_two === 'flat' ? '平' : '凸' }}</div>
  </div>
</template>
