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
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Live2D Cubism 官方 Framework，vendor 進 src/live2d/webSDK/，內部 import 用這個 alias
      '@framework': fileURLToPath(new URL('./src/live2d/webSDK/Framework/src', import.meta.url))
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
      '/admin': apiTarget,
      // Live2D 角色引擎現在跟 /api 同一個 Django 後端，共用 apiTarget
      '/client-ws': { target: apiTarget, ws: true, changeOrigin: true },
      '/live2d-models': apiTarget,
      '/avatars': apiTarget,
      '/bg': apiTarget,
      '/cache': apiTarget
    }
  }
  }
})