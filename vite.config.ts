import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ command }) => {
  const apiTarget = process.env.VITE_API_PROXY_TARGET || (
    command === 'serve' ? 'http://127.0.0.1:8003' : 'http://iiibackend.dev-serve.me'
  )

  return {
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5174,
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
