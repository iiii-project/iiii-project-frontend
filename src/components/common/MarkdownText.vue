<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  source: string
}>()

const html = computed(() => renderMarkdown(props.source || ''))

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function renderMarkdown(source: string): string {
  const output: string[] = []
  let paragraph: string[] = []
  let list: string[] = []
  let listTag: 'ul' | 'ol' | '' = ''

  function flushParagraph() {
    if (!paragraph.length) return
    output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
    paragraph = []
  }

  function flushList() {
    if (!list.length || !listTag) return
    output.push(`<${listTag}>${list.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listTag}>`)
    list = []
    listTag = ''
  }

  for (const rawLine of source.trim().split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    if (/^-{3,}$/.test(line)) {
      flushParagraph()
      flushList()
      output.push('<hr>')
      continue
    }

    if (/^#{1,3}\s/.test(line)) {
      flushParagraph()
      flushList()
      const level = Math.min(line.match(/^#+/)?.[0].length || 2, 3)
      output.push(`<h${level}>${renderInline(line.replace(/^#{1,3}\s/, ''))}</h${level}>`)
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph()
      if (listTag && listTag !== 'ul') flushList()
      listTag = 'ul'
      list.push(line.replace(/^[-*]\s+/, ''))
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      flushParagraph()
      if (listTag && listTag !== 'ol') flushList()
      listTag = 'ol'
      list.push(line.replace(/^\d+\.\s+/, ''))
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return output.join('')
}
</script>

<template>
  <div class="markdown-text" v-html="html"></div>
</template>
