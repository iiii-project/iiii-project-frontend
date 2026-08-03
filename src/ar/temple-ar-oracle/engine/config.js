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

  // ---- 捧筊與拋擲 ----
  // 手指彎曲量（指尖/指根 對 手腕 的距離比值）：數值越小代表握得越緊
  CUP_CURL_MAX: 1.0,      // 放寬：低於此值視為「微握捧筊」（原 0.95，避免手指沒完全彎曲就判定失敗）
  OPEN_CURL_MIN: 0.98,    // 放寬：高於此值視為「手掌張開」（原 1.05，減少因動作模糊測不到完全張開的漏判）
  OPEN_CONFIRM_FRAMES: 1, // 降為 1 影格即確認，反應更即時（輔以下方速度條件降低誤判機率）
  // 輔助判定：即使手指張開幅度不夠明顯，只要手腕移動的速度或加速度夠大，也視為「拋擲」動作
  THROW_VELOCITY_AUX: 0.55,  // px/ms，超過此瞬時速度即可輔助觸發拋擲
  THROW_ACCEL_AUX: 0.045,    // px/ms²，短時間內速度變化夠大（甩動感）也視為拋擲
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
