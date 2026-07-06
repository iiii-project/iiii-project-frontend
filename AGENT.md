# AI 求籤互動系統－前端開發規範

本文件供前端開發者與 AI Agent 使用，目的是統一 Vue 前端的架構、命名、UI、互動、動作辨識與 API 串接方式。

若需求與本文件衝突，以最新且明確的人類需求為優先，完成後應同步更新本文件。

---

# 1. 專案定位

系統名稱：AI 求籤互動系統

前端負責：

- 使用者介面
- 頁面流程
- 燒香、搖籤、擲筊互動
- MediaPipe 動作辨識
- 動畫與視覺回饋
- API 串接
- 前端狀態管理
- 歷史紀錄顯示

前端不得決定：

- 抽中的籤詩
- 擲筊結果
- 是否取得聖筊
- 求籤流程的最終狀態
- AI 解籤內容

上述結果均由 Django 後端產生。

---

# 2. 固定技術棧

除非需求明確變更，禁止自行更換：

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- Axios
- MediaPipe Hands
- MediaPipe Pose
- HTML5 Canvas
- CSS3
- Three.js 僅在確實需要 3D 時使用

禁止自行改用 React、Next.js、Nuxt 或其他框架。

---

# 3. 目錄結構

```text
frontend/
├── AGENT.md
├── src/
│   ├── api/
│   ├── assets/
│   ├── components/
│   │   ├── common/
│   │   ├── incense/
│   │   ├── fortune-stick/
│   │   ├── blocks/
│   │   └── camera/
│   ├── composables/
│   ├── layouts/
│   ├── router/
│   ├── stores/
│   ├── types/
│   ├── utils/
│   ├── views/
│   │   ├── HomeView.vue
│   │   ├── ModeSelectView.vue
│   │   ├── QuestionView.vue
│   │   ├── PrayerView.vue
│   │   ├── DrawView.vue
│   │   ├── FortuneView.vue
│   │   ├── BlocksView.vue
│   │   ├── InterpretationView.vue
│   │   └── HistoryView.vue
│   ├── App.vue
│   └── main.ts
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

# 4. Vue 開發風格

- 使用 Composition API
- 使用 `<script setup lang="ts">`
- Props、Emits、API Response 必須有型別
- View 僅負責頁面組合與流程
- 共用 UI 拆成 Component
- 共用邏輯放入 Composable
- 跨頁狀態放 Pinia
- 單一元件暫時狀態留在元件內
- 不在元件中直接放大型 API 邏輯
- 不建立超大型單一元件
- 優先使用 early return
- 移除未使用 import、變數與死碼

---

# 5. 命名規則

- Vue 元件：`PascalCase.vue`
- View：`XxxView.vue`
- Composable：`useXxx.ts`
- Store：`xxxStore.ts`
- API 模組：`xxxApi.ts`
- 型別：`PascalCase`
- 變數、函式：`camelCase`
- 常數：`UPPER_SNAKE_CASE`

範例：

```ts
interface FortuneResult {
  number: number
  title: string
}

