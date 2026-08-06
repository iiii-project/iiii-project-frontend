/* =========================================================================
   AR 核心引擎常數設定
   來源：temple_oracle_v17.html 原始 CONFIG 物件（1275–1317行）
   僅保留與手勢辨識／搖晃／擲筊判定相關的參數，逐一與原始檔案數值對照，
   數值本身完全未更動。原本 CONFIG.CATEGORIES（首頁分類清單）不屬於AR核心，
   已移除，改由外部（新前端）透過 attribute 傳入 question/category。
   ========================================================================= */
export const CONFIG = {
  FIST_CURL_RATIO: 1.15,
  FIST_MIN_CURLED: 3,
  SHAKE_VELOCITY_DEADZONE: 0.0035,
  SHAKE_REQUIRED_OSCILLATIONS: 3,
  SHAKE_MIN_DURATION_MS: 1400,
  SHAKE_TARGET_DURATION_MS: 2400,
  SHAKE_RESET_GRACE_MS: 500,

  PINCH_THRESHOLD_RATIO: 0.35,
  DRAW_UP_DELTA_RATIO: 0.09,

  // ---- 捧筊與拋擲（雙手合掌／分開手勢）----
  // 判定方式與下方「誠心機制」共用 palmCenter/handScale：取雙手掌心中心點距離，
  // 除以手掌尺度正規化，避免使用者離鏡頭遠近不同造成誤判。
  CUP_PALM_DIST_MAX: 0.9,        // 雙手掌心距離需小於此值，才視為「合掌捧筊」（沿用合十判定的同一門檻）
  CUP_MIN_HOLD_MS: 350,          // 合掌後至少要停留這麼久，筊杯才會真的「停在掌心上」，也濾掉剛合掌瞬間的手部抖動
  // 放寬（原 1.8 / 0.004）：實測門檻太高導致雙手往下分開時常常判定不到，體感「丟不出去」
  CUP_SEPARATE_DIST_MIN: 1.5,    // 雙手掌心距離超過此值，視為已明顯分開，判定擲出
  CUP_SEPARATE_RATE_AUX: 0.0028, // 掌心距離的變化速率（正規化距離/毫秒）超過此值，代表雙手正快速分開，及早輔助觸發擲出
  CUP_SEPARATE_CONFIRM_FRAMES: 1,// 需連續幾影格偵測到「分開」才確認擲出，避免單影格雜訊誤判
  // 雙手分開瞬間常有一手短暫離開偵測範圍：此時改用僅存那隻手的瞬時速度輔助判定，
  // 也用於整段追蹤突然中斷（雙手都不見）時，依最後已知速度推算是否已擲出
  THROW_VELOCITY_AUX: 0.32,  // px/ms，超過此瞬時速度即可輔助觸發拋擲
  SMOOTHING: 0.5,

  // ---- 誠心機制：雙手合十 ----
  // 判定改用「雙手掌心中心點距離」並依手掌尺度正規化，較單純比較手腕座標更貼近「合十」的實際動作，
  // 也不受使用者離鏡頭遠近影響。同時提供「單手穩定」備援路徑：
  // 因雙手合十時兩手影像高度重疊，MediaPipe 有時只能辨識出其中一隻手，
  // 此時只要偵測到的那隻手停留在畫面中央且保持穩定，也視為合十候選，避免因遮擋而完全偵測不到。
  INCENSE_PALM_DIST_MAX: 0.9,     // 雙手掌心距離（除以手掌尺度）需小於此值
  INCENSE_HOLD_MS: 1700,          // 縮短至 1.7 秒，減少枯燥的無感等待
  INCENSE_CENTER_X: [0.28, 0.72], // 單手備援路徑：手部須落在畫面水平置中範圍
  INCENSE_CENTER_Y: [0.3, 0.85],  // 單手備援路徑：手部須落在畫面垂直置中範圍
  INCENSE_STILL_VELOCITY_MAX: 0.006, // 單手備援路徑：每影格移動量需小於此值才算「穩定」
  INCENSE_FOLLOW_EASE: 0.18,       // 香跟隨手部時的低通濾波，越小越柔和
  INCENSE_FOLLOW_Y_OFFSET: 0.1,   // 香位於合十雙手稍下方，避免遮住掌心
  INCENSE_TILT_MAX: 8,             // 跟隨手部左右移動時的最大傾角

  // ---- 環境光連動 / 粒子互動 ----
  AMBIENT_SAMPLE_MS: 300,      // 環境亮度取樣間隔
  PARTICLE_REPEL_RADIUS: 90,   // 手部撥動金色香灰粒子的作用半徑（px）
};
