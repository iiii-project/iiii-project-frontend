# AI 求籤互動系統前端

Vue 3 + Vite + TypeScript 前端，負責求籤流程、互動畫面、MediaPipe 動作辨識、Pinia 狀態與 Django API 串接。

## 啟動

```bash
npm install
npm run dev
```

Vite 會將 `/api` proxy 到 `VITE_API_PROXY_TARGET`，未設定時預設是 `http://127.0.0.1:8000`。

## Docker Compose 部署

在此前端目錄執行 Compose 前，請先確認：

1. 已安裝並啟動 Docker Desktop 或 Docker Engine，且 `docker compose version` 可正常執行。
2. 前端與後端目錄位於同一層，目錄名稱分別為 `iiii-project-frontend` 與 `iiii-project-backend`。
3. 已建立後端環境設定檔：

   ```bash
   cp ../iiii-project-backend/.env.example ../iiii-project-backend/.env
   ```

   請在正式環境修改後端 `.env` 的 `DJANGO_SECRET_KEY`、`DJANGO_DEBUG=False`、`DJANGO_ALLOWED_HOSTS`、`CORS_ALLOWED_ORIGINS` 與 `CSRF_TRUSTED_ORIGINS`。

4. 已將至少一個 `.gguf` 模型檔放入 `../iiii-project-backend/llamacpp/model/`；需要指定模型時，設定本專案 `.env` 的 `LLAMA_MODEL` 為檔名。

建立此前端的 Compose 環境檔並啟動：

```bash
cp .env.example .env
docker compose up -d --build
```

查看服務狀態與啟動紀錄：

```bash
docker compose ps
docker compose logs -f
```

預設前端網址為 `http://localhost:8888`；可在 `.env` 以 `FRONTEND_PORT` 更改埠號。Compose 同時啟動前端、Django 後端與 Llama，並將 `/api`、`/admin` 透過內部網路轉送至 `backend:8000`，不需要設定 `BACKEND_URL`。後端設定由 `../iiii-project-backend/.env` 讀取。

停止服務：

```bash
docker compose down
```

## 主要流程

```text
首頁 → 模式選擇 → 問題輸入 → 燒香祈求 → 搖籤 → 籤詩 → 擲筊 → AI 解籤 → 歷史紀錄
```

前端不產生籤號、擲筊結果或 AI 解籤內容，這些核心結果都透過 Django API 取得。

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
