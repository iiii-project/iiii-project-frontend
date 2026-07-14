import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/authStore'
import './assets/styles.css'

const pinia = createPinia()
useAuthStore(pinia).restore()
createApp(App).use(pinia).use(router).mount('#app')
