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
const title = computed(() => mode.value === 'login' ? '登入查看你的求籤紀錄' : '建立你的籤詩收藏')

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
  <section class="account-panel">
    <p class="eyebrow">YOUR TEMPLE JOURNAL</p>
    <h1>{{ title }}</h1>
    <p class="intro">登入後，新的求籤問題、抽到的籤詩與解籤結果會只顯示在你的帳號中。</p>
    <div class="mode-tabs"><button :class="{ active: mode === 'login' }" type="button" @click="mode = 'login'">登入</button><button :class="{ active: mode === 'register' }" type="button" @click="mode = 'register'">註冊</button></div>
    <form @submit.prevent="submit">
      <label>帳號<input v-model="username" required autocomplete="username" minlength="2" maxlength="150" /></label>
      <label v-if="mode === 'register'">電子信箱<input v-model="email" required type="email" autocomplete="email" /></label>
      <label>密碼<input v-model="password" required type="password" autocomplete="current-password" minlength="8" /></label>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <button class="submit" :disabled="isSubmitting" type="submit">{{ isSubmitting ? '處理中' : mode === 'login' ? '登入並查看紀錄' : '建立帳號' }}</button>
    </form>
  </section>
</template>

<style scoped>
.account-panel { width: min(500px,100%); padding: clamp(28px,5vw,48px); border: 1px solid rgba(190,145,54,.65); border-radius: 8px; background: linear-gradient(145deg,#fffdf8,#f6ead3); box-shadow: 0 26px 70px rgba(74,50,25,.16); }.eyebrow { margin: 0 0 12px; color: #8a2729; font-size: 11px; font-weight: 700; letter-spacing: .3em; }h1 { margin: 0; color: #34251d; font-size: 35px; letter-spacing: .08em; }.intro { color: #4d3b2d; line-height: 1.85; }.mode-tabs { display: grid; grid-template-columns: 1fr 1fr; margin: 28px 0 22px; border-bottom: 1px solid #c9ad73; }.mode-tabs button { padding: 10px; border: 0; border-bottom: 2px solid transparent; color: #604b3b; background: transparent; font: inherit; cursor: pointer; }.mode-tabs button.active { border-color: #8a2729; color: #6f2023; font-weight: 700; }form { display: grid; gap: 16px; }label { display: grid; gap: 7px; color: #483629; font-size: 14px; font-weight: 600; }input { min-height: 46px; border: 1px solid #c9ad73; border-radius: 3px; padding: 0 12px; color: #2f241c; background: rgba(255,255,255,.82); font: inherit; }.submit { min-height: 50px; margin-top: 8px; border: 0; border-radius: 3px; color: #fffaf0; background: #8f2b2d; font: inherit; letter-spacing: .1em; cursor: pointer; }.submit:disabled { opacity: .65; cursor: wait; }.error { margin: 0; color: #8d1f21; font-size: 13px; line-height: 1.6; }
</style>
