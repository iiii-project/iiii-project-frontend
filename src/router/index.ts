import { createRouter, createWebHistory } from 'vue-router'
import { isMobileViewport } from '@/utils/device'
import { mobileRoutes } from '@/mobile/router'
import { desktopRoutes } from '@/desktop/router'

/* 手機／電腦是兩份完全獨立的路由＋頁面（src/mobile、src/desktop），
   彼此互不影響；這裡只在 app 啟動的當下判斷一次裝置，掛上對應的那一份路由表。
   （跟以前 index.vue 內部用 matchMedia 即時切換不同：現在是整個 app 啟動時
   就決定好走哪一份，瀏覽器視窗中途跨越 640px 斷點不會再熱切換。） */
const router = createRouter({
  history: createWebHistory(),
  routes: isMobileViewport() ? mobileRoutes : desktopRoutes
})

export default router
