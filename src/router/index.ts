import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/mode', name: 'mode', component: () => import('@/views/ModeSelectView.vue') },
    { path: '/question', name: 'question', component: () => import('@/views/QuestionView.vue') },
    { path: '/prayer', name: 'prayer', component: () => import('@/views/PrayerView.vue') },
    { path: '/draw', name: 'draw', component: () => import('@/views/DrawView.vue') },
    { path: '/fortune', name: 'fortune', component: () => import('@/views/FortuneView.vue') },
    { path: '/blocks', name: 'blocks', component: () => import('@/views/BlocksView.vue') },
    { path: '/interpretation', name: 'interpretation', component: () => import('@/views/InterpretationView.vue') },
    { path: '/history', name: 'history', component: () => import('@/views/HistoryView.vue') }
  ]
})

export default router
