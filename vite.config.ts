import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(() => {
  const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
  // 用自己的網域(穿透工具、公司內網網域等)存取這個 dev server 時才需要設,
  // 逗號分隔多個網域。預設不設，Vite 本來就允許 localhost/區網 IP 存取。
  const devAllowedHosts = (process.env.VITE_DEV_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
  // <temple-ar-oracle> 是原生 Web Component，要告訴 Vue 別把它當成未註冊的元件
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'temple-ar-oracle' } } })],
  build: {
    /* 產出一份資產清單給 service worker 用（見 public/sw.js）。
       離線要能用，SW 必須在「第一次上線瀏覽」就把 js/css 都存起來；
       但檔名帶 hash，SW 沒辦法寫死，所以讓建置產出清單讓它去讀。
       檔名刻意不用預設的 .vite/manifest.json——nginx 常常直接擋掉以點開頭的目錄。 */
    manifest: 'asset-manifest.json'
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Live2D Cubism 官方 Framework，vendor 進 src/live2d/webSDK/，內部 import 用這個 alias
      '@framework': fileURLToPath(new URL('./src/live2d/webSDK/Framework/src', import.meta.url))
    }
  },
  server: {
    port: 5176,
    allowedHosts: devAllowedHosts.length ? devAllowedHosts : undefined,
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