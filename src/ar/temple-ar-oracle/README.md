# temple-ar-oracle

從 `temple_oracle_v17.html`（4129行）抽取出來的「插香 → 搖籤抽籤 → 擲筊」AR核心流程，
封裝成不綁定任何前端框架的原生 Web Component `<temple-ar-oracle>`。

## 這個模組包含什麼、不包含什麼

**包含（原封不動搬遷，籤筒/筊杯視覺一筆一劃未更動）：**
- 插香/合十默念手勢偵測（MediaPipe雙手掌心距離判定 + 單手備援路徑）
- 搖籤：桌機握拳上下搖晃手勢偵測 / 手機 devicemotion 搖晃偵測 / 純點擊三種輸入模式
- 捏取抽籤手勢（捏合向上抽出）
- 擲筊：單手握拳抓杯/往下丟擲手勢偵測（含速度、加速度輔助判定）、Three.js 3D筊杯渲染與物理動畫、
  聖筊/笑筊/陰筊判定與後續流程（連續聖筊要求、非聖筊重新抽籤）
- 香灰粒子特效、木質敲擊音效（WebAudio即時合成）、墨染金線過場動畫
- 神明實景疊加（`#ritual-overlay`）+ 人像去背：插香/抽籤/擲筊三階段進場時，廟宇背景+
  玉皇大帝神像先100%不透明蓋住整個畫面（各階段停留秒數見 flow-controller.js 的
  `RITUAL_OVERLAY_VEIL_MS`），之後神明實景淡化到60%、同時攝影機畫面淡入——攝影機畫面
  這時已經用 MediaPipe SelfieSegmentation 即時去背（見 gesture-engine.js 的 onResults），
  只留下人像本體疊在神明實景「前面」，人像維持100%清晰不受淡化影響，其餘背景鏤空露出
  底下的神明實景層

**不包含（刻意排除，屬於周邊UI，交給新前端自行設計）：**
- 結果畫面的文字排版、書法動畫、平安符產生器
- 首頁分類/問題輸入表單
- 稟告資料、還願紀錄、籤詩收藏本、延續提問聊天室、分享QR
- 新手教學層（gate-intro/tutorial-overlay）
- 「已知籤號查詢」「快速三問」等首頁替代路徑（`castLookupBwa` 等）

## 安裝方式

本模組假設宿主專案有 bundler（Vite/webpack/esbuild 皆可）能解析：
```
three
@mediapipe/hands
@mediapipe/camera_utils
```
以及 Vite 的 `?raw` CSS 字串 import 語法（`index.js` 裡的 `import stylesText from './styles.css?raw'`）。
如果宿主專案不是 Vite，請把這行改成該 bundler 對應的「把檔案內容當字串匯入」語法
（webpack: `asset/source`；esbuild: `loader: 'text'`）。

若完全不用 bundler，需要改用 import map 把上述三個套件指到 CDN ESM 版本，並手動
把 `styles.css` 的內容貼進 `index.js` 取代 `?raw` import。

## 使用方式

```html
<script type="module" src="/path/to/temple-ar-oracle/index.js"></script>

<temple-ar-oracle
  id="oracle"
  api-base="/api/v1"
></temple-ar-oracle>

<script type="module">
  const oracle = document.getElementById('oracle');

  oracle.addEventListener('input-mode-resolved', (e) => {
    // e.detail = { mode: 'camera'|'motion'|'manual', reason?, motionGranted? }
  });
  oracle.addEventListener('incense-complete', () => {});
  oracle.addEventListener('draw-complete', (e) => {
    // e.detail = { fortune: { no, ganzhi, grade, poem, explain, modern } }
  });
  oracle.addEventListener('bwa-result', (e) => {
    // e.detail = { tier: 'sacred'|'sheng-progress'|'other', attemptNumber?, remainingAttempts?, resultName? }
    // sacred = 聖筊已確認(可解籤); sheng-progress = 本次為聖筊但還沒達到連續次數要求;
    // other = 其他情況(笑筊/陰筊等，實際名稱看 resultName，這是後端給的字串，前端沒有寫死判斷)
  });
  oracle.addEventListener('sequence-complete', (e) => {
    // e.detail = { fortune, interpretation }
    // 整個儀式跑完，資料交給你自己的結果畫面
  });
  oracle.addEventListener('toast', (e) => {
    // e.detail = { message }，錯誤/提示訊息，怎麼顯示由你決定
  });

  await oracle.start({ question: '事業運勢如何？', category: '工作事業' });

  // 離開頁面/切換路由時務必呼叫，釋放camera + three.js資源
  window.addEventListener('beforeunload', () => oracle.destroy());
</script>
```

### `start(options)` 參數
| 參數 | 說明 |
|---|---|
| `question` | 使用者輸入的問題（字串） |
| `category` | 分類，預設 `'綜合運勢'` |
| `inputMode` | `'auto'`（預設）、`'manual'` 兩者是唯一實際有效的值；`'camera'`/`'motion'` 目前只是保留給未來擴充的識別值，實際效果等同 `'auto'`（見下方說明） |

