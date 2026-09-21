import { createRouter, createWebHistory } from 'vue-router'
import { desktopRoutes } from '@/desktop/router'

/* 全站只有電腦版一份路由＋頁面（src/desktop）：不論螢幕直放或橫放都是同一套介面，
   實際版面以 JJ5 直立的 1080×1920 為準（寬度由 index.html 的 viewport 固定）。 */
const router = createRouter({
  history: createWebHistory(),
  routes: desktopRoutes
})

export default router