const MAX_CHAT_MESSAGES = 10
```

---

# 6. API 串接規範

所有 API 呼叫統一放在 `src/api/`。

不得在多個頁面重複撰寫相同 Axios 呼叫。

API 基底路徑：

```text
/api/v1/
```

常用端點：

```text
GET  /api/v1/fortune-sets/
POST /api/v1/divinations/
POST /api/v1/divinations/{sessionId}/prayer-complete/
POST /api/v1/divinations/{sessionId}/draw/
POST /api/v1/divinations/{sessionId}/blocks/
POST /api/v1/divinations/{sessionId}/interpret/
POST /api/v1/divinations/{sessionId}/chat/
GET  /api/v1/divinations/?anonymous_user_id={id}
DELETE /api/v1/divinations/{sessionId}/
```

前端不得提交或修改：

- fortune
- status
- confirmed
- ai_interpretation
- block_one
- block_two
- result

---

# 7. API 錯誤處理

所有 API 呼叫需處理：

- Loading
- Success
- Validation Error
- Network Error
- Timeout
- 401 / 403
- 404
- 409
- 500

錯誤訊息必須告知使用者下一步，不得只顯示「發生錯誤」。

範例：

- 攝影機無權限：提示改用點擊模式
- 已抽過籤：顯示原籤詩
- 擲筊已達上限：提示重新求籤
- AI 無回應：保留籤詩並提供重試

---

# 8. Pinia 狀態規範

## Divination Store

保存：

- sessionId
- question
- category
- interactionMode
- fortuneSet
- status
- fortune
- blockCasts
- confirmed
- interpretation

## Camera Store

保存：

- permissionStatus
- isActive
- detectionStatus
- lastDetectedAction
- errorMessage

## History Store

保存：

- anonymousUserId
- historyItems
- selectedRecord

禁止：

- 所有狀態集中於單一 Store
- 把所有按鈕開關放入 Pinia
- 直接修改其他 Store 的內部資料結構

---

# 9. 求籤流程規範

前端畫面依下列流程呈現：

```text
首頁
→ 模式選擇
→ 問題輸入
→ 燒香祈求
→ 搖籤
→ 籤詩顯示
→ 擲筊
→ AI 解籤
→ 後續聊天或歷史紀錄
```

後端狀態值：

```text
created
praying
drawing
waiting_for_blocks
confirmed
rejected
interpreting
completed
cancelled
```

前端只依後端狀態顯示頁面，不得自行跳過必要流程。

---

# 10. 動作辨識規範

使用：

- MediaPipe Hands
- MediaPipe Pose

第一階段辨識：

- 雙手合十
- 搖籤
- 擲筊

前端動作事件：

```text
PRAYER_DETECTED
SHAKE_DETECTED
BLOCK_CAST_DETECTED
```

規則：

- 原始影像只在瀏覽器中處理
- 不上傳攝影機影像
- 不保存原始影片
- 使用前必須取得權限
- 辨識失敗必須有點擊備援
- 每次動作只觸發一次 API
- 需實作 debounce 或 lock 防止重複觸發
- 低效能裝置可降低辨識 FPS

---

# 11. UI 視覺規範

風格：

- 傳統文化與現代科技融合
- 簡潔、沉浸、易操作
- 不使用恐怖、陰森、詛咒式視覺
- 每頁只聚焦一個主要任務

建議色彩：

- 深紅
- 金色
- 米白
- 木質棕
- 暖灰

避免：

- 大量霓虹色
- 過度花俏漸層
- 低對比文字
- 讓使用者難以判斷主按鈕

---

# 12. 動畫規範

- 動畫只用於操作回饋與沉浸感
- 動畫期間停用重複操作
- 不讓使用者等待無意義動畫
- 提供低效能降級方案
- 擲筊與抽籤動畫結果必須依後端資料呈現
- 不得先由動畫隨機決定結果，再通知後端

---

# 13. 表單與輸入規範

問題輸入：

- 最少 2 字
- 最多 300 字
- 不可空白

聊天輸入：

- 最多 500 字

前端必須做基礎驗證，但後端驗證仍為最終依據。

不得將前端驗證視為安全機制。

---

# 14. 無障礙與可用性

- 文字與背景有足夠對比
- 所有按鈕有明確文字
- 不只用顏色表達狀態
- 動作辨識一定有點擊模式
- 錯誤訊息需說明下一步
- 支援鍵盤操作的按鈕必須可聚焦
- 手機與平板不得出現主要內容溢出

---

# 15. TypeScript 規範

- 禁止大量使用 `any`
- API Response 必須建立 interface 或 type
- Nullable 欄位要明確標示
- 函式回傳值應可推導或明確定義
- 共用型別放 `src/types/`

---

# 16. 測試規範

前端至少測試：

- 頁面流程
- Store 狀態
- API 錯誤
- 重複點擊防護
- 動作辨識失敗
- 點擊模式備援
- 歷史紀錄顯示
- 響應式版面

重要互動完成後，Agent 必須回報實際測試結果。

---

# 17. 安全與隱私

- API Key 不得出現在前端
- 不得保存攝影機原始影像
- 不得將影像傳送後端
- 不得把敏感環境變數寫入程式碼
- 不得信任前端送出的核心流程欄位
- 不得在錯誤畫面顯示後端堆疊或秘密

---

# 18. Agent 工作流程

每次前端修改應：

1. 先閱讀本文件
2. 檢查既有元件、Store、Composable、API 模組
3. 避免建立重複功能
4. 使用最小必要修改
5. 補上型別與錯誤處理
6. 驗證桌面與手機版面
7. 測試點擊與動作辨識備援
8. 回報修改檔案與測試結果

---

# 19. Agent 禁止事項

不得：

- 改用 React
- 在前端產生籤號
- 在前端產生擲筊結果
- 在前端直接呼叫 LLM
- 將 API Key 放入前端
- 上傳攝影機影像
- 把所有邏輯寫在 View
- 無需求時大量重構
- 無需求時加入複雜 3D 引擎
- 忽略點擊模式備援

---

# 20. 完成定義

前端功能只有在以下條件皆符合時才算完成：

- 頁面可正常操作
- API 串接正確
- Loading 與 Error 狀態完整
- 不會重複送出核心請求
- 型別完整
- 響應式正常
- 動作辨識有點擊備援
- 不洩漏敏感資料
- 必要測試已完成
