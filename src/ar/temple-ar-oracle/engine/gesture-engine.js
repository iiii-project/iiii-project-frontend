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
import { createPrimaryUserSelector } from './primary-user.js';

export function createGestureEngine({ els, state, config: CONFIG, particleSystem, bwaScene, rootEl, callbacks }) {
  let smoothed = null;

  // 畫面多人入鏡時，只留「主要使用者」的手（見 primary-user.js），其餘人的手一律忽略
  const userSelector = createPrimaryUserSelector(CONFIG);

  // prevY / src：每格都更新，用來判斷「雙手這一格有沒有在上下動」；src 是目前追蹤訊號來自幾隻手
  const shake = { active:false, startTime:0, lastY:0, lastVelocitySign:0, oscillations:0, lastFistTime:0, prevY:null, src:0 };

  // ---- 捏取階段（往上滑動抽籤）狀態 ----
  // armedAt：這個時間點之後才開始偵測上滑；hist：兩個手位（依畫面 x 排序）各自最近 500ms 的
  // 手腕/食指指尖 y 座標；hits：連續幾格達標（防抖）；done：已經觸發過一次，不重複觸發
  const swipe = { armedAt:0, hist:[[], []], handCount:0, hits:0, done:false };
  let liftTimer = 0;

  // ---- 合十默念狀態 ----
  // pausedAt：合十判定短暫失敗時的暫停起點（見 handleIncenseGesture 的寬限期機制），
  // 不是 0 就代表目前正處於「暫停中，還沒真的歸零」的狀態。
  const incense = { active:false, startTime:0, pausedAt:0, visualX:0.5, visualY:0.62, visualTilt:0 };
  // 手部示意圖目前顯示的是不是「雙手合十」，以及「判定跟目前顯示不一致」是從何時開始的（防抖用）
  const pray = { shown:false, pendingSince:0 };

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

  function onResults(results){
    // 過場影片播放中：整格跳過，MediaPipe 的判斷是重負載
    if (state.transitionActive) return;
    // 求籤過程中不顯示人物（不畫鏡頭畫面、也不做人像去背），#output_canvas 保持空白，
    // 這裡只拿 MediaPipe Hands 的結果做手勢判斷。

    // 只取「主要使用者」的手：畫面裡其他人的手在這裡就被濾掉，後面所有階段都看不到
    const hands = userSelector.select(results.multiHandLandmarks || []);
    const hasHand = hands.length > 0;

    if (state.current === 'incense'){
      handleIncenseGesture(hands);
      return;
    }

    if (!hasHand){
      smoothed = null;
      swipe.hist = [[], []]; swipe.handCount = 0; swipe.hits = 0; shake.prevY = null;
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

    let rawLm = hands[0];
    rawLm = rawLm.map(p => ({ x: 1-p.x, y: p.y, z: p.z }));

    // 金色香灰粒子會被移動中的手輕輕撥開，增加畫面互動感
    particleSystem.repel(rawLm[0].x * window.innerWidth, rawLm[0].y * window.innerHeight, CONFIG.PARTICLE_REPEL_RADIUS);

    if (state.current === 'bwa'){
      // 捧筊／拋擲階段使用未經重度平滑的座標，確保「張手瞬間」判定即時
      hideFingertipUI(); hideFistIndicator();
      handleBwaGesture(rawLm);
      return;
    }

    const lm = smoothLandmarks(rawLm);
    const wrist = lm[0];

    if (state.current === 'draw'){
      if (state.drawSubState === 'shake'){
        updateFistIndicator(wrist, hands.some(isFist)); hideFingertipUI();
        handleShakeGesture(hands, lm);
      } else {
        hideFistIndicator(); hideFingertipUI();
        handleSwipeUpGesture(hands);
      }
    } else {
      hideFingertipUI(); hideFistIndicator(); hideCupIndicator();
    }
  }

  // ============================================================
  // 合十偵測（雙路徑，提升遮擋情況下的辨識穩定度）：
  //
  // 路徑 A（雙手可見）：分別取兩手的「掌心中心」（手腕 + 四指指根 MCP 的平均座標，
  // 比單純手腕點更能代表手掌實際位置），計算兩掌心距離，並除以手掌尺度做正規化，
  // 避免使用者離鏡頭遠近不同造成誤判。
  //
  // 路徑 B（單手備援）：真正合十時兩手影像會高度重疊，MediaPipe 常常只能辨識出
  // 其中一隻手。此時改為檢查：該手是否停留在畫面水平/垂直置中範圍內，且移動量
  // 低於穩定閾值（沒有明顯晃動）。只要滿足其一即可持續累積「誠心進度」，
  // 大幅降低因單純遮擋而完全無法完成的機率。
  // ============================================================
  function palmCenter(lm){
    const idxs = [0,5,9,13,17];
    let x=0,y=0;
    idxs.forEach(i => { x += lm[i].x; y += lm[i].y; });
    return { x: x/idxs.length, y: y/idxs.length };
  }
  function handScale(lm){ return dist(lm[0], lm[9]) || 0.0001; }

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

  /* 手部示意圖切換（雙手在兩側 <-> 雙手合十）：只讀取下面既有的 isClose 判定結果，
     不參與也不改動合十偵測與進入下一階段的邏輯。
     防抖：判定跟目前顯示的圖不一致時，要連續維持 INCENSE_PRAY_DEBOUNCE_MS 才真的切換，
     不論是切成合十還是切回兩側，避免偵測一兩格閃動造成圖片閃爍。 */
  function setPrayImage(on){
    els.incenseHandsOpen.classList.toggle('on', !on);
    els.incenseHandsPray.classList.toggle('on', on);
  }
  function updatePrayImage(isClose, now){
    if (isClose === pray.shown){ pray.pendingSince = 0; return; }
    if (!pray.pendingSince){ pray.pendingSince = now; return; }
    if (now - pray.pendingSince >= CONFIG.INCENSE_PRAY_DEBOUNCE_MS){
      pray.shown = isClose; pray.pendingSince = 0;
      setPrayImage(isClose);
    }
  }
  function resetPrayImage(){
    pray.shown = false; pray.pendingSince = 0;
    setPrayImage(false);
  }

  function handleIncenseGesture(handsLm){
    const now = performance.now();
    let isClose = false;
    let statusText = defaultIncenseText();
    let centerPt = null; // 正規化座標 {x,y}，用於粒子匯聚中心

    if (handsLm && handsLm.length >= 2){
      const lmA = handsLm[0], lmB = handsLm[1];
      const cA = palmCenter(lmA), cB = palmCenter(lmB);
      const avgScale = (handScale(lmA) + handScale(lmB)) / 2;
      const normDist = dist(cA, cB) / avgScale;
      updateDualHandUI(cA, cB, normDist < CONFIG.INCENSE_PALM_DIST_MAX);
      centerPt = { x: (cA.x+cB.x)/2, y: (cA.y+cB.y)/2 };
      if (normDist < CONFIG.INCENSE_PALM_DIST_MAX){
        isClose = true; statusText = '誠心感應中…';
      } else {
        statusText = '偵測到雙手，請再靠攏一些';
      }
    } else if (handsLm && handsLm.length === 1){
      const c = palmCenter(handsLm[0]);
      centerPt = c;
      hideDualHandUI(); updateFistIndicatorRaw(c);
      /* 雙手合十時兩手影像高度重疊，MediaPipe 常常只認得到其中一隻手：
         這裡只要求這隻手落在畫面中央，不再額外要求「完全靜止不動」——
         手部座標偵測本身就有雜訊，就算手沒動也常被誤判成有在動，
         反而讓進度動不動就被重置，體感就是「太靈敏、一動就重來」。 */
      const inCenter = c.x > CONFIG.INCENSE_CENTER_X[0] && c.x < CONFIG.INCENSE_CENTER_X[1]
                     && c.y > CONFIG.INCENSE_CENTER_Y[0] && c.y < CONFIG.INCENSE_CENTER_Y[1];
      if (inCenter){ isClose = true; statusText = '誠心感應中…'; }
      else { statusText = '請將合十的雙手移到畫面正中央'; }
    } else {
      hideDualHandUI(); hideFistIndicator();
    }

    const visualCenter = centerPt ? updateIncenseFollow(centerPt) : null;
    updatePrayImage(isClose, now);

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
    resetPrayImage();
    els.incenseRing.classList.remove('on'); els.incenseRing.style.setProperty('--p',0);
    els.incenseHint.classList.remove('sensing'); els.incenseStick.classList.remove('sensing');
  }

  /* 搖籤觸發條件放寬成「任一種」：
       (1) 握拳/握籤：任一隻手握拳；
       (2) 雙手上下搖晃：看得到兩隻手，且兩手手腕的平均高度這一格有明顯上下移動。
     追蹤的 y 訊號：雙手時取兩手手腕的平均、單手時取該手手腕；來源（幾隻手）換了就只重設基準點，
     不把「換來源造成的跳動」算成一次搖晃。之後的累積搖晃量（折返次數／時間）與命中籤的隨機決定不變。 */
  function handleShakeGesture(handsLm, lm0){
    const now = performance.now();
    const two = handsLm.length >= 2;
    const trackY = two ? (lm0[0].y + handsLm[1][0].y) / 2 : lm0[0].y;
    const src = two ? 2 : 1;
    if (shake.src !== src){ shake.src = src; shake.prevY = null; if (shake.active) shake.lastY = trackY; }
    const movedNow = shake.prevY !== null && Math.abs(trackY - shake.prevY) > CONFIG.SHAKE_VELOCITY_DEADZONE;
    shake.prevY = trackY;
    const engaged = handsLm.some(isFist) || (two && movedNow);
    if (!engaged){
      if (shake.active && now - shake.lastFistTime > CONFIG.SHAKE_RESET_GRACE_MS){
        resetShakeProgress(); els.drawHint.textContent = '請握拳握住籤筒，或雙手上下搖晃';
      }
      return;
    }
    shake.lastFistTime = now;
    if (!shake.active){
      shake.active = true; shake.startTime = now; shake.lastY = trackY;
      shake.lastVelocitySign = 0; shake.oscillations = 0;
      els.drawStage.classList.add('shaking'); els.sticksGroup.classList.add('is-shaking'); els.shakeRing.classList.add('on');
      return;
    }
    const velocity = trackY - shake.lastY;
    let sign = 0;
    if (velocity > CONFIG.SHAKE_VELOCITY_DEADZONE) sign = 1; else if (velocity < -CONFIG.SHAKE_VELOCITY_DEADZONE) sign = -1;
    if (sign !== 0){ if (shake.lastVelocitySign !== 0 && sign !== shake.lastVelocitySign) shake.oscillations++; shake.lastVelocitySign = sign; }
    shake.lastY = trackY;
    const elapsed = now - shake.startTime;
    const progress = Math.min(1, Math.max(elapsed/CONFIG.SHAKE_TARGET_DURATION_MS, shake.oscillations/CONFIG.SHAKE_REQUIRED_OSCILLATIONS));
    els.shakeRing.style.setProperty('--p', Math.round(progress*100));
    els.drawHint.textContent = `神明降臨中… ${Math.round(progress*100)}%`;
    if (shake.oscillations >= CONFIG.SHAKE_REQUIRED_OSCILLATIONS && elapsed >= CONFIG.SHAKE_MIN_DURATION_MS){ completeShakeStage(); }
  }
  function resetShakeProgress(){
    shake.active = false; shake.oscillations = 0; shake.prevY = null;
    els.drawStage.classList.remove('shaking'); els.sticksGroup.classList.remove('is-shaking'); els.shakeRing.classList.remove('on');
    els.shakeRing.style.setProperty('--p', 0);
  }
  function completeShakeStage(){
    els.drawStage.classList.remove('shaking'); els.sticksGroup.classList.remove('is-shaking'); els.shakeRing.classList.remove('on');
    const stickEls = Array.from(els.sticksGroup.querySelectorAll('.stick'));
    const idx = Math.floor(Math.random()*stickEls.length);
    stickEls.forEach(s => s.classList.remove('selected'));
    const chosen = stickEls[idx]; chosen.classList.add('selected');
    state.selectedStickCx = parseFloat(chosen.dataset.cx);
    const xRatio = state.selectedStickCx / 200;
    els.qianStick.style.left = `${xRatio*100}%`;
    els.qianStick.style.transform = 'translate(-50%, 0)';
    state.drawSubState = 'pinch';
    els.drawHint.textContent = '神明已選定！請將手向上滑動，抽出籤條';
    enterPinchStage();
  }

  // ============================================================
  // 捏取階段：搖出命中籤後自動出現「捏取的手」，往上滑動即抽出。
  // ============================================================
  // 命中籤枝頭部（圓點）的畫面座標：依 state.selectedStickCx 找到籤枝元素再用 getBoundingClientRect 換算，不寫死
  function chosenStickHead(){
    const chosen = Array.from(els.sticksGroup.querySelectorAll('.stick'))
      .find(s => parseFloat(s.dataset.cx) === state.selectedStickCx);
    const head = chosen && (chosen.querySelector('circle') || chosen);
    if (!head) return null;
    const r = head.getBoundingClientRect();
    return { chosen, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function enterPinchStage(){
    swipe.hist = [[], []]; swipe.handCount = 0; swipe.hits = 0; swipe.done = false;
    swipe.armedAt = performance.now() + CONFIG.PINCH_ARM_DELAY_MS;
    els.drawHandsShake.classList.add('off'); // 搖籤的手淡出
    const target = chosenStickHead();
    // 指尖（圖上的捏取點）對準命中籤枝頂端；量不到就維持 CSS 預設位置
    if (target){
      els.drawPinch.style.setProperty('--target-x', `${target.x}px`);
      els.drawPinch.style.setProperty('--target-y', `${target.y}px`);
    }
    els.drawPinch.style.setProperty('--lift-y', `${-Math.round(window.innerHeight * CONFIG.PINCH_LIFT_VH)}px`);
    // 手只准出現在「祈願抽籤」文字卡的下方：以卡片下緣（再留一點縫）當裁切線
    const card = els.sceneDraw.querySelector('.ritual-card');
    if (card) els.drawPinchClip.style.setProperty('--clip-top', `${Math.ceil(card.getBoundingClientRect().bottom) + 8}px`);
    // 先讓元素以「滑入起點」的狀態渲染一格，再加 is-in 才會有 400ms 的滑入動畫
    void els.drawPinch.offsetWidth;
    els.drawPinch.classList.add('is-in');
  }

  /* 上滑判定：任一隻手的「手腕」或「食指指尖」，在 SWIPE_UP_WINDOW_MS 內往上移動超過畫面高度的
     SWIPE_UP_DELTA_RATIO。手依畫面 x 排成固定兩個位置各自記錄；手的數量一變就清掉歷史，
     避免把左右手的座標接在一起。防抖：連續 SWIPE_UP_CONFIRM_FRAMES 格達標才觸發，觸發過一次就不再觸發。 */
  function handleSwipeUpGesture(handsLm){
    if (swipe.done) return;
    const now = performance.now();
    if (now < swipe.armedAt) return; // 手還在滑入，且搖籤最後那一下的動作不算

    const ordered = handsLm.slice().sort((a, b) => a[0].x - b[0].x).slice(0, 2);
    if (ordered.length !== swipe.handCount){ swipe.hist = [[], []]; swipe.hits = 0; swipe.handCount = ordered.length; }

    let reached = false;
    ordered.forEach((lm, i) => {
      const hist = swipe.hist[i];
      hist.push({ t: now, wrist: lm[0].y, tip: lm[8].y });
      while (hist.length && now - hist[0].t > CONFIG.SWIPE_UP_WINDOW_MS) hist.shift();
      // y 越小越靠上：視窗內「最低點」到現在的位移，就是往上移動了多少（畫面高度的比例）
      const riseWrist = Math.max(...hist.map(s => s.wrist)) - lm[0].y;
      const riseTip = Math.max(...hist.map(s => s.tip)) - lm[8].y;
      if (riseWrist > CONFIG.SWIPE_UP_DELTA_RATIO || riseTip > CONFIG.SWIPE_UP_DELTA_RATIO) reached = true;
    });

    swipe.hits = reached ? swipe.hits + 1 : 0;
    if (swipe.hits >= CONFIG.SWIPE_UP_CONFIRM_FRAMES){
      swipe.done = true;
      playLiftAndComplete();
    }
  }

  // 觸發後：捏取的手與命中籤枝一起上移（ease-out），上移完成後淡出並接續原本的 completeDraw 流程
  function playLiftAndComplete(){
    const target = chosenStickHead();
    if (target) target.chosen.classList.add('lifted');
    // #qian-stick（發光籤條）接手，先把它的籤頭對到命中籤枝的位置，再一起往上移
    const stick = els.qianStick;
    stick.style.transition = 'none';
    stick.style.transform = 'translate(-50%, 0)';
    stick.classList.remove('hidden');
    let dx = 0, dy = 0;
    if (target){
      const h = stick.querySelector('circle').getBoundingClientRect();
      dx = target.x - (h.left + h.width / 2);
      dy = target.y - (h.top + h.height / 2);
    }
    const lift = Math.round(window.innerHeight * CONFIG.PINCH_LIFT_VH);
    stick.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
    void stick.offsetWidth;
    stick.style.transition = `transform ${CONFIG.PINCH_LIFT_MS}ms cubic-bezier(0.22,0.61,0.36,1), opacity ${CONFIG.PINCH_FADE_MS}ms ease`;
    stick.style.transform = `translate(calc(-50% + ${dx}px), ${dy - lift}px)`;
    els.drawPinch.classList.add('is-lift');
    els.drawHint.textContent = '籤條抽出中…';

    window.clearTimeout(liftTimer);
    liftTimer = window.setTimeout(() => {
      // 上移完成 → 手與籤枝淡出，同時進入原本的完成抽籤流程（爆光、過場、進入擲筊）
      els.drawPinch.classList.add('is-out');
      stick.style.opacity = '0';
      callbacks.completeDraw();
    }, CONFIG.PINCH_LIFT_MS);
  }

  // 回到搖籤初始狀態：進入抽籤場景（含非聖筊重抽）或整個儀式重置時呼叫
  function resetPinch(){
    window.clearTimeout(liftTimer);
    swipe.hist = [[], []]; swipe.handCount = 0; swipe.hits = 0; swipe.done = false; swipe.armedAt = 0;
    els.drawPinch.classList.remove('is-in', 'is-lift', 'is-out');
    els.drawPinch.style.removeProperty('--lift-y');
    els.drawHandsShake.classList.remove('off');
    els.sticksGroup.querySelectorAll('.stick.lifted').forEach(s => s.classList.remove('lifted'));
    els.qianStick.classList.add('hidden'); els.qianStick.classList.remove('pinched', 'punch');
    els.qianStick.style.transition = ''; els.qianStick.style.opacity = '';
    els.qianStick.style.transform = 'translate(-50%, 0)';
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
  function updateFingertipUI(thumbTip, indexTip){
    ensureMarkers();
    const ax=thumbTip.x*window.innerWidth, ay=thumbTip.y*window.innerHeight;
    const bx=indexTip.x*window.innerWidth, by=indexTip.y*window.innerHeight;
    markerA.style.left=ax+'px'; markerA.style.top=ay+'px'; markerA.style.opacity=1;
    markerB.style.left=bx+'px'; markerB.style.top=by+'px'; markerB.style.opacity=1;
    const len=Math.hypot(bx-ax,by-ay), angle=Math.atan2(by-ay,bx-ax)*180/Math.PI;
    line.style.width=len+'px'; line.style.left=ax+'px'; line.style.top=ay+'px';
    line.style.transform=`rotate(${angle}deg)`; line.style.opacity=0.8;
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
    window.clearTimeout(liftTimer);
    [markerA, markerB, line, fistDot, cupDot].forEach(elm => elm && elm.remove());
  }

  return {
    onResults, resetPinch, resetShakeProgress, resetIncenseProgress,
    resetBwaTracking(){ cup.holding=false; cup.openFrames=0; cup.posHistory=[]; },
    destroy
  };
}
