<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { interpretFortune, sendChat } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import MarkdownText from '@/components/common/MarkdownText.vue'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useDivinationStore } from '@/stores/divinationStore'

const router = useRouter()
const divination = useDivinationStore()
const isLoading = ref(false)
const chatMessage = ref('')
const chatReplies = ref<string[]>([])
const errorMessage = ref('')

onMounted(() => {
  if (divination.confirmed && !divination.interpretation) loadInterpretation()
})

async function loadInterpretation() {
  if (!divination.sessionId || isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''
  try {
    const session = await interpretFortune(divination.sessionId)
    divination.status = session.status
    divination.interpretation = session.interpretation
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function chat(message = chatMessage.value) {
  const trimmed = message.trim()
  if (!trimmed || trimmed.length > 500 || !divination.sessionId) return

  chatMessage.value = ''
  try {
    const response = await sendChat(divination.sessionId, trimmed)
    chatReplies.value.push(response.reply)
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  }
}

function restart() {
  divination.reset()
  router.push('/mode')
}
</script>

<template>
  <section class="page-shell narrow">
    <p class="eyebrow">AI 解籤</p>
    <h1>{{ divination.fortune?.title || '解籤結果' }}</h1>
    <StatusMessage :message="errorMessage" tone="error" />
    <button v-if="!divination.interpretation" class="primary-button" type="button" :disabled="isLoading" @click="loadInterpretation">
      {{ isLoading ? '解籤中' : '取得 AI 解籤' }}
    </button>

    <template v-if="divination.interpretation">
      <article class="poem-block">
        <h2>整體含義</h2>
        <MarkdownText :source="divination.interpretation.overall_meaning" />
      </article>
      <article class="poem-block">
        <h2>與問題的關聯</h2>
        <MarkdownText :source="divination.interpretation.relation_to_question" />
      </article>
      <article class="poem-block">
        <h2>可採取的行動</h2>
        <ul>
          <li v-for="action in divination.interpretation.suggested_actions" :key="action">
            <MarkdownText :source="action" />
          </li>
        </ul>
      </article>
      <article class="poem-block">
        <h2>應注意事項</h2>
        <ul>
          <li v-for="warning in divination.interpretation.warnings" :key="warning">
            <MarkdownText :source="warning" />
          </li>
        </ul>
      </article>

      <div class="quick-row">
        <button type="button" class="ghost-button" @click="chat('這支籤提醒我最該注意什麼？')">注意事項</button>
        <button type="button" class="ghost-button" @click="chat('我下一步可以怎麼做？')">下一步</button>
      </div>
      <label>
        後續提問
        <textarea v-model="chatMessage" maxlength="500" rows="3"></textarea>
      </label>
      <div class="button-row">
        <button class="secondary-button" type="button" @click="chat()">送出提問</button>
        <button class="ghost-button" type="button" @click="restart">重新求籤</button>
      </div>
      <div v-if="chatReplies.length" class="reply-list">
        <MarkdownText v-for="reply in chatReplies" :key="reply" :source="reply" />
      </div>
    </template>
  </section>
</template>
