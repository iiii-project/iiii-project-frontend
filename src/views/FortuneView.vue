<script setup lang="ts">
import { useDivinationStore } from '@/stores/divinationStore'

const divination = useDivinationStore()
</script>

<template>
  <section class="page-shell narrow">
    <p class="eyebrow">{{ divination.fortuneSet?.name || '六十甲子籤' }}</p>
    <template v-if="divination.fortune">
      <h1>{{ divination.fortune.title }}</h1>
      <dl class="fortune-meta">
        <div><dt>籤號</dt><dd>{{ divination.fortune.number }}</dd></div>
        <div><dt>天干地支</dt><dd>{{ divination.fortune.ganzhi || '未提供' }}</dd></div>
        <div><dt>吉凶</dt><dd>{{ divination.fortune.fortune_level || '未提供' }}</dd></div>
      </dl>
      <article class="poem-block">
        <h2>籤詩原文</h2>
        <p>{{ divination.fortune.poem }}</p>
      </article>
      <article class="poem-block">
        <h2>白話翻譯</h2>
        <p>{{ divination.fortune.translation || '後端尚未提供白話翻譯。' }}</p>
      </article>
      <article class="poem-block">
        <h2>籤詩典故</h2>
        <p>{{ divination.fortune.story || '後端尚未提供典故。' }}</p>
      </article>
      <RouterLink class="primary-button" to="/blocks">前往擲筊</RouterLink>
    </template>
    <template v-else>
      <h1>尚未取得籤詩</h1>
      <RouterLink class="primary-button" to="/draw">回到搖籤</RouterLink>
    </template>
  </section>
</template>
