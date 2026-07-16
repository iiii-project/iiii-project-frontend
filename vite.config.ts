import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(() => {
  const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://iiibackend.dev-serve.me'

  return {
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5176,
    allowedHosts: ['iii.dev-serve.me', 'iii.gdtumn.com'],
    watch: {
      ignored: ['**/.agents/**', '**/.codex/**', '**/.opencode/**']
    },
    proxy: {
      '/api': apiTarget,
      '/admin': apiTarget
    }
  }
  }
})