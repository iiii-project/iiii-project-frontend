/* =========================================================================
   ArState — AR核心流程共用狀態

   原始檔案裡的 `AppState` 是一個橫跨全站的巨大全域物件（見 temple_oracle_v17.html
   2650行），除了插香/搖籤/擲筊需要的欄位，還混了 currentFortune、interpretation、
   sessionId、shareToken、userQuery……這些屬於「結果顯示/分享」等周邊功能。

   這裡只抽出 AR 引擎三個模組（GestureEngine / BwaScene / flow-controller）
   實際會讀寫、且原始值語意完全相同的欄位：

     current           'incense' | 'draw' | 'bwa'   目前在哪個場景（原欄位同名）
     drawSubState      'shake' | 'pinch'             抽籤子階段（原欄位同名）
     bwaTossing        boolean                        擲筊拋擲動畫是否進行中（原欄位同名）
     selectedStickCx   number                          抽到的籤枝在籤筒SVG裡的x座標（原欄位同名）
     mobileShakeReady  boolean                        手機是否已取得動作感測權限（原欄位同名）
     userQuery         { category, question }         使用者輸入的求籤問題/分類（原欄位同名，
                                                       原始碼裡由首頁表單寫入，這裡改由外部
                                                       attribute/property 於 start() 時寫入）

   每次呼叫 createArState() 都會產生一份「全新、獨立」的狀態，這是刻意的封裝調整：
   原始碼假設整個頁面只有一份 AppState 單例；Web Component 理論上可能被同一頁掛載
   多次（例如未來想同時測試新舊UI），所以改成工廠函式，每個元件實例各自擁有自己的狀態，
   彼此不會互相干擾。
   ========================================================================= */
export function createArState() {
  return {
    current: 'incense',
    drawSubState: 'shake',
    bwaTossing: false,
    selectedStickCx: 100,
    mobileShakeReady: false,
    userQuery: { category: '綜合運勢', question: '' },
    // 以下欄位是flow-controller在串接後端API時需要的場次資料，
    // 原始碼裡也都在同一個AppState物件裡，語意相同
    sessionId: null,
    shareToken: null,
    currentFortune: null,
    interpretation: null,
    pendingBwaResult: null,
    resolvedMode: null, // 'camera' | 'motion' | 'manual'，由 flow-controller.start() 解析後填入
  };
}
