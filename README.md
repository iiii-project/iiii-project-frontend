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
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
```

**沒設定的話，會退回 `http://127.0.0.1:8000`**——也就是預期你本機用預設埠號跑起 `iiii-project-backend`。如果你的後端不是跑在這個位址（換了埠號、跑在別台機器、或用 Docker），就要照下面的方式明確設定，不然 dev server 會連不到你實際的後端。

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

### `VITE_DEV_ALLOWED_HOSTS`（選用）

只有你要用自己的網域（穿透工具、公司內網網域等）反向代理/穿透這個 dev server 時才需要設，逗號分隔多個網域：

```bash
VITE_DEV_ALLOWED_HOSTS=your-tunnel-domain.example.com npm run dev
```

用 `localhost`/區網 IP 開發完全不受影響，不需要設這個變數。

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

動作辨識集中在 `<temple-ar-oracle>` Web Component，核心位於
`src/ar/temple-ar-oracle/`。

- 使用 MediaPipe Hands 取得手部關鍵點，並使用 Selfie Segmentation 顯示去背後的人像。
- 攝影機模式依序處理合十、搖籤與擲筊；擲筊需要雙手同時入鏡。
- 手機鏡頭無法使用時會降級為手動點擊抽籤。
- 每個階段都保留點擊備援，並在觸發後鎖定流程，避免重複送 API。
- 攝影機影像只在瀏覽器送入 MediaPipe，不上傳後端。

低階裝置會自動降低攝影機解析度、推論 FPS、粒子更新頻率與 Three.js 渲染負載。

Live2D 只需要 `public/live2d/libs/live2dcubismcore.js` 這個 Cubism 執行期函式庫；對話輸入使用瀏覽器或後端 STT，不使用 VAD／ONNX 模型。

## Docker Compose 部署

前端與後端是**兩個獨立的 compose 專案**，各自只有一份 `compose.yaml`，各自啟動、各自部署，透過共用的 docker network `iiii-project` 互通：nginx 以 `backend:8000` 把 `/api`、`/admin`、`/client-ws` 等路徑轉給後端（後端 compose 替 backend 服務設了這個網路別名，nginx 設定見 `nginx/default.conf.template`）。

| 檔案 | 內容 |
|---|---|
| `compose.yaml` | frontend + caddy（TLS，對外 80/443） |
| `../iiii-project-backend/compose.yaml` | backend（不對外開埠） |

跟 `npm run dev` 是完全不同的兩套環境變數，不要混用；**不需要設定 `VITE_API_PROXY_TARGET` 或 `BACKEND_URL`**。

啟動前：

1. 已安裝並啟動 Docker Engine，`docker compose version` 可正常執行。
2. 前端與後端目錄位於同一層（`iiii-project-frontend`、`iiii-project-backend`）。
3. 後端已建立 `../iiii-project-backend/.env`（見後端 README）；本目錄建立 `.env`（`cp .env.production.example .env`，填入 `DOMAIN`）。
4. 第一次先建立共用網路：`docker network create iiii-project`。

啟動（兩邊順序不拘；後端還沒起來時 API 會暫時回 502）：

```bash
cd ../iiii-project-backend && docker compose up -d --build
cd ../iiii-project-frontend && docker compose up -d --build
```

VM 上也可以直接用 `scripts/deploy.sh`（兩個 repo 各有一份，只更新、重建自己）：拉最新的 main、必要時建立共用網路、`up -d --build --force-recreate --remove-orphans`。GitHub Actions 的 deploy job 就是透過 SSH 執行它。

停止服務（各自在自己的目錄）：`docker compose down`（**不要加 `-v`**，會刪掉資料庫 volume）。

## 已知技術債

- `npm run build` 產出的 `OracleWizard-*.js`（vendored 的 Cubism WebSDK 都打包在裡面）跟 `three.module-*.js` 都超過 Vite 500KB 的 chunk-size 警告門檻，目前沒有做 `manualChunks` 分割，建置時會看到 chunk size 過大的警告，可以先忽略，不影響功能。
- `build.manifest` 故意設定成 `asset-manifest.json`（不是 Vite 預設的 `.vite/manifest.json`）：因為 nginx 常見設定會直接擋掉以 `.` 開頭的目錄，這是給 `public/sw.js`（service worker）讀取資產清單用的，如果之後要改回預設路徑，記得同時檢查正式環境的 nginx 設定。
