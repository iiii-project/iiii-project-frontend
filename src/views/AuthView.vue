<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loginAccount, registerAccount } from '@/api/authApi'
import { toUserMessage } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const auth = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const title = computed(() => mode.value === 'login' ? '登入你的籤詩收藏' : '建立你的籤詩收藏')

async function submit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const session = mode.value === 'login'
      ? await loginAccount({ username: username.value.trim(), password: password.value })
      : await registerAccount({ username: username.value.trim(), email: email.value.trim(), password: password.value })
    auth.saveSession(session)
    await router.replace('/history')
  } catch (error) {
    errorMessage.value = toUserMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <header><RouterLink to="/">籤好運 <span>TAIWAN TEMPLE ONLINE</span></RouterLink><RouterLink to="/history">我的紀錄</RouterLink></header>
    <main>
      <section class="auth-panel">
        <p class="eyebrow">TEMPLE ACCOUNT</p>
        <h1>{{ title }}</h1>
        <p class="intro">登入後，新的求籤問題、籤詩與解籤結果會安全地歸屬在你的帳號下。</p>
        <div class="mode-tabs"><button :class="{ active: mode === 'login' }" type="button" @click="mode = 'login'">登入</button><button :class="{ active: mode === 'register' }" type="button" @click="mode = 'register'">註冊</button></div>
        <form @submit.prevent="submit">
          <label>帳號<input v-model="username" required autocomplete="username" minlength="2" maxlength="150" /></label>
          <label v-if="mode === 'register'">電子信箱<input v-model="email" required type="email" autocomplete="email" /></label>
          <label>密碼<input v-model="password" required type="password" autocomplete="current-password" minlength="8" /></label>
          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
          <button class="submit" :disabled="isSubmitting" type="submit">{{ isSubmitting ? '處理中' : mode === 'login' ? '登入並查看紀錄' : '建立帳號' }}</button>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; color: #3a2c22; background: #fbf9f5; }.auth-page header { height: 78px; display: flex; justify-content: space-between; align-items: center; padding: 0 clamp(22px,5vw,72px); border-bottom: 1px solid rgba(212,175,55,.4); }.auth-page header a:first-child { font-weight: 700; font-size: 20px; letter-spacing: .16em; }.auth-page header span { display: block; margin-top: 3px; color: #9c8b76; font-size: 9px; font-weight: 500; letter-spacing: .26em; }.auth-page header a:last-child { color: #7a2626; font-size: 14px; }.auth-page main { min-height: calc(100vh - 78px); display: grid; place-items: center; padding: 40px 20px; }.auth-panel { width: min(470px,100%); padding: clamp(28px,5vw,48px); border: 1px solid rgba(212,175,55,.52); border-radius: 8px; background: linear-gradient(145deg,#fffdf8,#f6ead3); box-shadow: 0 26px 70px rgba(74,50,25,.16); }.eyebrow { margin: 0 0 12px; color: #a63a3a; font-size: 11px; font-weight: 600; letter-spacing: .3em; }h1 { margin: 0; font-size: 35px; letter-spacing: .08em; }.intro { color: #6f5d4c; line-height: 1.85; }.mode-tabs { display: grid; grid-template-columns: 1fr 1fr; margin: 28px 0 22px; border-bottom: 1px solid #ddc99d; }.mode-tabs button { padding: 10px; border: 0; border-bottom: 2px solid transparent; color: #8b7562; background: transparent; font: inherit; cursor: pointer; }.mode-tabs button.active { border-color: #a63a3a; color: #7a2626; font-weight: 600; }form { display: grid; gap: 16px; }label { display: grid; gap: 7px; color: #6b5140; font-size: 14px; }input { min-height: 46px; border: 1px solid #d8c49c; border-radius: 3px; padding: 0 12px; color: #3a2c22; background: rgba(255,255,255,.75); font: inherit; }.submit { min-height: 50px; margin-top: 8px; border: 0; border-radius: 3px; color: #fffaf0; background: #9a3032; font: inherit; letter-spacing: .1em; cursor: pointer; }.submit:disabled { opacity: .65; cursor: wait; }.error { margin: 0; color: #9d3232; font-size: 13px; line-height: 1.6; }
</style>
