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
import { Camera } from '@mediapipe/camera_utils';

import { CONFIG } from './engine/config.js';
import { createArState } from './engine/state.js';
import { AudioEngine } from './engine/audio-engine.js';
import { createGestureEngine } from './engine/gesture-engine.js';
import { createDivinationApi } from './engine/divination-api.js';
import { createFlowController, preloadOracleTransition } from './engine/flow-controller.js';
import { renderTemplate } from './template.js';
import { getPerformanceProfile } from '@/utils/performance';

// styles.css 內容以字串方式內嵌，避免額外一次網路請求，且確保 Shadow DOM
// 一定拿得到樣式（無論宿主專案的建置工具是否支援 CSS 檔案 import）。
// 開發時仍是獨立的 styles.css 檔案，建置腳本可自行選擇要 inline 還是額外複製。
import stylesText from './styles.css?raw';

/* Three.js 與筊杯 GLB 只在真正進入擲筊階段才需要。這個代理保留 flow-controller
   原本的同步介面，但把 598 KB 的 Three.js chunk 延後到 init/resume/toss 第一次
   被呼叫時才下載、解析，避免上香與抽籤期間佔用主執行緒。 */
function createLazyBwaScene(state) {
  let scene = null;
  let loading = null;
  let container = null;
  let destroyed = false;

  function ensure() {
    if (scene) return Promise.resolve(scene);
    if (!loading) {
      loading = import('./engine/bwa-scene.js').then(({ createBwaScene }) => {
        if (destroyed) return null;
        scene = createBwaScene(state);
        return Promise.resolve(container ? scene.init(container) : undefined).then(() => scene);
      });
    }
    return loading;
  }

  return {
    init(el) {
      container = el;
      return ensure();
    },
    prepare(el) {
      container = el;
      return ensure();
    },
    pause() {
      scene?.pause?.();
    },
    resume() {
      void ensure().then((value) => value?.resume?.());
    },
    resetIdle() {
      if (scene) scene.resetIdle();
      else void ensure().then((value) => value?.resetIdle?.());
    },
    toss(...args) {
      void ensure().then((value) => value?.toss?.(...args));
    },
    getScreenPos() {
      return scene?.getScreenPos?.() || { x: window.innerWidth / 2, y: window.innerHeight * 0.55 };
    },
    destroy() {
      destroyed = true;
      scene?.destroy?.();
      scene = null;
    },
    hitTest(...args) {
      return scene?.hitTest?.(...args) || false;
    },
  };
}

class TempleArOracle extends HTMLElement {
  static get observedAttributes(){ return ['question', 'category', 'api-base', 'input-mode']; }

