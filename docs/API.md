# 前端 API 整合說明

完整且以後端實作為準的 API 規格位於：

[`../iiii-project-backend/docs/API.md`](../../iiii-project-backend/docs/API.md)

## 前端使用方式

- REST base path：`/api/v1`
- WebSocket：`/client-ws`
- Axios client：`src/api/client.ts`
- REST API 封裝：`src/api/authApi.ts`、`src/api/divinationApi.ts`
- 語音轉寫：`POST /api/v1/speech/transcribe/`
- Live2D WebSocket 封裝：`src/live2d/websocketService.ts`

需要 JWT 的請求由 `apiClient` 自動從 `localStorage` 的
`ai-fortune-access-token` 加上 `Authorization: Bearer <access_token>`。

前端不得自行產生或修改籤詩、擲筊結果、`status`、`confirmed` 或 AI 解籤內容；這些欄位一律以後端回應為準。
