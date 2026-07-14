import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/TempleLandingPage.vue'), meta: { immersive: true } },
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