**⚠️ 誠實說明目前 `inputMode` 的真實行為（這不是完整的四種模式，之前對話裡講得比較樂觀）：**
- `'manual'`：一律走純點擊路徑，略過鏡頭/搖晃偵測（真的有作用）
- `'auto'`（或其他任何值，包含 `'camera'`/`'motion'`）：內部依裝置自動判斷——手機一律走
  devicemotion 搖晃，桌機一律嘗試開鏡頭。**目前沒有辦法用 `inputMode` 強制「在桌機上模擬手機
  搖晃模式」或「在手機上強制走鏡頭模式」**，這點原始碼本身也沒有支援（原始碼是純粹用
  User-Agent 判斷裝置，沒有讓使用者覆蓋的機制），所以這裡是如實保留原始行為的邊界，而不是
  我漏做。如果新前端需要「強制指定模式」的能力，這是需要額外新開發的功能，不在這次搬遷範圍內。

也可以改用 HTML attribute 傳入（`question`/`category`/`input-mode`），效果相同。

### 可覆蓋的 CSS 變數
CSS 自訂屬性能穿透 Shadow DOM 邊界，宿主頁面可以直接覆蓋配色：
```css
temple-ar-oracle {
  --gold: #d4af37;
  --jiang-hong: #a63a3a;
  --ink: #3a2c22;
  /* 完整清單見 styles.css 開頭的 :root 區塊 */
}
```

## 框架整合

### Vue 3
```ts
// vite.config.ts
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'temple-ar-oracle' } } })
```
```vue
<temple-ar-oracle ref="oracleEl" />
```
```js
oracleEl.value.addEventListener('sequence-complete', handler)
oracleEl.value.start({ question, category })
```

### React
```jsx
const ref = useRef(null);
useEffect(() => {
  const el = ref.current;
  el.addEventListener('sequence-complete', handler);
  el.start({ question, category });
  return () => { el.removeEventListener('sequence-complete', handler); el.destroy(); };
}, []);
return <temple-ar-oracle ref={ref} />;
```

## 檔案結構與行數（原始碼 → 新檔案對照）

| 新檔案 | 行數 | 來源（temple_oracle_v17.html 行號） |
|---|---|---|
| `engine/config.js` | 47 | 1275–1317 |
| `engine/state.js` | 42 | 2650（AppState定義，抽取AR相關欄位） |
| `engine/particle-system.js` | 104 | 1637–1717 |
| `engine/audio-engine.js` | 69 | 1719–1784（完全原封不動） |
| `engine/bwa-scene.js` | 346 | 1808–2116 |
| `engine/gesture-engine.js` | 448 | 2118–2543 |
| `engine/mobile-shake.js` | 97 | 2648–2728 |
| `engine/divination-api.js` | 87 | 2560–2646（僅AR核心用到的5支API） |
| `engine/flow-controller.js` | 358 | 2749–3361（UIActions，精選AR核心部分） |
| `template.js` | 149 | 1004–1150（HTML markup） |
| `styles.css` | 278 | 17–717（CSS子集 + Tailwind等價換算） |
| `index.js` | 238 | 新增（Web Component組裝邏輯 + 4108–4126的camera bootstrap） |

**總計約 2260 行（原始單檔4129行），分成12個檔案，最大單檔448行（gesture-engine.js）。**
跟先前分析階段預估的「9個檔案、約2000行」相比，實際做下來多了3個檔案（state.js、
divination-api.js是分析時沒完全預估到、額外拆出來的）、行數也略高於預估
（主要是每個檔案都補上了完整的中文說明註解，交代原始行號/調整原因，方便你之後核對）。

## 已知的行為調整（不是原封不動，這裡列出全部）

1. **鏡頭權限被拒絕的處理**：原本 `window.parent.location.assign('/temple-oracle-v17?mode=manual')`
   （假設自己活在iframe裡），改為元件內部直接切換到手動點擊模式，並透過
   `input-mode-resolved` 事件（`reason: 'permission-denied'`）通知宿主頁面，不做任何頁面跳轉。
2. **手勢視覺標記點（fingertip-marker等）** 原本 `document.body.appendChild(...)`，
   改為 append 到元件自己的 Shadow DOM 容器，避免跳出封裝邊界。
3. **`screenShakeOnce`/`spawnLightBurst`** 原本對 `document.body` 動手，改為對元件自己的
   容器動手，效果相同，只是作用範圍從「整個網頁」限縮成「元件自己」。
4. **`goHome()`** 原本會一併關閉 profile/vow/history/chat 等周邊 modal，這裡改名
   `reset()` 且只保留AR核心場景的重置，周邊 modal 交還給新前端自己管理。
5. **`castClickBwa()` 內原本判斷 `AppState.isFortuneLookup`** 導向 `castLookupBwa()` 的分支
   已移除（因為「已知籤號查詢」模式本身沒有搬過來，屬於周邊功能）。

## 尚未驗證的部分（建議實際掛載到瀏覽器後測試）

這份抽取是逐行核對原始碼完成的靜態程式碼重組，但**還沒有在真實瀏覽器環境跑過**。
建議在真正整合進新專案前，至少驗證：
- 桌機鏡頭手勢三個階段（合十/搖籤/擲筊）是否正常觸發
- 手機 devicemotion 搖晃是否正常觸發、iOS 權限請求彈窗是否正常顯示
- 鏡頭權限被拒絕時，是否正確降級為手動點擊模式
- Three.js 筊杯的落地判定與視覺是否與原版一致
- 各 Tailwind class 換算後的視覺呈現，建議在多種螢幕寬度下截圖比對
