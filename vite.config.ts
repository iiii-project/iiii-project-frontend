import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(() => {
  const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://iiibackend.dev-serve.me'

  return {
  // <temple-ar-oracle> 是原生 Web Component，要告訴 Vue 別把它當成未註冊的元件
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'temple-ar-oracle' } } })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5176,
    allowedHosts: ['ihappy.dev-serve.me', 'iii.gdtumn.com'],
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