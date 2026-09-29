import type { RouteRecordRaw } from 'vue-router'

// 唯一路由表：所有裝置都使用同一份桌面版頁面。
export const desktopRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { immersive: true } },
  { path: '/celestial', redirect: '/' },
  { path: '/fortune/:sessionId', name: 'fortune-share', component: () => import('./views/FortuneShare.vue'), meta: { immersive: true } },
  { path: '/oracle', name: 'oracle', component: () => import('./views/OracleWizard.vue'), meta: { immersive: true } },
  { path: '/lookup', name: 'lookup', component: () => import('./views/LookupView.vue'), meta: { immersive: true } },
  { path: '/donation', name: 'donation', component: () => import('./views/DonationView.vue'), meta: { immersive: true } },
  { path: '/temple-map', name: 'temple-map', component: () => import('./views/TempleMapView.vue'), meta: { immersive: true } },
  { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue'), meta: { immersive: true } },
  { path: '/login', redirect: '/history' }
]
