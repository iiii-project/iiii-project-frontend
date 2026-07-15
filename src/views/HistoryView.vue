<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { deleteHistoryItem, listHistory } from '@/api/divinationApi'
import { toUserMessage } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import type { HistoryItem } from '@/types/divination'
import AccountAccessPanel from '@/components/common/AccountAccessPanel.vue'

const auth = useAuthStore()
const records = ref<HistoryItem[]>([])
const selected = ref<HistoryItem | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  await auth.restore()
  if (auth.isAuthenticated) await loadHistory()
})

async function loadHistory() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    records.value = await listHistory()
    selected.value = records.value[0] || null
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function removeItem(sessionId: string) {
  try {
    await deleteHistoryItem(sessionId)
    records.value = records.value.filter((record) => record.session_id !== sessionId)
    selected.value = records.value[0] || null
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  }
}

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
}
</script>

<template>
  <div class="history-page">
    <header>
      <RouterLink class="brand" to="/">籤好運 <span>TAIWAN TEMPLE ONLINE</span></RouterLink>
      <nav><RouterLink to="/temple-map">廟宇地圖</RouterLink><RouterLink to="/donation">功德捐款</RouterLink><button v-if="auth.isAuthenticated" type="button" @click="auth.logout()">登出</button></nav>
    </header>
    <main :class="{ 'auth-gate': !auth.isAuthenticated && !auth.isRestoring }">
      <section v-if="!auth.isAuthenticated && !auth.isRestoring" class="signin-state">
        <AccountAccessPanel />
      </section>
      <template v-else>
        <section class="history-heading"><p class="eyebrow">YOUR TEMPLE JOURNAL</p><h1>{{ auth.user?.username }} 的求籤紀錄</h1><p>這裡只會顯示目前帳號建立的問題與籤詩。</p></section>
        <p v-if="isLoading" class="notice">載入紀錄中…</p><p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
        <section v-else-if="records.length" class="history-layout">
          <div class="record-list"><button v-for="record in records" :key="record.session_id" type="button" :class="{ selected: selected?.session_id === record.session_id }" @click="selected = record"><span>{{ formatDate(record.created_at) }}</span><strong>{{ record.fortune?.title || '尚未完成的求籤' }}</strong><p>{{ record.question }}</p></button></div>
          <article v-if="selected" class="record-detail"><div class="detail-top"><div><p class="eyebrow">{{ selected.category }}</p><h2>{{ selected.fortune?.title || '求籤進行中' }}</h2></div><button type="button" class="delete" @click="removeItem(selected.session_id)">刪除</button></div><div class="question"><span>你的問題</span><p>{{ selected.question }}</p></div><div v-if="selected.fortune" class="fortune"><p>{{ selected.fortune.ganzhi }} · {{ selected.fortune.fortune_level }}</p><pre>{{ selected.fortune.poem }}</pre><p>{{ selected.fortune.translation }}</p></div><div v-if="selected.interpretation?.overall_meaning" class="interpretation"><span>解籤紀錄</span><p>{{ selected.interpretation.overall_meaning }}</p></div></article>
        </section>
        <section v-else class="empty-state"><h2>還沒有帳號求籤紀錄</h2><p>登入後從「開始求籤」進入的紀錄會顯示在這裡。</p><RouterLink class="primary" to="/temple-oracle-v17">開始求籤</RouterLink></section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.history-page { min-height: 100vh; color: #34251d; background: #fbf9f5; }.history-page header { height: 78px; display: flex; align-items: center; justify-content: space-between; padding: 0 clamp(22px,5vw,72px); border-bottom: 1px solid rgba(190,145,54,.58); }.brand { color: #2f241c; font-size: 20px; font-weight: 700; letter-spacing: .16em; }.brand span { display: block; margin-top: 3px; color: #705b49; font-size: 9px; font-weight: 600; letter-spacing: .26em; }nav { display: flex; align-items: center; gap: 24px; color: #4c392b; font-size: 14px; font-weight: 600; }nav button { border: 0; color: #7c2426; background: transparent; font: inherit; cursor: pointer; }.history-page main { width: min(1180px,calc(100% - 40px)); margin: 0 auto; padding: 58px 0; }.history-page main.auth-gate { width: 100%; min-height: calc(100vh - 78px); position: relative; display: grid; place-items: center; isolation: isolate; overflow: hidden; padding: 44px 20px; }.history-page main.auth-gate::before { content: ''; position: absolute; inset: -18px; z-index: -2; background: linear-gradient(rgba(253,250,243,.46),rgba(253,250,243,.58)), url('@/assets/images/temple-login-background.png') center/cover no-repeat; filter: blur(10px) saturate(.8); transform: scale(1.05); }.history-page main.auth-gate::after { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(68,42,25,.1); }.eyebrow { margin: 0 0 12px; color: #8a2729; font-size: 11px; font-weight: 700; letter-spacing: .3em; }h1 { margin: 0; font-size: clamp(35px,5vw,58px); font-weight: 600; letter-spacing: .08em; }.history-heading > p:last-child,.empty-state p { color: #4d3b2d; line-height: 1.9; }.signin-state,.empty-state { max-width: 650px; padding: clamp(36px,7vw,80px) 0; }.signin-state { width: min(500px,100%); padding: 0; }.primary { display: inline-block; margin-top: 16px; padding: 14px 25px; border-radius: 3px; color: #fffaf0; background: #8f2b2d; letter-spacing: .1em; }.history-layout { display: grid; grid-template-columns: minmax(280px,.78fr) minmax(0,1.22fr); gap: 28px; margin-top: 34px; }.record-list { display: grid; align-content: start; gap: 9px; }.record-list button { padding: 17px; border: 1px solid rgba(190,145,54,.58); border-radius: 5px; color: #2f241c; background: #fffdf8; text-align: left; font: inherit; cursor: pointer; }.record-list button.selected { border-color: #8f2b2d; box-shadow: 0 8px 22px rgba(122,38,38,.1); }.record-list span { display: block; margin-bottom: 7px; color: #765839; font-size: 11px; font-weight: 600; }.record-list strong { color: #702326; font-size: 17px; }.record-list p { margin: 8px 0 0; color: #4d3b2d; font-size: 13px; line-height: 1.6; }.record-detail { min-height: 450px; padding: clamp(24px,4vw,42px); border: 1px solid rgba(190,145,54,.62); border-radius: 7px; background: linear-gradient(145deg,#fffdf8,#f6ead3); }.detail-top { display: flex; align-items: start; justify-content: space-between; gap: 20px; }.detail-top h2 { margin: 0; color: #702326; font-size: 32px; letter-spacing: .06em; }.delete { padding: 8px 12px; border: 1px solid #c88f82; border-radius: 3px; color: #7c2426; background: transparent; cursor: pointer; }.question,.interpretation { margin-top: 27px; padding-top: 21px; border-top: 1px solid rgba(190,145,54,.48); }.question span,.interpretation span { color: #745535; font-size: 12px; font-weight: 600; letter-spacing: .1em; }.question p,.interpretation p { color: #3f3025; line-height: 1.9; }.fortune { margin-top: 23px; padding: 22px; background: rgba(255,255,255,.52); }.fortune > p { color: #604a36; line-height: 1.8; }.fortune pre { margin: 18px 0; color: #592d26; font: 18px/2 'Noto Serif TC',serif; white-space: pre-wrap; }.notice,.error { margin-top: 32px; color: #604a36; }.error { color: #8d1f21; }@media (max-width:720px) { .history-page header { height: 70px; }.history-page main { width: min(100% - 24px,1180px); padding-top: 36px; }.history-page main.auth-gate { width: 100%; min-height: calc(100vh - 70px); padding: 24px 12px; }nav { gap: 14px; font-size: 13px; }.history-layout { grid-template-columns: 1fr; }.record-detail { min-height: 0; }.detail-top h2 { font-size: 27px; } }
</style>
