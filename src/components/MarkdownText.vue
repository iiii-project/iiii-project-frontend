<script setup lang="ts">
import { computed } from 'vue'
import { parseMarkdown } from '@/utils/markdown'

const props = withDefaults(defineProps<{
  value?: string | null
  as?: 'div' | 'span'
  inline?: boolean
}>(), {
  as: 'div',
  inline: false
})

const blocks = computed(() => parseMarkdown(props.value))
const inlineLines = computed(() => blocks.value.flatMap((block) => block.lines ?? block.items ?? []))
</script>

<template>
  <component :is="as" v-if="blocks.length" class="markdown-text">
    <template v-if="inline">
      <template v-for="(line, lineIndex) in inlineLines" :key="lineIndex">
        <template v-for="(token, tokenIndex) in line" :key="`${lineIndex}-${tokenIndex}`">
          <strong v-if="token.type === 'strong'">{{ token.text }}</strong>
          <em v-else-if="token.type === 'em'">{{ token.text }}</em>
          <code v-else-if="token.type === 'code'">{{ token.text }}</code>
          <a v-else-if="token.type === 'link'" :href="token.href" target="_blank" rel="noopener noreferrer">{{ token.text }}</a>
          <span v-else>{{ token.text }}</span>
        </template>
        <br v-if="lineIndex < inlineLines.length - 1">
      </template>
    </template>

    <template v-else>
      <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
        <component :is="`h${block.level ?? 3}`" v-if="block.type === 'heading'">
          <template v-for="(token, tokenIndex) in block.lines?.[0] ?? []" :key="tokenIndex">
            <strong v-if="token.type === 'strong'">{{ token.text }}</strong>
            <em v-else-if="token.type === 'em'">{{ token.text }}</em>
            <code v-else-if="token.type === 'code'">{{ token.text }}</code>
            <a v-else-if="token.type === 'link'" :href="token.href" target="_blank" rel="noopener noreferrer">{{ token.text }}</a>
            <span v-else>{{ token.text }}</span>
          </template>
        </component>

        <p v-else-if="block.type === 'paragraph'">
          <template v-for="(line, lineIndex) in block.lines" :key="lineIndex">
            <template v-for="(token, tokenIndex) in line" :key="`${lineIndex}-${tokenIndex}`">
              <strong v-if="token.type === 'strong'">{{ token.text }}</strong>
              <em v-else-if="token.type === 'em'">{{ token.text }}</em>
              <code v-else-if="token.type === 'code'">{{ token.text }}</code>
              <a v-else-if="token.type === 'link'" :href="token.href" target="_blank" rel="noopener noreferrer">{{ token.text }}</a>
              <span v-else>{{ token.text }}</span>
            </template>
            <br v-if="lineIndex < (block.lines?.length ?? 0) - 1">
          </template>
        </p>

        <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.type === 'list'">
          <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
            <template v-for="(token, tokenIndex) in item" :key="tokenIndex">
              <strong v-if="token.type === 'strong'">{{ token.text }}</strong>
              <em v-else-if="token.type === 'em'">{{ token.text }}</em>
              <code v-else-if="token.type === 'code'">{{ token.text }}</code>
              <a v-else-if="token.type === 'link'" :href="token.href" target="_blank" rel="noopener noreferrer">{{ token.text }}</a>
              <span v-else>{{ token.text }}</span>
            </template>
          </li>
        </component>
      </template>
    </template>
  </component>
</template>
