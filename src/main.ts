import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/authStore'
import './assets/styles.css'

const pinia = createPinia()
useAuthStore(pinia).restore()
createApp(App).use(pinia).use(router).mount('#app')

/* 離線可用：註冊 service worker（見 public/sw.js）。
   只在正式建置的版本註冊——開發時掛上它會跟 Vite 的 HMR 打架。
   它只負責把 app shell 與靜態檔存起來，/api 一律不碰，
   所以離線時 API 會照樣快速失敗，讓畫面走各自的離線備援。 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 註冊失敗（例如非 HTTPS 環境）只是沒有離線能力，不影響線上使用
    })
  })
}
