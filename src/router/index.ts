import { createRouter, createWebHistory } from 'vue-router'
import { desktopRoutes } from '@/desktop/router'

/* 全部裝置統一使用桌面路由與頁面；手機不再在啟動時切換到另一套路由表。
   求籤頁內仍保留響應式版面，攝影機／motion 則由使用者選擇。 */
const router = createRouter({
  history: createWebHistory(),
  routes: desktopRoutes
})

export default router
