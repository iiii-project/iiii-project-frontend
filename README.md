# AI 求籤互動系統前端

Vue 3 + Vite + TypeScript 前端，負責求籤流程、互動畫面、MediaPipe 動作辨識、Pinia 狀態與 Django API 串接。

## 啟動

```bash
npm install
npm run dev
```

Vite 會將 `/api` proxy 到 `VITE_API_PROXY_TARGET`，未設定時預設是 `http://127.0.0.1:8000`。

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
