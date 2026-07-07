<script setup lang="ts">
import type { BlockCast } from '@/types/divination'

defineProps<{ cast?: BlockCast | null; casting: boolean }>()
</script>

<template>
  <div class="blocks-scene" :class="[{ casting }, cast?.result ? `result-${cast.result}` : '']" aria-label="擲筊結果">
    <div :key="`${cast?.attempt_number || 0}-one`" class="block-cup" :class="cast?.block_one || 'idle'">{{ cast?.block_one === 'flat' ? '平' : '凸' }}</div>
    <div :key="`${cast?.attempt_number || 0}-two`" class="block-cup" :class="cast?.block_two || 'idle'">{{ cast?.block_two === 'flat' ? '平' : '凸' }}</div>
  </div>
</template>
