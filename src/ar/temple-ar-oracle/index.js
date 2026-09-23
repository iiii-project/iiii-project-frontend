/* =========================================================================
   <temple-ar-oracle> — 插香 → 搖籤抽籤 → 擲筊 的獨立、不綁框架 Web Component

   這是整個AR核心模組的入口，把 engine/ 底下所有模組組裝起來，定義成一個
   原生 Custom Element，讓任何前端框架（或完全不用框架）都能用同一種方式掛載。

   【外部依賴】
   本檔案假設執行環境有 bundler（Vite/webpack/esbuild 皆可，專案本身用 Vite）
   能解析以下 npm 套件（package.json 裡都已經有）：
     three, @mediapipe/hands, @mediapipe/camera_utils
   如果新專案完全不用 bundler，需要改用 import map 或把這幾行 import 換成
   CDN ESM 版本，詳見 README.md「零建置環境」章節。

   【對外介面】見 README.md，這裡只列重點：
     屬性(attribute)：question, category, api-base, input-mode
     方法：start(), destroy()
     事件：input-mode-resolved, incense-complete, draw-complete, bwa-result,
           sequence-complete, toast
   ========================================================================= */
import { Hands } from '@mediapipe/hands';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';

import { CONFIG } from './engine/config.js';
import { createArState } from './engine/state.js';
import { AudioEngine } from './engine/audio-engine.js';
import { createBwaScene } from './engine/bwa-scene.js';
import { createGestureEngine } from './engine/gesture-engine.js';
import { createMobileShake } from './engine/mobile-shake.js';
import { createDivinationApi } from './engine/divination-api.js';
import { createFlowController , preloadOracleTransition } from './engine/flow-controller.js';
import { renderTemplate } from './template.js';
import { getPerformanceProfile } from '@/utils/performance';

// styles.css 內容以字串方式內嵌，避免額外一次網路請求，且確保 Shadow DOM
// 一定拿得到樣式（無論宿主專案的建置工具是否支援 CSS 檔案 import）。
// 開發時仍是獨立的 styles.css 檔案，建置腳本可自行選擇要 inline 還是額外複製。
import stylesText from './styles.css?raw';

class TempleArOracle extends HTMLElement {
  static get observedAttributes(){ return ['question', 'category', 'api-base', 'input-mode']; }

  constructor(){
    super();
    this.attachShadow({ mode: 'open' });
    this._destroyed = false;
    this._started = false;
    this._cameraPromise = null;
  }

  connectedCallback(){
    if (this._built) return;
    this._built = true;
    this._build();
  }

  disconnectedCallback(){
    this.destroy();
  }

