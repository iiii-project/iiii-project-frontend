/* =========================================================================
   AR核心場景 HTML 模板
   來源：temple_oracle_v17.html 1004–1150行，逐字保留（籤筒/筊杯的SVG向量圖形
   一筆一劃未更動，這是你在Q1明確要求「不重新設計」的部分）。

   只做了以下必要調整（皆為位置搬遷，不影響外觀）：
   - 移除跟AR核心無關的其他元素（loading-screen/gate-intro/divination-loading/
     scene-home/各種modal……），這些屬於前面分析階段歸類的「周邊UI」。
   - #result-bg 沒有納入（它是結果畫面的背景色效果，由showResultScene()這個
     周邊功能控制，不是AR核心的一部分）。
   ========================================================================= */
/* 三階段（插香/抽籤/擲筊）進場的「神明實景」疊加圖層：廟宇內部照 + 玉皇大帝神像照
   （神像照本身已去背，直接疊在背景照上方置中即可，不需要另外合成一張圖）。 */
const ritualOverlayBgUrl = new URL('../../assets/images/temple_background.jpg', import.meta.url).href
const ritualOverlayEmperorUrl = new URL('../../assets/images/jade.png', import.meta.url).href

export function renderTemplate() {
  return `
  <!-- 攝影機原始畫面（隱藏，僅供MediaPipe讀取像素）與鏡像後顯示用畫布 -->
  <video id="input_video" style="display:none;" playsinline></video>
  <canvas id="output_canvas"></canvas>
  <div id="vignette"></div>

  <div id="ar-decoration">
    <svg class="ar-coins-bl" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(30,30)"><circle r="26" fill="none" stroke="var(--gold-soft)" stroke-width="1.5"/><circle r="20" fill="none" stroke="var(--gold-soft)" stroke-width="1"/><rect x="-9" y="-9" width="18" height="18" fill="none" stroke="var(--gold-soft)" stroke-width="1.5" transform="rotate(45)"/></g>
      <g transform="translate(70,34)" opacity="0.75"><circle r="20" fill="none" stroke="var(--gold-soft)" stroke-width="1.5"/><circle r="15" fill="none" stroke="var(--gold-soft)" stroke-width="1"/><rect x="-7" y="-7" width="14" height="14" fill="none" stroke="var(--gold-soft)" stroke-width="1.5" transform="rotate(45)"/></g>
    </svg>
    <svg class="ar-scroll-br" viewBox="0 0 60 110" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="10" width="30" height="90" rx="8" fill="none" stroke="var(--gold-soft)" stroke-width="1.4"/>
      <ellipse cx="30" cy="10" rx="15" ry="8" fill="none" stroke="var(--gold-soft)" stroke-width="1.4"/>
      <ellipse cx="30" cy="100" rx="15" ry="8" fill="none" stroke="var(--gold-soft)" stroke-width="1.4"/>
      <line x1="21" y1="35" x2="39" y2="35" stroke="var(--gold-soft)" stroke-width="1" opacity="0.7"/>
      <line x1="21" y1="55" x2="39" y2="55" stroke="var(--gold-soft)" stroke-width="1" opacity="0.7"/>
      <line x1="21" y1="75" x2="39" y2="75" stroke="var(--gold-soft)" stroke-width="1" opacity="0.7"/>
    </svg>
    <svg class="ar-dragon-l" viewBox="0 0 100 800" xmlns="http://www.w3.org/2000/svg">
      <path d="M50,20 C20,60 80,110 40,160 C10,200 85,250 45,300 C15,340 80,390 42,440 C12,480 82,530 44,580 C16,620 78,670 48,720 C30,745 55,765 50,780" fill="none" stroke="var(--gold-soft)" stroke-width="2"/>
      <path d="M50,20 C58,8 70,6 74,14 C78,6 88,10 84,20 C90,18 92,26 86,30" fill="none" stroke="var(--gold-soft)" stroke-width="1.5"/>
      <circle cx="60" cy="22" r="2" fill="var(--gold-soft)"/>
      <path d="M40,160 q-14,4 -22,-2 M45,300 q-14,4 -22,-2 M42,440 q-14,4 -22,-2 M44,580 q-14,4 -22,-2" stroke="var(--gold-soft)" stroke-width="1.2" fill="none" opacity="0.8"/>
    </svg>
    <svg class="ar-dragon-r" viewBox="0 0 100 800" xmlns="http://www.w3.org/2000/svg">
      <path d="M50,20 C20,60 80,110 40,160 C10,200 85,250 45,300 C15,340 80,390 42,440 C12,480 82,530 44,580 C16,620 78,670 48,720 C30,745 55,765 50,780" fill="none" stroke="var(--gold-soft)" stroke-width="2"/>
      <path d="M50,20 C58,8 70,6 74,14 C78,6 88,10 84,20 C90,18 92,26 86,30" fill="none" stroke="var(--gold-soft)" stroke-width="1.5"/>
      <circle cx="60" cy="22" r="2" fill="var(--gold-soft)"/>
      <path d="M40,160 q-14,4 -22,-2 M45,300 q-14,4 -22,-2 M42,440 q-14,4 -22,-2 M44,580 q-14,4 -22,-2" stroke="var(--gold-soft)" stroke-width="1.2" fill="none" opacity="0.8"/>
    </svg>
  </div>

  <canvas id="particle_canvas"></canvas>
  <div class="flash-white" id="flash"></div>
  <div class="screen-darken" id="darken"></div>

  <!-- 神明實景疊加：插香/抽籤/擲筊三階段進場先100%不透明蓋住鏡頭畫面，
       過場結束後淡化到部分透明，讓使用者能透過這層畫面看到攝影機拍到的自己 -->
  <div id="ritual-overlay" class="ritual-overlay">
    <img class="ritual-overlay-bg" src="${ritualOverlayBgUrl}" alt="" />
    <div class="ritual-overlay-glow"></div>
    <img class="ritual-overlay-emperor" src="${ritualOverlayEmperorUrl}" alt="" />
  </div>

  <!-- 墨染 / 金線 場景過場遮罩 -->
  <video id="oracle-transition-video" muted playsinline preload="auto" aria-hidden="true"></video>
  <div id="transition-overlay"><div class="ink-blot"></div><div class="gold-ring"></div></div>

  <!-- ============ 畫面零：誠心機制（插香 / 合十默念）============ -->
  <div id="scene-incense" class="scene">
    <div class="glass-card ritual-card text-center fade-in absolute ar-top-10">
      <h1 class="ritual-title">誠　心　默　念</h1>
      <div class="hairline mt-4"></div>
      <p id="incense-hint" class="text-13px-md-sm mt-4 opacity-80 tracking-015em font-light">請雙手合十，於心中默念所求之事</p>
    </div>
    <div id="incense-anchor">
      <div id="incense-progress-ring"></div>
      <div id="incense-stick"><div class="stick-body"></div><div class="stick-tip"></div></div>
    </div>
  </div>

  <!-- ============ 畫面一：線上抽籤 ============ -->
  <div id="scene-draw" class="scene hidden justify-between ar-py-8vh">
    <div class="glass-card ritual-card text-center fade-in">
      <h1 class="ritual-title">祈　願　抽　籤</h1>
      <div class="hairline mt-4"></div>
      <p id="draw-hint" class="text-13px-md-sm mt-4 opacity-80 tracking-015em font-light">請對著籤筒握拳，上下搖晃</p>
      <button id="btn-manual-draw" class="btn-line mt-4 hidden" type="button">點 擊 抽 籤</button>
    </div>

    <div id="qian-tong-zone">
      <div id="shake-progress-ring"></div>
      <div id="qian-tong">
        <svg viewBox="0 0 200 340" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f2e2b3"/><stop offset="45%" stop-color="#d4af37"/><stop offset="100%" stop-color="#8a6a24"/></linearGradient>
            <linearGradient id="lacquerGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#3a1216"/><stop offset="38%" stop-color="#8a2b32"/><stop offset="52%" stop-color="#7a2229"/><stop offset="100%" stop-color="#2c0e11"/></linearGradient>
            <linearGradient id="bambooGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f0dca0"/><stop offset="50%" stop-color="#c99a5f"/><stop offset="100%" stop-color="#8a5a30"/></linearGradient>
          </defs>
          <g opacity="0.9">
            <path d="M100,304 C96,318 96,330 100,344" stroke="#8a2b32" stroke-width="3" fill="none"/>
            <path d="M92,306 L92,338 M100,308 L100,344 M108,306 L108,338" stroke="#7a2229" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="100" cy="304" r="6" fill="url(#goldGrad)"/>
          </g>
          <ellipse cx="100" cy="300" rx="66" ry="13" fill="url(#lacquerGrad)" stroke="var(--gold)" stroke-width="1.5"/>
          <ellipse cx="100" cy="296" rx="58" ry="10" fill="none" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.8"/>
          <path d="M38,96 C38,78 162,78 162,96 L167,288 C167,302 33,302 33,288 Z" fill="url(#lacquerGrad)" stroke="rgba(212,175,55,0.55)" stroke-width="1.5"/>
          <ellipse cx="100" cy="152" rx="61" ry="7" fill="none" stroke="url(#goldGrad)" stroke-width="2" stroke-dasharray="3 6" opacity="0.85"/>
          <ellipse cx="100" cy="232" rx="63" ry="7" fill="none" stroke="url(#goldGrad)" stroke-width="2" stroke-dasharray="3 6" opacity="0.85"/>
          <text x="100" y="196" text-anchor="middle" font-size="26" fill="url(#goldGrad)" opacity="0.5" font-family="'Noto Serif TC', serif">籤</text>
          <ellipse cx="100" cy="96" rx="62" ry="14" fill="url(#goldGrad)" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
          <ellipse cx="100" cy="94" rx="52" ry="10" fill="#241a12"/>
          <g id="sticks">
            <g class="stick" data-idx="0" data-cx="73.5"><rect x="70" y="8" width="7" height="92" rx="3" fill="url(#bambooGrad)" transform="rotate(-9 70 100)"/><circle cx="73.5" cy="10" r="4" fill="var(--gold)"/></g>
            <g class="stick" data-idx="1" data-cx="87.5"><rect x="84" y="0" width="7" height="98" rx="3" fill="url(#bambooGrad)" transform="rotate(-3 84 98)"/><circle cx="87.5" cy="2" r="4" fill="#c94b40"/></g>
            <g class="stick" data-idx="2" data-cx="103.5"><rect x="100" y="4" width="7" height="94" rx="3" fill="url(#bambooGrad)" transform="rotate(4 100 98)"/><circle cx="103.5" cy="6" r="4" fill="var(--gold)"/></g>
            <g class="stick" data-idx="3" data-cx="119.5"><rect x="116" y="10" width="7" height="90" rx="3" fill="url(#bambooGrad)" transform="rotate(10 116 100)"/><circle cx="119.5" cy="12" r="4" fill="#c94b40"/></g>
            <g class="stick" data-idx="4" data-cx="131.5"><rect x="128" y="18" width="7" height="82" rx="3" fill="url(#bambooGrad)" transform="rotate(15 128 100)"/><circle cx="131.5" cy="20" r="4" fill="var(--gold)"/></g>
          </g>
        </svg>
      </div>
      <div id="qian-stick" class="qian-stick hidden">
        <svg viewBox="0 0 16 168" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="activeBambooGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fbf1d8"/><stop offset="50%" stop-color="#e9c46a"/><stop offset="100%" stop-color="#8a6a24"/></linearGradient></defs>
          <rect x="3" y="0" width="10" height="168" rx="4" fill="url(#activeBambooGrad)"/>
          <circle cx="8" cy="6" r="7" fill="#c94b40" stroke="var(--gold)" stroke-width="1.5"/>
        </svg>
        <div class="stick-tip"></div>
      </div>
    </div>
  </div>

  <!-- ============ 畫面二：捧筊與拋擲 ============ -->
  <div id="scene-bwa" class="scene hidden justify-center items-center">
    <div class="glass-card ritual-card absolute ar-top-7vh text-center fade-in">
      <h2 class="ritual-title">擲　筊　請　示</h2>
      <div class="hairline mt-4"></div>
      <p id="bwa-hint" class="text-13px-md-sm mt-4 opacity-80 tracking-015em font-light">請伸出雙手，掌心合起捧住筊杯</p>
      <button id="btn-click-bwa" class="btn-line mt-4 hidden" type="button">擲　筊</button>
    </div>

    <!-- 筊杯以 Three.js 即時 3D 渲染（真實光照 + 陰影 + PBR 材質），取代先前的 2D 卡片翻轉 -->
    <div id="bwa-three-container"></div>

    <div id="bwa-result-panel" class="glass-card hidden absolute ar-bottom-9vh result-card text-center fade-in max-w-md">
      <p id="bwa-result-title" class="gold-text text-xl font-normal tracking-03em"></p>
      <p id="bwa-result-desc" class="text-13px opacity-80 leading-relaxed font-light tracking-wide"></p>
    </div>
  </div>
  `;
}
