# iiii-project-frontend

AI 求籤互動系統前端：Vue 3 + Vite + TypeScript，負責求籤流程、AR 儀式互動畫面、動作辨識、Live2D 虛擬角色渲染，並透過 Django API 取得所有籤詩/解籤結果。

搭配的後端專案是 `iiii-project-backend`（Django + Channels），必須先把後端跑起來才能完整運作，見該專案的 README。

## 目錄

- [快速開始](#快速開始)
- [環境變數（⚠️ 請先看這裡）](#環境變數-請先看這裡)
- [跟後端的關聯](#跟後端的關聯)
- [建置與型別檢查](#建置與型別檢查)
- [測試](#測試)
- [主要流程](#主要流程)
- [動作辨識實作](#動作辨識實作)
- [Docker Compose 部署](#docker-compose-部署)
- [已知技術債](#已知技術債)

## 快速開始

需要 **Node.js 22.x**（依 `Dockerfile` 的 `FROM node:22-alpine` 推斷；`package.json` 未強制宣告版本）與 npm（專案用 `package-lock.json`，不要混用 pnpm/yarn）。

```bash
npm install
VITE_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

> ⚠️ **一定要設定 `VITE_API_PROXY_TARGET`**，見下方環境變數章節說明為什麼不能用 `.env.local`。

啟動後開 `http://localhost:5176`（dev server 固定用這個 port，不是 Vite 預設的 5173）。

## 環境變數（⚠️ 請先看這裡）

這個專案沒有 `.env.example` 對應到單純 `npm run dev` 的情境（現有的 `.env.example` 是給 [Docker Compose](#docker-compose-部署) 用的另一組變數，不要搞混）。以下兩個變數要特別注意：

### `VITE_API_PROXY_TARGET`（⚠️ 必改，且不能寫在 `.env.local` 裡）

`vite.config.ts` 用這個變數決定 dev server 要把 `/api`、`/admin`、`/client-ws`（WebSocket）、`/live2d-models`、`/avatars`、`/bg`、`/cache` proxy 到哪個後端：

```ts
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://iiibackend.dev-serve.me'
```

**沒設定的話，預設值 `http://iiibackend.dev-serve.me` 是原作者內部測試用的網域**——不設定不會報錯，但你的 dev server 會把所有 API/WebSocket 請求都轉送到那個外部網址，而不是你自己起的後端，容易讓人誤以為前端本身有問題。

這裡實測過一個容易踩的坑：**`vite.config.ts` 是用 Node 的 `process.env.VITE_API_PROXY_TARGET` 直接讀值，不是走 Vite 標準的 `import.meta.env`／`.env` 檔案載入流程**，所以寫在 `.env.local` 裡**不會生效**。必須用 shell 環境變數的方式設定：

```bash
# 方式一：直接 export
export VITE_API_PROXY_TARGET=http://127.0.0.1:8000
npm run dev

# 方式二：inline 寫在指令前面
VITE_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

把 `http://127.0.0.1:8000` 換成你實際跑 `iiii-project-backend` 的位址跟埠號。

### `VITE_PUBLIC_ORIGIN`（選用，走標準 `.env.local` 沒問題）

跟上面那個不同，這個變數是在 `src/utils/qr.ts` 裡透過標準的 `import.meta.env.VITE_PUBLIC_ORIGIN` 讀取，**放進 `.env.local` 就會生效**（`.gitignore` 已排除 `.env.*`，不會不小心提交）。只有在你想用手機掃「籤詩分享 QR Code」做真機測試時才需要設——本機開發預設會用 `window.location.origin`（也就是 `localhost`），手機掃了連不到，設這個變數指到你電腦的區網 IP 或線上網址即可：

```bash
# .env.local
VITE_PUBLIC_ORIGIN=http://192.168.1.100:5176
```

### `server.allowedHosts` 裡的網域

`vite.config.ts` 裡還寫了 `allowedHosts: ['ihappy.dev-serve.me', 'iii.gdtumn.com']`——這也是原作者的網域，只是 Vite dev server 允許哪些 Host header 存取的白名單。用 `localhost`/區網 IP 開發完全不受影響，不需要修改；只有你要用自己的網域反向代理/穿透這個 dev server 時才需要把自己的網域加進這個陣列。

## 跟後端的關聯

前端不產生任何籤號、擲筊結果或 AI 解籤內容，這些核心結果全部透過後端 API/WebSocket 取得。設定好 `VITE_API_PROXY_TARGET` 後，以下路徑都會 proxy 過去：

| 路徑 | 用途 |
|---|---|
| `/api` | REST API（求籤、擲筊、解籤、帳號、歷史紀錄） |
| `/admin` | Django admin |
| `/client-ws` | **WebSocket**，Live2D 角色對話（語音/文字、TTS、記憶） |
| `/live2d-models`、`/avatars`、`/bg`、`/cache` | Live2D 角色渲染會用到的靜態資源 |

## 建置與型別檢查

```bash
npm run build
```

實際等同 `vue-tsc -b && vite build`——**先做嚴格的 TypeScript 型別檢查，檢查沒過就不會繼續打包**，型別錯誤會讓建置直接失敗，不是單純印警告。

```bash
npm run preview   # 本機預覽 dist/ 建置產物
```

## 測試

**這個專案目前沒有自動化測試**（沒有 vitest/jest/cypress/playwright 等測試框架）。功能驗證目前依賴手動走查，可參考 `AGENT.md` 第 16 節列出的檢查清單（頁面流程、Store 狀態、API 錯誤處理、動作辨識失敗情境等）。

## 主要流程

```text
首頁 → 模式選擇 → 問題輸入 → 燒香祈求 → 搖籤 → 籤詩 → 擲筊 → AI 解籤（Live2D 角色可語音/文字對話）→ 歷史紀錄
```

## 動作辨識實作

動作辨識集中在 `src/composables/useActionDetection.ts`，由 `CameraActionPanel.vue` 使用。

- 使用 MediaPipe Pose 確認畫面中有人。
- 使用 MediaPipe Hands 取得雙手或手腕關鍵點。
- 合十：左右掌心關鍵點距離小於門檻，且位於畫面中央，持續約 2 秒後觸發 `PRAYER_DETECTED`。
- 搖籤：手腕 Y 軸上下移動且方向變化至少 3 次，持續約 2 秒後觸發 `SHAKE_DETECTED`。
- 擲筊：沿用手部上下擺動判斷，觸發 `BLOCK_CAST_DETECTED`。
- 觸發後立即 lock 並停止攝影機，避免同一動作重複送 API。
- 攝影機影像只在瀏覽器送入 MediaPipe，不上傳後端。
- 每個動作畫面都有「改用點擊」備援。

目前辨識採 15 FPS 的輕量配置，適合第一階段展示；若之後要提升準確度，可加入更多 Pose 條件或校正門檻。

Live2D 角色的麥克風語音輸入（VAD 語音活動偵測）跟 Cubism 渲染引擎所需的執行期函式庫（`live2dcubismcore.js`、onnxruntime-web 的 WASM 檔、Silero VAD 模型）都放在 `public/live2d/libs/`，**已經進版控，`git clone` 之後就有，不需要另外下載**。升級 `onnxruntime-web` 這個 npm 套件版本前要注意：這些 wasm 檔案是跟特定版本綁定編譯的，套件版本跟 wasm 檔要一起更新，不然可能出現版本不匹配的執行期錯誤。

## Docker Compose 部署

跟 `npm run dev` 是完全不同的兩套環境變數，不要混用。在此前端目錄執行 Compose 前：

1. 已安裝並啟動 Docker Desktop / Docker Engine，`docker compose version` 可正常執行。
2. 前端與後端目錄位於同一層，名稱分別是 `iiii-project-frontend`、`iiii-project-backend`。
3. 已建立後端環境設定檔：

   ```bash
   cp ../iiii-project-backend/.env.example ../iiii-project-backend/.env
   ```

   正式環境記得修改後端 `.env` 的 `DJANGO_SECRET_KEY`、`DJANGO_DEBUG=False`、`DJANGO_ALLOWED_HOSTS`、`CORS_ALLOWED_ORIGINS`、`CSRF_TRUSTED_ORIGINS`，以及 `LLM_API_KEY` 等 LLM 設定（見後端 README）。

4. 若要一起用 Docker 啟動 llama.cpp：需要先準備好 `../iiii-project-backend/llamacpp/`（見後端 README「Docker Compose」章節的說明，這個目錄目前沒有隨 git 流通，需要自己準備），並把至少一個 `.gguf` 模型放進 `llamacpp/model/`。**如果 LLM 走 OpenAI 官方 API 或其他外部端點，可以完全跳過這一步。**

建立此前端的 Compose 環境檔並啟動：

```bash
cp .env.example .env
docker compose up -d --build
```

```bash
docker compose ps
docker compose logs -f
```

預設前端網址為 `http://localhost:8888`（可用 `.env` 的 `FRONTEND_PORT` 改埠號）。Compose 會同時啟動前端、Django 後端（跟可選的 llama.cpp），並透過內部網路把 `/api`、`/admin` 等路徑轉送到 `backend:8000`（nginx 設定見 `nginx/default.conf.template`），**不需要設定 `VITE_API_PROXY_TARGET` 或 `BACKEND_URL`**——這組環境變數只在 `npm run dev` 情境用得到。後端設定完全由 `../iiii-project-backend/.env` 讀取。

停止服務：

```bash
docker compose down
```

## 已知技術債

- `npm run build` 產出的 `OracleWizard-*.js`（vendored 的 Cubism WebSDK 都打包在裡面）跟 `three.module-*.js` 都超過 Vite 500KB 的 chunk-size 警告門檻，目前沒有做 `manualChunks` 分割，建置時會看到 chunk size 過大的警告，可以先忽略，不影響功能。
- `build.manifest` 故意設定成 `asset-manifest.json`（不是 Vite 預設的 `.vite/manifest.json`）：因為 nginx 常見設定會直接擋掉以 `.` 開頭的目錄，這是給 `public/sw.js`（service worker）讀取資產清單用的，如果之後要改回預設路徑，記得同時檢查正式環境的 nginx 設定。