  constructor(){
    super();
    this.attachShadow({ mode: 'open' });
    this._destroyed = false;
    this._started = false;
    this._cameraPromise = null;
    this._cameraInferenceEnabled = false;
    this._modelsWarmed = false;
    this._modelWarmupPromise = null;
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
    if (getPerformanceProfile().isLowEnd) root.classList.add('ar-low-end');
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
    this._state.useSelfieSegmentation = getPerformanceProfile().useSelfieSegmentation;
    this._bwaScene = createLazyBwaScene(this._state);
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

    /* 領籤過場影片來源：預設吃引擎內建的 oracle-transition.mov，
       宿主頁面可用 transition-src attribute 覆蓋（例如桌機版換成 dragon.mp4）。
       只在建立當下讀一次，過場開始播放後才換片沒有意義，不需要做成響應式的。 */
    const transitionSrc = this.getAttribute('transition-src') || undefined;
    /* 預設的 oracle-transition.mov 是直式 720x1280，桌機用 cover 會裁掉龍與籤枝
       （見 styles.css 內的說明），所以預設保留 contain、兩側留白。
       換過影片（如 dragon.mp4）不受這個限制，交由 data-fill 讓 CSS 改用 cover 鋪滿。 */
    if (transitionSrc) this._els.transitionVideo.dataset.fill = '1';
    // 使用實際播放用的 video 元素提前載入與解碼，避免切到擲筊時才初始化影片。
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
      emit: (name, detail) => this._emit(name, detail),
      transitionSrc,
    });

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

    const profile = getPerformanceProfile();
    // JJ5 直接跳過 Selfie Segmentation；其他裝置也只在真的啟用去背時
    // 動態下載該模型，避免 AR 啟動就多載入一個大型 WASM/JS chunk。
    const segmentationClassPromise = profile.useSelfieSegmentation
      ? import('@mediapipe/selfie_segmentation').then((module) => module.SelfieSegmentation)
      : Promise.resolve(null);

    this._cameraPromise = segmentationClassPromise.then((SelfieSegmentationClass) => new Promise((resolve, reject) => {
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
       let selfieSegmentation = null;
       if (SelfieSegmentationClass) {
         selfieSegmentation = new SelfieSegmentationClass({
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
       }

       // 手勢/去背判斷不需要跟到攝影機全速——Camera utils 的 onFrame 是綁 rAF 觸發，
      // 沒有節流的話在高刷新率裝置上會逼近顯示器更新率去做推論。這裡把實際送進
       // MediaPipe 的頻率依裝置 profile 夾在 8~12 FPS，畫面本身（video/UI）仍照攝影機原生幀率顯示。
        const INFERENCE_INTERVAL_MS = 1000 / profile.arInferenceFps;
        let lastInferenceTime = 0;
        let inferenceBusy = false;
         let lastSegmentationTime = 0;
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
             // 分類選定時可以先開啟相機串流；真正開始儀式前不跑模型推論。
             if (!this._cameraInferenceEnabled) return;
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
                 lastSegmentationTime = 0;
              }

              // 先做 Hands；去背模型延後到第二輪，避免開鏡第一幀同時初始化兩個模型。
              await hands.send({ image: this._els.video });

               // 遮罩變化比手勢慢：依 profile 限制去背頻率，低階裝置不必每輪
               // 同時執行兩個模型；首次仍立即取得，避免畫面長時間沒有去背影像。
               const segmentationInterval = 1000 / profile.arSegmentationFps;
               if (selfieSegmentation && (!hasSegmentationMask || now - lastSegmentationTime >= segmentationInterval)) {
                 lastSegmentationTime = now;
                 await selfieSegmentation.send({ image: this._els.video });
                 hasSegmentationMask = true;
               }
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
    }));
    // 預熱呼叫可能早於 flow.start()，但仍共用同一個 Promise，避免重複開鏡。
    this._cameraPromise.catch(() => undefined);
    return this._cameraPromise;
  }

  async _warmupInferenceModels() {
    if (this._modelsWarmed) return;
    if (this._modelWarmupPromise) return this._modelWarmupPromise;

    this._modelWarmupPromise = (async () => {
      const video = this._els?.video;
      if (!video || !this._hands) return;

      // 只送一格影像讓 WASM/model 完成下載與編譯；此時不開啟流程判定。
      await this._hands.send({ image: video });
      if (this._selfieSegmentation) {
        await this._selfieSegmentation.send({ image: video });
      }
      this._modelsWarmed = true;
    })().catch((error) => {
      this._modelWarmupPromise = null;
      throw error;
    });

    return this._modelWarmupPromise;
  }

  /** 在開始求籤的使用者手勢中先開啟鏡頭並預熱模型；真正顯示場景仍由 start() 控制。 */
  async prepareCamera(){
    await this._startCamera();
    try {
      await this._warmupInferenceModels();
    } catch (error) {
      // 相機已經成功時，模型預熱失敗不阻擋正式流程；開始儀式後會再嘗試。
      console.warn('[temple-ar-oracle] 模型預熱失敗，將在儀式開始後重試', error);
    }
  }

  /** 選分類時建立 Three.js renderer、shader 與筊杯 mesh，切換場景時不再臨時初始化。 */
  prepareBwa(){
    return this._bwaScene.prepare?.(this._els.bwaThreeContainer);
  }

  /**
   * Reset the reusable ritual without releasing the warmed WebGL/MediaPipe
   * resources.  The host page keeps this element alive between route changes,
   * so the next ritual can start with the already compiled renderer and models.
   */
  reset(){
    if (this._destroyed) return;
    this._cameraInferenceEnabled = false;
    this._started = false;
    this._flow?.reset?.();
    if (this._state) {
      this._state.sessionId = null;
      this._state.shareToken = null;
      this._state.currentFortune = null;
      this._state.interpretation = null;
      this._state.pendingBwaResult = null;
      this._state.resolvedMode = null;
      this._state.clickBwaMode = false;
      this._state.transitionActive = false;
    }
  }

  /**
   * 啟動整個插香→搖籤→擲筊儀式。
   * @param {{question?: string, category?: string, inputMode?: 'camera'|'manual'}} [options]
   */
  async start(options = {}){
    if (this._started) return;
    this._started = true;
    const question = options.question ?? this.getAttribute('question') ?? '';
    const category = options.category ?? this.getAttribute('category') ?? '綜合運勢';
    const requestedMode = options.inputMode ?? this.getAttribute('input-mode') ?? 'camera';
    this._cameraInferenceEnabled = requestedMode === 'camera';

    try {
      await this._flow.start({
        question,
        category,
        requestedMode,
        startCamera: () => this._startCamera(),
      });
    } catch (error) {
      this._cameraInferenceEnabled = false;
      this._started = false;
      this._emit('toast', { message: error?.message || '無法開始求籤，請稍後再試' });
      throw error;
    }
  }

  /** 釋放所有資源（camera stream、three.js WebGL context、動畫迴圈、DOM marker）。 */
  destroy(){
    if (this._destroyed) return;
    this._destroyed = true;
    this._cameraInferenceEnabled = false;
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
  }
}

if (!customElements.get('temple-ar-oracle')) {
  customElements.define('temple-ar-oracle', TempleArOracle);
}

/*
 * One persistent AR host for the whole app.  Route components are short-lived,
 * but disposing this element would also dispose the Three.js context and force
 * shader compilation again on every visit to /oracle.  Keep it outside Vue's
 * route tree; callers only hide/reset it between rituals.
 */
let persistentOracle = null;

export function getPersistentTempleArOracle({ apiBase = '/api/v1', transitionSrc = '/videos/dragon.mp4' } = {}) {
  if (!persistentOracle) {
    persistentOracle = document.createElement('temple-ar-oracle');
    persistentOracle.setAttribute('api-base', apiBase);
    persistentOracle.setAttribute('transition-src', transitionSrc);
    persistentOracle.style.visibility = 'hidden';
    persistentOracle.style.pointerEvents = 'none';
    persistentOracle.style.zIndex = '-1';
    persistentOracle.style.background = '#120d0a';
    document.body.appendChild(persistentOracle);
  }
  return persistentOracle;
}

export { TempleArOracle };
