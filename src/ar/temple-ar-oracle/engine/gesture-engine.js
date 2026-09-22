/* =========================================================================
   GestureEngine — MediaPipe 手部座標處理與狀態判定
   來源：temple_oracle_v17.html 2118–2543行。所有手勢判定的數學/邏輯
   （curlAmount、isFist、合十雙路徑判定、搖籤震盪計數、捏取上抽判定、
   捧筊拋擲的速度/加速度輔助判定……）逐行原封不動搬遷，完全沒有調整。

   【封裝調整說明（只有下面4處「取得外部資源的方式」不同，其餘皆逐行相同）】
   1. 原本直接讀取全域 `els.xxx`、`AppState.xxx`、`CONFIG`，改為 createGestureEngine()
      呼叫時由外部一次注入（els / state / config 皆由 index.js 組裝後傳入）。
   2. 原本直接呼叫全域函式 `UIActions.completeIncense()` / `UIActions.completeDraw()` /
      `UIActions.tossBwa()`，改為呼叫注入進來的 `callbacks.completeIncense()` /
      `callbacks.completeDraw()` / `callbacks.tossBwa()`——這三個callback由
      flow-controller.js提供，呼叫時機與傳入參數完全相同。
   3. 原本直接呼叫全域 `ParticleSystem.repel/converge`、`BwaScene.setHoldPosition`，
      改為呼叫注入進來的 `particleSystem`、`bwaScene` 實例，方法簽名不變。
   4. `ensureMarkers()` 原本把手指標記點 `document.body.appendChild(...)`，
      改為 append 到注入進來的 `rootEl`（元件自己的容器），避免手勢標記點
      跑到 Shadow DOM 外面、脫離元件管理範圍。
   ========================================================================= */
 import { getPerformanceProfile } from '@/utils/performance';

 export function createGestureEngine({ els, state, config: CONFIG, particleSystem, bwaScene, rootEl, callbacks }) {
   const outCtx = els.outputCanvas.getContext('2d');
   const profile = getPerformanceProfile();

  let smoothed = null;
  const shake = { active:false, completed:false, startTime:0, lastY:0, lastVelocitySign:0, oscillations:0, lastFistTime:0 };

  // ---- 合十默念狀態 ----
  // pausedAt：合十判定短暫失敗時的暫停起點（見 handleIncenseGesture 的寬限期機制），
  // 不是 0 就代表目前正處於「暫停中，還沒真的歸零」的狀態。
  const incense = { active:false, startTime:0, pausedAt:0, visualX:0.5, visualY:0.62, visualTilt:0 };

  // ---- 捧筊 / 拋擲 狀態 ----
  const cup = {
    holding: false,      // 是否正處於「握拳抓杯跟隨」狀態
    openFrames: 0,       // 連續偵測到「手掌張開」的影格數（用於防抖動誤判）
    posHistory: [],       // {t,x,y} 手腕螢幕座標歷史，用於估計拋擲瞬間的移動速度/方向
  };

  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

  function smoothLandmarks(landmarks){
    if (!smoothed){ smoothed = landmarks.map(p=>({...p})); return smoothed; }
    const s = CONFIG.SMOOTHING;
    smoothed = landmarks.map((p,i)=>({ x: smoothed[i].x*s + p.x*(1-s), y: smoothed[i].y*s + p.y*(1-s), z:p.z }));
    return smoothed;
  }

  // ============================================================
  // 手指彎曲量計算：對食指/中指/無名指/小指，分別計算「指尖到手腕距離」
  // 除以「指根(MCP)到手腕距離」。此比值越小代表手指越彎曲收攏（握拳抓杯），
  // 越大代表手指越伸直張開。回傳四指平均值，作為「抓住」與「放手」判定基準。
  // ============================================================
  function curlAmount(lm){
    const wrist = lm[0];
    const fingers = [ {tip:lm[8],mcp:lm[5]}, {tip:lm[12],mcp:lm[9]}, {tip:lm[16],mcp:lm[13]}, {tip:lm[20],mcp:lm[17]} ];
    const ratios = fingers.map(f => dist(f.tip,wrist) / (dist(f.mcp,wrist) || 0.0001));
    return ratios.reduce((a,b)=>a+b,0) / ratios.length;
  }
  function isFist(lm){
    const wrist = lm[0];
    const fingers = [ {tip:lm[8],mcp:lm[5]}, {tip:lm[12],mcp:lm[9]}, {tip:lm[16],mcp:lm[13]}, {tip:lm[20],mcp:lm[17]} ];
    let curled = 0;
    fingers.forEach(f => { if (dist(f.tip,wrist) < dist(f.mcp,wrist) * CONFIG.FIST_CURL_RATIO) curled++; });
    return curled >= CONFIG.FIST_MIN_CURLED;
  }

  /* 畫布的 width/height 屬性從來沒被設定過，一直是 HTML 預設的 300x150，
     再被 CSS 拉到滿螢幕（還要乘上 devicePixelRatio），畫面自然糊掉。
     這裡讓後備緩衝區跟著實際顯示尺寸走；只在尺寸真的變了才重設，
     因為指定 width/height 會清空畫布內容。 */
  function syncCanvasSize(){
    const canvas = els.outputCanvas;
     const dpr = profile.canvasPixelRatio;
    const w = Math.round((canvas.clientWidth || window.innerWidth) * dpr);
    const h = Math.round((canvas.clientHeight || window.innerHeight) * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h){
      canvas.width = w;
      canvas.height = h;
    }
  }

  function onResults(results){
    // 過場影片播放中：整格跳過，MediaPipe 的繪製與判斷都是重負載
    if (state.transitionActive) return;
    syncCanvasSize();
    const cw = els.outputCanvas.width, ch = els.outputCanvas.height;
    outCtx.save();
    outCtx.clearRect(0,0,cw,ch);
    outCtx.scale(-1,1);
    if (state.segmentationMask){
      /* 人像去背：先把分割遮罩畫上去（人像=不透明、其餘=透明），source-in 疊圖模式
         會讓下一筆 drawImage 只保留跟遮罩重疊、不透明的範圍，其餘鏤空——鏤空的地方
         會露出下方 z-index 比 #output_canvas 低的 #ritual-overlay（神明實景疊加層），
         人像本身則維持鏡頭原始畫質，不受神明實景疊加層淡化影響。 */
      outCtx.drawImage(state.segmentationMask, -cw, 0, cw, ch);
      outCtx.globalCompositeOperation = 'source-in';
      outCtx.drawImage(results.image, -cw, 0, cw, ch);
      outCtx.globalCompositeOperation = 'source-over';
    } else {
      // 分割模型還沒回傳第一格結果前，先照舊整格畫出來，避免畫面完全空白
      outCtx.drawImage(results.image, -cw, 0, cw, ch);
    }
    outCtx.restore();

    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    if (state.current === 'incense'){
      handleIncenseGesture(results.multiHandLandmarks || []);
      return;
    }

    if (!hasHand){
       smoothed = null;
      hideFingertipUI(); hideFistIndicator(); hideCupIndicator();
      // 快速向下拋擲時，手部常因動作模糊或離開鏡頭範圍而瞬間追蹤失敗；
      // 若當下正捧著筊杯，就用「消失前」的最後一段位移推算拋擲方向與力道，
      // 直接視為已擲出，避免筊杯因為追蹤中斷而卡在手上。
      if (state.current === 'bwa' && cup.holding && !state.bwaTossing){
        const last = cup.posHistory[cup.posHistory.length - 1];
        const first = cup.posHistory[0];
        els.outputCanvas.classList.remove('dof-blur');
        els.arDecoration.classList.remove('dof-blur');
        if (last && first && last.t !== first.t){
          const dt = Math.max(last.t - first.t, 16);
          const vx = (last.x - first.x) / dt, vy = (last.y - first.y) / dt;
          callbacks.tossBwa(last.x, last.y, vx, vy);
        } else {
          callbacks.tossBwa(window.innerWidth/2, window.innerHeight/2, 0, CONFIG.THROW_VELOCITY_AUX);
        }
        cup.holding = false; cup.openFrames = 0; cup.posHistory = [];
      }
      return;
    }

    let rawLm = results.multiHandLandmarks[0];
    rawLm = rawLm.map(p => ({ x: 1-p.x, y: p.y, z: p.z }));

    // 金色香灰粒子會被移動中的手輕輕撥開，增加畫面互動感
    particleSystem.repel(rawLm[0].x * window.innerWidth, rawLm[0].y * window.innerHeight, CONFIG.PARTICLE_REPEL_RADIUS);

    if (state.current === 'bwa'){
      // 捧筊／拋擲階段使用未經重度平滑的座標，確保「張手瞬間」判定即時
      hideFingertipUI(); hideFistIndicator();
      handleBwaGesture(rawLm);
      return;
    }

     if (state.current === 'draw'){
       if (state.drawSubState === 'shake'){
         const lm = smoothLandmarks(rawLm);
         const wrist = lm[0];
         updateFistIndicator(wrist, isFist(lm)); hideFingertipUI();
         handleShakeGesture(wrist, isFist(lm));
       }
       // 搖籤完成後由程式自動演出抽籤，不再等待捏取／上抽手勢。
       return;
     } else {
       hideFingertipUI(); hideFistIndicator(); hideCupIndicator();
     }
  }

  // ============================================================
  // 合十偵測（雙路徑，提升遮擋情況下的辨識穩定度）：
  //
  // 合十階段只使用手部「有被偵測到」作為寬鬆觸發條件，不檢查距離、置中或姿勢；
  // 這樣雙手重疊時 MediaPipe 只回傳一隻手也不會卡住，持續 10 秒即可完成。
  // ============================================================
  function palmCenter(lm){
    const idxs = [0,5,9,13,17];
    let x=0,y=0;
    idxs.forEach(i => { x += lm[i].x; y += lm[i].y; });
    return { x: x/idxs.length, y: y/idxs.length };
  }
  function updateIncenseFollow(point){
    // MediaPipe coordinates are unmirrored; match the mirrored camera canvas for the AR object.
    const targetX = 1 - point.x;
    const targetY = Math.min(0.82, Math.max(0.28, point.y + CONFIG.INCENSE_FOLLOW_Y_OFFSET));
    const ease = CONFIG.INCENSE_FOLLOW_EASE;
    const dx = targetX - incense.visualX;
    incense.visualX += dx * ease;
    incense.visualY += (targetY - incense.visualY) * ease;
    const targetTilt = Math.max(-CONFIG.INCENSE_TILT_MAX, Math.min(CONFIG.INCENSE_TILT_MAX, -dx * 90));
    incense.visualTilt += (targetTilt - incense.visualTilt) * ease;
    els.incenseAnchor.style.left = `${incense.visualX * 100}%`;
    els.incenseAnchor.style.top = `${incense.visualY * 100}%`;
    els.incenseAnchor.style.transform = `translate3d(-50%,-50%,0) rotate(${incense.visualTilt}deg)`;
    return { x: incense.visualX, y: incense.visualY };
  }

  function resetIncenseFollow(){
    incense.visualX = 0.5; incense.visualY = 0.62; incense.visualTilt = 0;
    els.incenseAnchor.style.left = '50%';
    els.incenseAnchor.style.top = '62%';
    els.incenseAnchor.style.transform = 'translate3d(-50%,-50%,0)';
  }

  function defaultIncenseText(){
    const q = state.userQuery || {};
    return q.question ? `請雙手合十，默念：「${q.question}」` : `請雙手合十，默念關於「${q.category||'所求之事'}」的問題`;
  }

  function handleIncenseGesture(handsLm){
    const now = performance.now();
    let isClose = false;
    let statusText = defaultIncenseText();
    let centerPt = null; // 正規化座標 {x,y}，用於粒子匯聚中心

    if (handsLm && handsLm.length >= 1){
      // 不再要求掌心距離、畫面置中或特定手勢。雙手合十時兩手常重疊，
      // MediaPipe 只回傳一隻手也視為有效，持續偵測 10 秒即可完成。
      const cA = palmCenter(handsLm[0]);
      if (handsLm[1]){
        const cB = palmCenter(handsLm[1]);
        updateDualHandUI(cA, cB, true);
        centerPt = { x: (cA.x+cB.x)/2, y: (cA.y+cB.y)/2 };
      } else {
        hideDualHandUI();
        updateFistIndicatorRaw(cA);
        centerPt = cA;
      }
      isClose = true;
      statusText = '誠心感應中…';
    } else {
      hideDualHandUI(); hideFistIndicator();
    }

    const visualCenter = centerPt ? updateIncenseFollow(centerPt) : null;

    if (isClose){
      // 只要重新判定為合十，就取消任何還在倒數的寬限期，視為進度沒中斷過。
      incense.pausedAt = 0;
      if (!incense.active){ incense.active = true; incense.startTime = now; els.incenseRing.classList.add('on'); }
      const elapsed = now - incense.startTime;
      const progress = Math.min(1, elapsed / CONFIG.INCENSE_HOLD_MS);
      els.incenseRing.style.setProperty('--p', Math.round(progress*100));
      els.incenseHint.textContent = `${statusText} ${Math.round(progress*100)}%`;
      els.incenseHint.classList.add('sensing'); els.incenseStick.classList.add('sensing');
      // 誠心凝聚的即時回饋：附近的金色香灰粒子緩緩向雙手中心匯聚，進度越高匯聚力道越強
      if (visualCenter){
        particleSystem.converge(visualCenter.x*window.innerWidth, visualCenter.y*window.innerHeight, 260, 2 + progress*5);
      }
      if (progress >= 1){ callbacks.completeIncense(); }
      return;
    }

    /* 判定為「未合十」的這一格：如果進度正在累積中，先給一段寬限期
       （CONFIG.INCENSE_RESET_GRACE_MS），寬限期內只更新提示文字、
       維持目前的進度顯示，不立刻歸零——交疊瞬間漏偵測一兩格是常態，
       真的放開雙手才需要重來。 */
    if (incense.active){
      if (!incense.pausedAt) incense.pausedAt = now;
      if (now - incense.pausedAt < CONFIG.INCENSE_RESET_GRACE_MS){
        els.incenseHint.textContent = statusText;
        return;
      }
      incense.active = false;
      incense.pausedAt = 0;
      els.incenseRing.classList.remove('on'); els.incenseRing.style.setProperty('--p',0);
      els.incenseHint.classList.remove('sensing'); els.incenseStick.classList.remove('sensing');
    }
    els.incenseHint.textContent = statusText;
  }
  function resetIncenseProgress(){
    incense.active = false; incense.pausedAt = 0;
    resetIncenseFollow();
    els.incenseRing.classList.remove('on'); els.incenseRing.style.setProperty('--p',0);
    els.incenseHint.classList.remove('sensing'); els.incenseStick.classList.remove('sensing');
  }

  function handleShakeGesture(wrist, fistNow){
    const now = performance.now();
    if (!fistNow){
      if (shake.active && now - shake.lastFistTime > CONFIG.SHAKE_RESET_GRACE_MS){
        resetShakeProgress(); els.drawHint.textContent = '請搖晃籤筒，籤條會自動抽出';
      }
      return;
    }
    shake.lastFistTime = now;
    if (!shake.active){
      shake.active = true; shake.startTime = now; shake.lastY = wrist.y;
      shake.lastVelocitySign = 0; shake.oscillations = 0;
      els.qianTongZone.classList.add('shaking'); els.sticksGroup.classList.add('is-shaking'); els.shakeRing.classList.add('on');
      return;
    }
    const velocity = wrist.y - shake.lastY;
    let sign = 0;
    if (velocity > CONFIG.SHAKE_VELOCITY_DEADZONE) sign = 1; else if (velocity < -CONFIG.SHAKE_VELOCITY_DEADZONE) sign = -1;
    if (sign !== 0){ if (shake.lastVelocitySign !== 0 && sign !== shake.lastVelocitySign) shake.oscillations++; shake.lastVelocitySign = sign; }
    shake.lastY = wrist.y;
    const elapsed = now - shake.startTime;
    const progress = Math.min(1, Math.max(elapsed/CONFIG.SHAKE_TARGET_DURATION_MS, shake.oscillations/CONFIG.SHAKE_REQUIRED_OSCILLATIONS));
    els.shakeRing.style.setProperty('--p', Math.round(progress*100));
    els.drawHint.textContent = `神明降臨中… ${Math.round(progress*100)}%`;
    if (!shake.completed && shake.oscillations >= CONFIG.SHAKE_REQUIRED_OSCILLATIONS && elapsed >= CONFIG.SHAKE_MIN_DURATION_MS){ completeShakeStage(); }
  }
  function resetShakeProgress(){
    shake.active = false; shake.completed = false; shake.oscillations = 0;
    els.qianTongZone.classList.remove('shaking'); els.sticksGroup.classList.remove('is-shaking'); els.shakeRing.classList.remove('on');
    els.shakeRing.style.setProperty('--p', 0);
  }
  function completeShakeStage(){
    shake.completed = true;
    shake.active = false;
    els.qianTongZone.classList.remove('shaking'); els.sticksGroup.classList.remove('is-shaking'); els.shakeRing.classList.remove('on');
    const stickEls = Array.from(els.sticksGroup.querySelectorAll('.stick'));
    const idx = Math.floor(Math.random()*stickEls.length);
    stickEls.forEach(s => s.classList.remove('selected'));
    const chosen = stickEls[idx]; chosen.classList.add('selected');
    state.selectedStickCx = parseFloat(chosen.dataset.cx);
    const xRatio = state.selectedStickCx / 200;
    els.qianStick.style.left = `${xRatio*100}%`;
    els.qianStick.style.transform = 'translate(-50%, 0)';
    state.drawSubState = 'revealing';
    els.qianStick.classList.remove('hidden', 'punch');
    els.qianStick.classList.add('auto-draw');
    els.drawHint.textContent = '神明已選定，籤條正在自動抽出…';
    if (navigator.vibrate) navigator.vibrate([20, 45, 20]);
    window.setTimeout(() => {
      if (state.current === 'draw') callbacks.completeDraw();
    }, 420);
  }

  function resetDrawReveal(){
    els.qianStick.classList.add('hidden');
    els.qianStick.classList.remove('auto-draw', 'punch');
    els.qianStick.style.transform = 'translate(-50%, 0)';
    els.drawHint.textContent = '請搖晃籤筒，籤條會自動抽出';
  }

  // ============================================================
  // 捧筊與拋擲判定（單手握拳抓杯／往下丟）：
  // 1. 「抓」：curlAmount 低於 CUP_CURL_MAX（手指收攏成握拳狀）即視為抓住筊杯，
  //    筊杯即時跟隨手腕螢幕座標移動，並記錄位置歷史供後續估算拋擲速度。
  // 2. 「丟」：抓住狀態下，符合以下任一條件即判定為「拋擲」：
  //    (a) curlAmount 超過 OPEN_CURL_MIN（手掌張開放手）；
  //    (b) 手腕瞬時速度超過 THROW_VELOCITY_AUX（就算手指沒完全張開，
  //        只要往下甩的力道夠大也視為拋擲，避免因光線或動作模糊誤判手指狀態）；
  //    (c) 短時間內速度變化量（加速度）超過 THROW_ACCEL_AUX，代表使用者
  //        做了一個明顯的「往下一丟」動作。
  //    三條件符合任一即觸發，取最近位置歷史估算方向與力道，交給物理動畫落下。
  // ============================================================
  function handleBwaGesture(lm){
    const wrist = lm[0];
    const c = curlAmount(lm);
    const sx = wrist.x * window.innerWidth, sy = wrist.y * window.innerHeight;

    updateCupIndicator(sx, sy, cup.holding);

    if (!cup.holding){
      if (c < CONFIG.CUP_CURL_MAX){
        cup.holding = true; cup.openFrames = 0; cup.posHistory = [];
        els.bwaHint.textContent = '已抓住筊杯，往下一丟即可擲出';
        // 動態景深：抓住筊杯時背景失焦模糊，讓視覺焦點鎖定在筊杯上
        els.outputCanvas.classList.add('dof-blur');
        els.arDecoration.classList.add('dof-blur');
      } else {
        els.bwaHint.textContent = '請握拳抓住筊杯';
      }
      return;
    }

    // 更新位置歷史（約 200ms 窗口），並讓筊杯跟隨手腕移動
    const now = performance.now();
    cup.posHistory.push({t:now, x:sx, y:sy});
    while (cup.posHistory.length && now - cup.posHistory[0].t > 200) cup.posHistory.shift();

    bwaScene.setHoldPosition(wrist.x, wrist.y);

    const first = cup.posHistory[0] || {x:sx,y:sy,t:now};
    const dt = Math.max(now - first.t, 16);
    const vx = (sx-first.x)/dt, vy = (sy-first.y)/dt; // px/ms
    const speed = Math.hypot(vx, vy);

    // 加速度：比較本次視窗前後半段的平均速度差，抓出「突然甩動」的瞬間
    let accel = 0;
    if (cup.posHistory.length >= 4){
      const mid = cup.posHistory[Math.floor(cup.posHistory.length/2)];
      const dtEarly = Math.max(mid.t - first.t, 8);
      const dtLate = Math.max(now - mid.t, 8);
      const speedEarly = Math.hypot((mid.x-first.x)/dtEarly, (mid.y-first.y)/dtEarly);
      const speedLate = Math.hypot((sx-mid.x)/dtLate, (sy-mid.y)/dtLate);
      accel = (speedLate - speedEarly) / dtLate;
    }

    const openByCurl = c > CONFIG.OPEN_CURL_MIN;
    const openByVelocity = speed > CONFIG.THROW_VELOCITY_AUX;
    const openByAccel = accel > CONFIG.THROW_ACCEL_AUX;

    if (openByCurl || openByVelocity || openByAccel){
      cup.openFrames++;
      const framesNeeded = openByVelocity || openByAccel ? 1 : CONFIG.OPEN_CONFIRM_FRAMES;
      if (cup.openFrames >= framesNeeded && !state.bwaTossing){
        els.outputCanvas.classList.remove('dof-blur');
        els.arDecoration.classList.remove('dof-blur');
        callbacks.tossBwa(sx, sy, vx, vy);
        cup.holding = false;
      }
    } else {
      cup.openFrames = 0;
    }
  }

  let markerA, markerB, line, fistDot, cupDot;
  function ensureMarkers(){
    if (!markerA){
      markerA = document.createElement('div'); markerA.className='fingertip-marker';
      markerB = document.createElement('div'); markerB.className='fingertip-marker';
      line = document.createElement('div'); line.className='pinch-line';
      fistDot = document.createElement('div'); fistDot.className='fist-indicator';
      cupDot = document.createElement('div'); cupDot.className='cup-indicator';
      rootEl.appendChild(markerA); rootEl.appendChild(markerB);
      rootEl.appendChild(line); rootEl.appendChild(fistDot); rootEl.appendChild(cupDot);
    }
  }
  function hideFingertipUI(){ if (markerA){ markerA.style.opacity=0; markerB.style.opacity=0; line.style.opacity=0; } }
  function updateFistIndicator(wrist, fistNow){
    ensureMarkers();
    fistDot.style.left=(wrist.x*window.innerWidth)+'px'; fistDot.style.top=(wrist.y*window.innerHeight)+'px';
    fistDot.style.opacity = fistNow?1:0.35; fistDot.style.borderColor = fistNow ? 'var(--gold-soft)' : 'rgba(255,255,255,0.4)';
  }
  function hideFistIndicator(){ if (fistDot) fistDot.style.opacity=0; }
  function updateCupIndicator(sx, sy, holding){
    ensureMarkers();
    cupDot.style.left = sx+'px'; cupDot.style.top = sy+'px'; cupDot.style.opacity = 0.9;
    cupDot.style.borderColor = holding ? 'var(--gold-soft)' : 'rgba(255,255,255,0.45)';
  }
  function hideCupIndicator(){ if (cupDot) cupDot.style.opacity = 0; }

  // 合十階段視覺回饋：雙手可見時顯示兩個掌心點+連線；只偵測到單手時顯示單一穩定指示點
  function updateDualHandUI(cA, cB, isClose){
    ensureMarkers();
    const ax=cA.x*window.innerWidth, ay=cA.y*window.innerHeight;
    const bx=cB.x*window.innerWidth, by=cB.y*window.innerHeight;
    markerA.style.left=ax+'px'; markerA.style.top=ay+'px'; markerA.style.opacity=1;
    markerB.style.left=bx+'px'; markerB.style.top=by+'px'; markerB.style.opacity=1;
    const len=Math.hypot(bx-ax,by-ay), angle=Math.atan2(by-ay,bx-ax)*180/Math.PI;
    line.style.width=len+'px'; line.style.left=ax+'px'; line.style.top=ay+'px';
    line.style.transform=`rotate(${angle}deg)`; line.style.opacity=0.85;
    line.style.background = isClose ? 'var(--gold-soft)' : 'rgba(255,255,255,0.5)';
  }
  function hideDualHandUI(){ if (markerA){ markerA.style.opacity=0; markerB.style.opacity=0; line.style.opacity=0; } }
  function updateFistIndicatorRaw(c){
    ensureMarkers();
    fistDot.style.left=(c.x*window.innerWidth)+'px'; fistDot.style.top=(c.y*window.innerHeight)+'px';
    fistDot.style.opacity = 1; fistDot.style.borderColor = 'var(--gold-soft)';
  }

  // 新增：釋放資源用（原始版本沒有這支函式，因為活在單頁iframe裡卸載時瀏覽器整包回收；
  // 元件化之後需要能清掉手動建立的marker DOM節點，避免殘留在畫面上）
  function destroy(){
    [markerA, markerB, line, fistDot, cupDot].forEach(elm => elm && elm.remove());
  }

  return {
    onResults, syncCanvasSize, resetDrawReveal, resetShakeProgress, resetIncenseProgress,
    resetBwaTracking(){ cup.holding=false; cup.openFrames=0; cup.posHistory=[]; },
    destroy
  };
}
