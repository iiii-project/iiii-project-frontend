import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    /* 首頁＝仙境主視覺。桌機走 index.vue，手機由它切換到 MobileHome（推廟門版）。 */
    { path: '/', name: 'home', component: () => import('@/views/index.vue'), meta: { immersive: true } },
    // 舊網址：先前對外用過 /celestial，保留轉址避免既有連結失效
    { path: '/celestial', redirect: '/' },
    // 全新 Vue 版求籤流程（與首頁分屬兩支檔案）
    // 掃 QR 取籤：先推廟門，再顯示那一次的籤詩
    { path: '/fortune/:sessionId', name: 'fortune-share', component: () => import('@/views/FortuneShare.vue'), meta: { immersive: true } },
    { path: '/oracle', name: 'oracle', component: () => import('@/views/OracleWizard.vue'), meta: { immersive: true } },
    // 查籤：輸入籤號看籤詩，或掃我們自己產的籤 QR
    { path: '/lookup', name: 'lookup', component: () => import('@/views/LookupView.vue'), meta: { immersive: true } },
    // Preserve bookmarked legacy URLs without ever reopening the retired dark flow.
    { path: '/mode', redirect: '/temple-oracle-v17' },
    { path: '/question', redirect: '/temple-oracle-v17' },
    { path: '/prayer', redirect: '/temple-oracle-v17' },
    { path: '/draw', redirect: '/temple-oracle-v17' },
    { path: '/fortune', redirect: '/temple-oracle-v17' },
    { path: '/blocks', redirect: '/temple-oracle-v17' },
    { path: '/interpretation', redirect: '/temple-oracle-v17' },
    { path: '/donation', name: 'donation', component: () => import('@/views/DonationView.vue'), meta: { immersive: true } },
    { path: '/temple-map', name: 'temple-map', component: () => import('@/views/TempleMapView.vue'), meta: { immersive: true } },
    { path: '/history', name: 'history', component: () => import('@/views/HistoryView.vue'), meta: { immersive: true } },
    { path: '/login', redirect: '/history' },
    { path: '/temple-oracle-v17', name: 'temple-oracle-v17', component: () => import('@/views/TempleOracleV17Page.vue'), meta: { immersive: true } }
  ]
})

export default router
