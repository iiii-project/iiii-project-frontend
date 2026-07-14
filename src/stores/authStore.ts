import { defineStore } from 'pinia'
import { getCurrentUser, type AuthSession, type AuthUser } from '@/api/authApi'

const ACCESS_KEY = 'ai-fortune-access-token'
const REFRESH_KEY = 'ai-fortune-refresh-token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    accessToken: localStorage.getItem(ACCESS_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_KEY) || '',
    isRestoring: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user)
  },
  actions: {
    saveSession(session: AuthSession) {
      this.user = session.user
      this.accessToken = session.access
      this.refreshToken = session.refresh
      localStorage.setItem(ACCESS_KEY, session.access)
      localStorage.setItem(REFRESH_KEY, session.refresh)
    },
    async restore() {
      if (!this.accessToken || this.user || this.isRestoring) return
      this.isRestoring = true
      try {
        this.user = await getCurrentUser()
      } catch {
        this.logout()
      } finally {
        this.isRestoring = false
      }
    },
    logout() {
      this.user = null
      this.accessToken = ''
      this.refreshToken = ''
      localStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
    }
  }
})
