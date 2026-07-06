<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { deleteHistoryItem, listHistory } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import StatusMessage from '@/components/common/StatusMessage.vue'
import { useHistoryStore } from '@/stores/historyStore'

const history = useHistoryStore()
const isLoading = ref(false)
const errorMessage = ref('')

onMounted(loadHistory)

async function loadHistory() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    history.historyItems = await listHistory(history.anonymousUserId)
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function removeItem(sessionId: string) {
  try {
    await deleteHistoryItem(sessionId)
    history.historyItems = history.historyItems.filter((item) => item.session_id !== sessionId)
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  }
}
</script>

<template>
  <section class="page-shell">
    <p class="eyebrow">歷史紀錄</p>
    <h1>你的求籤紀錄</h1>
    <StatusMessage :message="errorMessage" tone="error" />
    <p v-if="isLoading" class="notice">載入中</p>
    <div v-else-if="history.historyItems.length" class="history-list">
      <article v-for="item in history.historyItems" :key="item.session_id" class="history-item">
        <div>
          <strong>{{ item.fortune?.title || '尚未取得籤詩' }}</strong>
          <p>{{ item.question }}</p>
          <small>{{ item.fortune_set.name }} · {{ item.category }} · {{ item.created_at || '未提供日期' }}</small>
        </div>
        <button class="ghost-button" type="button" @click="removeItem(item.session_id)">刪除</button>
      </article>
    </div>
    <p v-else class="notice">目前沒有歷史紀錄。</p>
  </section>
</template>
