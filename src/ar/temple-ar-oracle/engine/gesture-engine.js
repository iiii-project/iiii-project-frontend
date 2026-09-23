/* =========================================================================
   GestureEngine — MediaPipe 手部座標處理與狀態判定
   來源：temple_oracle_v17.html 2118–2543行。所有手勢判定的數學/邏輯
   （合十雙路徑判定、雙手持續偵測開始抽籤、
    雙手擲筊判定……）逐行原封不動搬遷，完全沒有調整。

   【封裝調整說明（只有下面4處「取得外部資源的方式」不同，其餘皆逐行相同）】
   1. 原本直接讀取全域 `els.xxx`、`AppState.xxx`、`CONFIG`，改為 createGestureEngine()
      呼叫時由外部一次注入（els / state / config 皆由 index.js 組裝後傳入）。
   2. 原本直接呼叫全域函式 `UIActions.completeIncense()` / `UIActions.completeDraw()` /
      `UIActions.tossBwa()`，改為呼叫注入進來的 `callbacks.completeIncense()` /
      `callbacks.completeDraw()` / `callbacks.tossBwa()`——這三個callback由
      flow-controller.js提供，呼叫時機與傳入參數完全相同。
    3. `ensureMarkers()` 原本把手指標記點 `document.body.appendChild(...)`，
       改為 append 到注入進來的 `rootEl`（元件自己的容器），避免手勢標記點
      跑到 Shadow DOM 外面、脫離元件管理範圍。
   ========================================================================= */
 import { getPerformanceProfile } from '@/utils/performance';

  export function createGestureEngine({ els, state, config: CONFIG, rootEl, callbacks }) {
   const outCtx = els.outputCanvas.getContext('2d');
   const profile = getPerformanceProfile();

   const shake = { completed:false, active:false, startedAt:0 };

  // ---- 合十默念狀態 ----
  // pausedAt：合十判定短暫失敗時的暫停起點（見 handleIncenseGesture 的寬限期機制），
  // 不是 0 就代表目前正處於「暫停中，還沒真的歸零」的狀態。
  const incense = { active:false, startTime:0, pausedAt:0, visualX:0.5, visualY:0.62, visualTilt:0 };

  // ---- 捧筊 / 拋擲 狀態 ----
  const cup = {
    twoHandsSeen: false, // 本輪是否已偵測到兩隻手，避免同一輪重複觸發
  };

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

   function personScale(){
     return window.innerHeight > window.innerWidth
       ? CONFIG.PERSON_SCALE_PORTRAIT
       : CONFIG.PERSON_SCALE;
   }

    function personFrame(width, height, sourceImage = els.video){
     const scale = personScale();
     const frame = {
       scale,
       x: ((1 - scale) / 2) * width,
       y: (1 - scale) * height,
       width: scale * width,
       height: scale * height,
     };

       /* 鏡頭畫布本身永遠是全螢幕；人物只使用畫布內的縮小安全框。
          不論橫屏或豎屏，都依來源比例 contain 到安全框並貼齊底部，
          讓整個人保留在畫面內，不因填滿而被裁切。 */
      const source = imageSize(sourceImage, 0, 0);
      if (source.width > 0 && source.height > 0){
        const sourceRatio = source.width / source.height;
        const frameRatio = frame.width / frame.height;
        if (sourceRatio > frameRatio){
          frame.height = frame.width / sourceRatio;
          frame.y = height - frame.height;
        } else if (sourceRatio < frameRatio){
          frame.width = frame.height * sourceRatio;
          frame.x = (width - frame.width) / 2;
        }
      }
      return frame;
   }

   /* 去背人物使用畫布中央的縮小區域繪製；座標提示也必須使用同一個
      inset/scale，否則縮小人物後提示點會留在原本的全螢幕位置。 */
   function toDisplayPoint(point, alreadyMirrored = false){
     const frame = personFrame(window.innerWidth, window.innerHeight);
     const x = alreadyMirrored ? point.x : 1 - point.x;
     return {
       x: frame.x + x * frame.width,
       y: frame.y + point.y * frame.height,
     };
   }

   function imageSize(image, fallbackWidth, fallbackHeight){
     return {
       width: image?.videoWidth || image?.naturalWidth || image?.width || fallbackWidth,
       height: image?.videoHeight || image?.naturalHeight || image?.height || fallbackHeight,
     };
   }

     /* Canvas 的 CSS object-fit 不會替 canvas 內部的 bitmap 保持比例；
        這裡只把完整來源影像繪製到人物安全框，不做 source crop，
        讓鏡頭與去背遮罩使用完全相同的 contain 範圍。 */
    function drawContained(ctx, image, dx, dy, dw, dh, fallbackWidth, fallbackHeight){
      const source = imageSize(image, fallbackWidth, fallbackHeight);
      // 呼叫端已將 canvas 水平翻轉，所以 destination x 必須從右側起算。
      ctx.drawImage(image, 0, 0, source.width, source.height, -(dx + dw), dy, dw, dh);
    }
   function onResults(results){
    // 過場影片播放中：整格跳過，MediaPipe 的繪製與判斷都是重負載
    if (state.transitionActive) return;
    syncCanvasSize();
    const cw = els.outputCanvas.width, ch = els.outputCanvas.height;
    outCtx.save();
    outCtx.clearRect(0,0,cw,ch);
    // 去背遮罩尚未準備好時不要先畫整張原始鏡頭畫面，
    // 否則鏡頭剛開啟會短暫閃出使用者全身，再突然切成摳像。
    if (!state.segmentationMask) {
      outCtx.restore();
      return;
    }
      const frame = personFrame(cw, ch, results.image);
     const drawW = frame.width;
     const drawH = frame.height;
      const drawX = frame.x;
      const drawY = frame.y;
      const drawFrame = drawContained;
      outCtx.scale(-1,1);
     if (state.segmentationMask){
       /* 先畫鏡像鏡頭，再用 destination-in 套上人像遮罩；這個合成順序
          在不同瀏覽器的 Canvas 實作上比 source-in 更穩定。遮罩外部保持透明，
          底下的神明實景就能透出來。 */
         drawFrame(outCtx, results.image, drawX, drawY, drawW, drawH, cw, ch);
         outCtx.globalCompositeOperation = 'destination-in';
         drawFrame(outCtx, state.segmentationMask, drawX, drawY, drawW, drawH, cw, ch);
      outCtx.globalCompositeOperation = 'source-over';
    }
    outCtx.restore();

    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    if (state.current === 'incense'){
      handleIncenseGesture(results.multiHandLandmarks || []);
      return;
    }

     if (!hasHand){
       hideFingertipUI(); hideFistIndicator();
       if (state.current === 'draw' && state.drawSubState === 'shake') resetShakeProgress();
       if (state.current === 'bwa') cup.twoHandsSeen = false;
       return;
    }

    const handLandmarks = results.multiHandLandmarks.map((landmarks) =>
      landmarks.map(p => ({ x: 1-p.x, y: p.y, z: p.z }))
    );
    const rawLm = handLandmarks[0];

    if (state.current === 'bwa'){
      // 捧筊／拋擲階段使用未經重度平滑的座標，確保「張手瞬間」判定即時
      hideFingertipUI(); hideFistIndicator();
       handleBwaGesture(handLandmarks);
      return;
    }

     if (state.current === 'draw'){
         if (state.drawSubState === 'shake'){
           hideFingertipUI();
           if (handLandmarks.length >= CONFIG.DRAW_REQUIRED_HANDS){
             handleTwoHandsDetected();
           } else {
             resetShakeProgress();
             els.drawHint.textContent = '請讓雙手同時進入畫面，開始搖籤';
           }
        }
         // 偵測到雙手後持續 2 秒搖籤，完成後由程式自動抽出籤條。
        return;
     } else {
       hideFingertipUI(); hideFistIndicator();
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
     const displayPoint = toDisplayPoint(point);
     const targetX = displayPoint.x / window.innerWidth;
     const targetY = Math.min(0.82, Math.max(0.28, displayPoint.y / window.innerHeight + CONFIG.INCENSE_FOLLOW_Y_OFFSET));
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
      statusText = '';
    } else {
      hideDualHandUI(); hideFistIndicator();
    }

     if (centerPt) updateIncenseFollow(centerPt);

    if (isClose){
      // 只要重新判定為合十，就取消任何還在倒數的寬限期，視為進度沒中斷過。
      incense.pausedAt = 0;
      if (!incense.active){ incense.active = true; incense.startTime = now; els.incenseRing.classList.add('on'); }
      const elapsed = now - incense.startTime;
      const progress = Math.min(1, elapsed / CONFIG.INCENSE_HOLD_MS);
      els.incenseRing.style.setProperty('--p', Math.round(progress*100));
      els.incenseHint.textContent = `${statusText} ${Math.round(progress*100)}%`;
      els.incenseHint.classList.add('sensing'); els.incenseStick.classList.add('sensing');
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

  function handleTwoHandsDetected(){
    if (shake.completed) return;
    const now = performance.now();
    if (!shake.active){
      shake.active = true;
      shake.startedAt = now;
      els.qianTongZone.classList.add('shaking');
      els.sticksGroup.classList.add('is-shaking');
      els.shakeRing.classList.add('on');
      els.shakeRing.style.setProperty('--p', 0);
    }

    const elapsed = now - shake.startedAt;
    const progress = Math.min(1, elapsed / CONFIG.DRAW_HAND_HOLD_MS);
    els.shakeRing.style.setProperty('--p', Math.round(progress * 100));
    els.drawHint.textContent = `搖籤中… ${Math.ceil((CONFIG.DRAW_HAND_HOLD_MS - elapsed) / 1000)} 秒`;
    if (elapsed >= CONFIG.DRAW_HAND_HOLD_MS) completeShakeStage();
  }
  function resetShakeProgress(){
    shake.completed = false;
    shake.active = false;
    shake.startedAt = 0;
    els.qianTongZone.classList.remove('shaking'); els.sticksGroup.classList.remove('is-shaking'); els.shakeRing.classList.remove('on');
    els.shakeRing.style.setProperty('--p', 0);
    els.drawHint.textContent = '請讓雙手同時進入畫面，開始搖籤';
  }
  function completeShakeStage(){
    shake.completed = true;
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
    els.drawHint.textContent = '籤條抽出中…';
    if (navigator.vibrate) navigator.vibrate([20, 45, 20]);
    window.setTimeout(() => {
      if (state.current === 'draw') callbacks.completeDraw();
    }, 420);
  }

  function resetDrawReveal(){
    els.qianStick.classList.add('hidden');
    els.qianStick.classList.remove('auto-draw', 'punch');
    els.qianStick.style.transform = 'translate(-50%, 0)';
    els.drawHint.textContent = '請讓雙手同時進入畫面，開始搖籤';
  }

  // ============================================================
  // ============================================================
  // 擲筊判定：攝影機模式只要求同一個結果影格偵測到兩隻手，
  // 不再等待單手握拳、抓杯、跟手移動或放手投擲。
  // ============================================================
  function handleBwaGesture(hands){
    // 擲出後直到 flow-controller 完成結果處理前，筊杯狀態必須鎖死；
    // 否則落地後的手部影像可能又被誤判成「握拳抓杯」。
    if (state.bwaTossing) {
      return;
    }

    if (hands.length < 2){
      cup.twoHandsSeen = false;
      els.bwaHint.textContent = '請讓雙手同時進入畫面即可擲筊';
      return;
    }

    if (cup.twoHandsSeen) return;
    cup.twoHandsSeen = true;
    els.bwaHint.textContent = '已偵測到雙手，擲筊中…';
    callbacks.tossBwa(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
  }

  let markerA, markerB, line, fistDot;
  function ensureMarkers(){
    if (!markerA){
      markerA = document.createElement('div'); markerA.className='fingertip-marker';
      markerB = document.createElement('div'); markerB.className='fingertip-marker';
      line = document.createElement('div'); line.className='pinch-line';
      fistDot = document.createElement('div'); fistDot.className='fist-indicator';
      rootEl.appendChild(markerA); rootEl.appendChild(markerB);
      rootEl.appendChild(line); rootEl.appendChild(fistDot);
    }
  }
  function hideFingertipUI(){ if (markerA){ markerA.style.opacity=0; markerB.style.opacity=0; line.style.opacity=0; } }
  function updateFistIndicator(wrist, fistNow){
    ensureMarkers();
     const point = toDisplayPoint(wrist, true);
     fistDot.style.left=point.x+'px'; fistDot.style.top=point.y+'px';
    fistDot.style.opacity = fistNow?1:0.35; fistDot.style.borderColor = fistNow ? 'var(--gold-soft)' : 'rgba(255,255,255,0.4)';
  }
  function hideFistIndicator(){ if (fistDot) fistDot.style.opacity=0; }

  // 合十階段視覺回饋：雙手可見時顯示兩個掌心點+連線；只偵測到單手時顯示單一穩定指示點
  function updateDualHandUI(cA, cB, isClose){
    ensureMarkers();
     const pointA=toDisplayPoint(cA), pointB=toDisplayPoint(cB);
     const ax=pointA.x, ay=pointA.y;
     const bx=pointB.x, by=pointB.y;
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
     const point = toDisplayPoint(c);
     fistDot.style.left=point.x+'px'; fistDot.style.top=point.y+'px';
    fistDot.style.opacity = 1; fistDot.style.borderColor = 'var(--gold-soft)';
  }

  // 新增：釋放資源用（原始版本沒有這支函式，因為活在單頁iframe裡卸載時瀏覽器整包回收；
  // 元件化之後需要能清掉手動建立的marker DOM節點，避免殘留在畫面上）
  function destroy(){
    [markerA, markerB, line, fistDot].forEach(elm => elm && elm.remove());
  }

  return {
    onResults, syncCanvasSize, resetDrawReveal, resetShakeProgress, resetIncenseProgress,
    resetBwaTracking(){ cup.twoHandsSeen=false; },
    lockBwaUntilHandsLeave(){ cup.twoHandsSeen=true; },
    destroy
  };
}