  _emit(name, detail){
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  _build(){
    const style = document.createElement('style');
    style.textContent = stylesText;
    this.shadowRoot.appendChild(style);

    const root = document.createElement('div');
    root.className = 'ar-oracle-root';
    root.innerHTML = renderTemplate();
    this.shadowRoot.appendChild(root);
    this._root = root;

    // DOM 參照快取（對應原始碼的 `els` 物件，範圍只限AR核心用到的部分）
    const $ = (id) => root.querySelector('#' + id);
    this._els = {
      video: root.querySelector('#input_video'),
      outputCanvas: $('output_canvas'),
      arDecoration: $('ar-decoration'),
      ritualOverlay: $('ritual-overlay'),
      flash: $('flash'),
      darken: $('darken'),
      transitionOverlay: $('transition-overlay'),
      transitionVideo: $('oracle-transition-video'),
      sceneIncense: $('scene-incense'),
      sceneDraw: $('scene-draw'),
      sceneBwa: $('scene-bwa'),
      incenseHint: $('incense-hint'),
      incenseAnchor: $('incense-anchor'),
      incenseRing: $('incense-progress-ring'),
      incenseStick: $('incense-stick'),
      drawHint: $('draw-hint'),
      qianTongZone: root.querySelector('#qian-tong-zone'),
      sticksGroup: root.querySelector('#sticks'),
      shakeRing: $('shake-progress-ring'),
      qianStick: $('qian-stick'),
      qianTong: $('qian-tong'),
      btnManualDraw: $('btn-manual-draw'),
      bwaHint: $('bwa-hint'),
      bwaThreeContainer: $('bwa-three-container'),
      btnClickBwa: $('btn-click-bwa'),
      bwaResultPanel: $('bwa-result-panel'),
      bwaResultTitle: $('bwa-result-title'),
      bwaResultDesc: $('bwa-result-desc'),
    };
    // 前面已經直接取得模板產生的 <video id="input_video"> 節點，不需要額外處理。

    this._state = createArState();
    this._bwaScene = createBwaScene(this._state);
    // 後端連不上時，divination-api 會自動切到本地備援資料把儀式跑完，
    // 並透過這個 callback 通知宿主頁面（讓外面有機會顯示「目前離線」的提示）。
    this._api = this._makeApi(this.getAttribute('api-base'));

    // 注意建立順序：gestureEngine 要先建立，flow-controller 才能拿到「真正的」
    // gestureEngine 實例。gestureEngine 建立時雖然也需要「呼叫 flow-controller
    // 的方法」（completeIncense/completeDraw/tossBwa），但這裡用箭頭函式包起來，
    // 實際讀取 this._flow 是「被呼叫的當下」才發生（那時 _build() 早已跑完），
    // 不是建立的當下，所以兩者不會真的互相卡住，不需要額外的回填/patch機制。
    this._gestureEngine = createGestureEngine({
      els: this._els,
      state: this._state,
      config: CONFIG,
      rootEl: root,
      callbacks: {
        completeIncense: () => this._flow.completeIncense(),
        completeDraw: () => this._flow.completeDraw(),
        tossBwa: (sx, sy, vx, vy) => this._flow.tossBwa(sx, sy, vx, vy),
      },
    });

    this._mobileShake = createMobileShake({
      els: this._els,
      state: this._state,
      callbacks: {
        completeDraw: () => this._flow.completeDraw(),
        // 裝置拿得到權限但實際上沒有加速度計時，把「直接抽籤」按鈕放出來
        onMotionUnavailable: () => {
          this._els.btnManualDraw.classList.remove('hidden');
          this._els.btnManualDraw.textContent = '直 接 抽 籤';
          this._els.drawHint.textContent = '沒有偵測到搖動，可直接抽籤。';
          this._emit('toast', { message: '沒有偵測到搖動，已提供直接抽籤。' });
        },
      },
    });

    /* 領籤過場影片來源：預設吃引擎內建的 oracle-transition.mov，
       宿主頁面可用 transition-src attribute 覆蓋（例如桌機版換成 dragon.mp4）。
       只在建立當下讀一次，過場開始播放後才換片沒有意義，不需要做成響應式的。 */
    const transitionSrc = this.getAttribute('transition-src') || undefined;
    /* 預設的 oracle-transition.mov 是直式 720x1280，桌機用 cover 會裁掉龍與籤枝
       （見 styles.css 內的說明），所以預設保留 contain、兩側留白。
       換過影片（如 dragon.mp4）不受這個限制，交由 data-fill 讓 CSS 改用 cover 鋪滿。 */
    if (transitionSrc) this._els.transitionVideo.dataset.fill = '1';

    // 過場影片先預載，播放時才不會頓一下
    preloadOracleTransition(this._els, { src: transitionSrc });

    /* 攝影機畫布的後備緩衝區要在這裡就校正好。
       原本只在 MediaPipe 送影格時才校正，但搖籤模式不開鏡頭、
       永遠等不到影格，畫布就會一直停在 HTML 預設的 300x150。 */
    this._gestureEngine.syncCanvasSize();
    this._onViewportResize = () => this._gestureEngine.syncCanvasSize();
    window.addEventListener('resize', this._onViewportResize);
    window.addEventListener('orientationchange', this._onViewportResize);

    this._flow = createFlowController({
      els: this._els,
      state: this._state,
      api: this._api,
      gestureEngine: this._gestureEngine,
      bwaScene: this._bwaScene,
      audioEngine: AudioEngine,
      mobileShake: this._mobileShake,
      emit: (name, detail) => this._emit(name, detail),
      transitionSrc,
    });

    this._bwaScene.init(this._els.bwaThreeContainer);

    this._els.btnManualDraw.addEventListener('click', () => this._flow.completeDraw());
    this._els.btnClickBwa.addEventListener('click', () => this._flow.castClickBwa());

    /* 手動／搖籤模式：直接點筊杯就擲出。
       容器平時是 pointer-events:none，只有 flow-controller 掛上 .tossable 時才收得到事件；
       命中判定交給 bwa-scene 的射線測試（含手指的容錯範圍）。 */
    this._els.bwaThreeContainer.addEventListener('pointerdown', (event) => {
      if (!this._state.clickBwaMode || this._state.current !== 'bwa' || this._state.bwaTossing) return;
      if (!this._bwaScene.hitTest(event.clientX, event.clientY)) return;
      event.preventDefault();
      this._flow.castClickBwa();
    });

    // 初次載入即嘗試把 attribute 值同步進 state.userQuery（真正建立場次要等 start() 呼叫）
    this._syncAttributesToState();
  }

  _makeApi(apiBase){
    return createDivinationApi(apiBase, {
      onOffline: () => {
        this._emit('offline', { message: '目前離線，已改用內建籤詩' });
        this._emit('toast', { message: '目前離線，先為你以預設籤詩完成這次請示' });
      },
    });
  }

  _syncAttributesToState(){
    this._state.userQuery = {
      question: this.getAttribute('question') || '',
      category: this.getAttribute('category') || '綜合運勢',
    };
  }

  attributeChangedCallback(name, oldVal, newVal){
    if (!this._built) return;
    if (name === 'question' || name === 'category') this._syncAttributesToState();
    if (name === 'api-base') this._api = this._makeApi(newVal);
  }

  // MediaPipe Hands + Camera 啟動（對應原始碼檔案尾端 4108–4126 行的 bootstrap，
  // 這裡包成一個 Promise 回傳的函式，供 flow-controller.start() 呼叫）
  _startCamera(){
    if (this._cameraPromise) return this._cameraPromise;

    this._cameraPromise = new Promise((resolve, reject) => {
      const profile = getPerformanceProfile();
       // 中低階 Android 上手勢/去背推論多半落在 wasm/CPU 路徑；開鏡先用單手模式，
       // 進入搖籤／擲筊場景時才切換兩手，避免把不必要的負載集中在開鏡瞬間。
      const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      const handOptions = { modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 };
      let activeMaxHands = 1;
      hands.setOptions({ ...handOptions, maxNumHands: activeMaxHands });
      hands.onResults(this._gestureEngine.onResults);
      this._hands = hands;

      /* 人像去背：把最新的分割遮罩存進共用的 state，讓 gesture-engine 畫
         #output_canvas 時可以只畫出人像、其餘鏤空，讓底下的神明實景疊加層透出來。
         跟 Hands 各自獨立送同一格畫面，彼此不互相依賴、也不用等對方。 */
      const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });
      selfieSegmentation.setOptions({ modelSelection: 1 });
       selfieSegmentation.onResults((results) => {
         this._state.segmentationMask = results.segmentationMask;
         // 預熱可能在 flow.start() 之前完成；若場景已經顯示，遮罩一到就
         // 立即揭露人物，不再等待固定的 ritual veil 計時器。
         if (this._state.resolvedMode === 'camera' && this._state.current !== 'creating' && this._state.current !== 'transition') {
           this._els.ritualOverlay?.classList.add('blended');
           this._els.outputCanvas?.classList.add('blended');
         }
       });
      this._selfieSegmentation = selfieSegmentation;

      // 手勢/去背判斷不需要跟到攝影機全速——Camera utils 的 onFrame 是綁 rAF 觸發，
      // 沒有節流的話在高刷新率裝置上會逼近顯示器更新率去做推論。這裡把實際送進
       // MediaPipe 的頻率依裝置 profile 夾在 8~12 FPS，畫面本身（video/UI）仍照攝影機原生幀率顯示。
        const INFERENCE_INTERVAL_MS = 1000 / profile.arInferenceFps;
        let lastInferenceTime = 0;
        let inferenceBusy = false;
        let inferenceCount = 0;
        let inferenceEnabledAt = Number.POSITIVE_INFINITY;
        let hasSegmentationMask = false;

       // Camera Utils 的 width/height 會影響手機實際送進 MediaPipe 的影像方向。
       // 直式時交換尺寸，避免瀏覽器以橫式影像裁切後再交給模型，造成上下
       // 搖動在畫面座標裡被壓縮，尤其低階 Android 更明顯。
       const portrait = window.innerHeight > window.innerWidth;
       const cameraWidth = portrait ? profile.arCameraHeight : profile.arCameraWidth;
       const cameraHeight = portrait ? profile.arCameraWidth : profile.arCameraHeight;
       const camera = new Camera(this._els.video, {
          onFrame: async () => {
            const now = performance.now();
            // 先讓 camera/video、AR 畫面與頁面完成第一輪繪製，再啟動兩個
            // MediaPipe WASM 模型，避免使用者按下開始後立刻被模型編譯卡住。
            if (now < inferenceEnabledAt) return;
            if (inferenceBusy || now - lastInferenceTime < INFERENCE_INTERVAL_MS) return;
            lastInferenceTime = now;
            inferenceBusy = true;
            try {
               const wantedMaxHands = this._state.current === 'draw' || this._state.current === 'bwa' ? 2 : 1;
              if (wantedMaxHands !== activeMaxHands) {
                activeMaxHands = wantedMaxHands;
                hands.setOptions({ ...handOptions, maxNumHands: activeMaxHands });
                inferenceCount = 0;
              }

              // 先做 Hands；去背模型延後到第二輪，避免開鏡第一幀同時初始化兩個模型。
              await hands.send({ image: this._els.video });

              // 遮罩變化比手勢慢：首次取得後每三輪更新一次，低階裝置不必每輪
              // 同時執行兩個模型。沒有遮罩時第二輪一定補做一次，仍不會閃出原始畫面。
              if (!hasSegmentationMask || inferenceCount % 3 === 0) {
                await selfieSegmentation.send({ image: this._els.video });
                hasSegmentationMask = true;
              }
              inferenceCount += 1;
            } finally {
              inferenceBusy = false;
            }
         },
          width: cameraWidth,
          height: cameraHeight,
      });
      this._camera = camera;

       camera.start().then(() => {
         // 低階裝置多留一點時間給 video、頁面合成與權限提示完成；這段期間
         // 仍由 ritual-overlay 蓋住鏡頭，不會露出未去背的原始畫面。
         inferenceEnabledAt = performance.now() + (profile.isLowEnd ? 350 : 180);
         resolve();
       }).catch((error) => {
         this._cameraPromise = null;
         reject(error);
       });
    });
    // 預熱呼叫可能早於 flow.start()，但仍共用同一個 Promise，避免重複開鏡。
    this._cameraPromise.catch(() => undefined);
    return this._cameraPromise;
  }

  /** 在開始求籤的使用者手勢中先開啟鏡頭並預熱模型；真正顯示場景仍由 start() 控制。 */
  prepareCamera(){
    return this._startCamera();
  }

  /**
   * 啟動整個插香→搖籤→擲筊儀式。
   * @param {{question?: string, category?: string, inputMode?: 'auto'|'camera'|'motion'|'manual'}} [options]
   */
  async start(options = {}){
    if (this._started) return;
    this._started = true;
    const question = options.question ?? this.getAttribute('question') ?? '';
    const category = options.category ?? this.getAttribute('category') ?? '綜合運勢';
    const requestedMode = options.inputMode ?? this.getAttribute('input-mode') ?? 'auto';

    try {
      await this._flow.start({
        question,
        category,
        requestedMode,
        startCamera: () => this._startCamera(),
        motionAccessGranted: options.motionAccessGranted,
      });
    } catch (error) {
      this._started = false;
      this._emit('toast', { message: error?.message || '無法開始求籤，請稍後再試' });
      throw error;
    }
  }

  /** 釋放所有資源（camera stream、three.js WebGL context、動畫迴圈、DOM marker）。 */
  destroy(){
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._onViewportResize){
      window.removeEventListener('resize', this._onViewportResize);
      window.removeEventListener('orientationchange', this._onViewportResize);
      this._onViewportResize = null;
    }
    try { this._camera?.stop?.(); } catch (e) {}
    this._cameraPromise = null;
    try { this._hands?.close?.(); } catch (e) {}
    try { this._selfieSegmentation?.close?.(); } catch (e) {}
    try {
      const stream = this._els?.video?.srcObject;
      if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop());
    } catch (e) {}
    this._bwaScene?.destroy?.();
    this._gestureEngine?.destroy?.();
    this._mobileShake?.stop?.();
  }
}

if (!customElements.get('temple-ar-oracle')) {
  customElements.define('temple-ar-oracle', TempleArOracle);
}

export { TempleArOracle };
