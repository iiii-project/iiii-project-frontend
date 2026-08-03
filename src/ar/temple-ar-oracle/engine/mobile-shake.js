/* =========================================================================
   MobileShake — 手機抽籤使用裝置動作感測，不會請求鏡頭；
   iOS 需在使用者點擊後明確授權（DeviceMotionEvent.requestPermission）。
   來源：temple_oracle_v17.html 2653–2728行，判定邏輯（震盪次數/閾值/防抖間隔）
   完全原封不動搬遷。

   【封裝調整說明（僅此三處，其餘邏輯數值全部相同）】
   1. 全域 `els.xxx`、`AppState.xxx` 改為 createMobileShake() 呼叫時注入的
      `els` / `state`（state 與 GestureEngine 共用同一份 ArState）。
   2. 全域 `stickEls`（頁面等級的常數）改為每次從注入的 `els.sticksGroup`
      即時查詢 `.stick` 元素，語意相同（原本也只是 querySelectorAll 的結果快取）。
   3. 全域呼叫 `UIActions.completeDraw()` 改為呼叫注入的 `callbacks.completeDraw()`。
   ========================================================================= */
export function createMobileShake({ els, state, callbacks }) {
  let active = false;
  let sawMotion = false;
  let watchdog = 0;
  let lastMagnitude = null;
  let lastHitAt = 0;
  let hits = 0;
  const requiredHits = 3;

  function supportsMotion(){ return 'DeviceMotionEvent' in window; }

  async function requestAccess(){
    if (!supportsMotion()) return false;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function'){
        const permission = await DeviceMotionEvent.requestPermission();
        return permission === 'granted';
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function stop(){
    active = false;
    if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
    lastMagnitude = null;
    lastHitAt = 0;
    hits = 0;
    els.qianTongZone.classList.remove('shaking');
    window.removeEventListener('devicemotion', onMotion);
  }

  function complete(){
    stop();
    const stickEls = Array.from(els.sticksGroup.querySelectorAll('.stick'));
    const chosen = stickEls[Math.floor(Math.random() * stickEls.length)];
    stickEls.forEach(stick => stick.classList.remove('selected'));
    chosen.classList.add('selected');
    state.selectedStickCx = parseFloat(chosen.dataset.cx);
    els.qianStick.style.left = `${(state.selectedStickCx / 200) * 100}%`;
    els.qianStick.style.transform = 'translate(-50%, 0)';
    els.qianStick.classList.remove('hidden');
    els.drawHint.textContent = '感應完成，正在抽出籤條…';
    if (navigator.vibrate) navigator.vibrate([20, 45, 20]);
    setTimeout(() => callbacks.completeDraw(), 420);
  }

  function onMotion(event){
    sawMotion = true;
    if (!active || state.current !== 'draw') return;
    const rawAcceleration = event.acceleration;
    const hasRawAcceleration = rawAcceleration && [rawAcceleration.x, rawAcceleration.y, rawAcceleration.z]
      .some(value => Number.isFinite(value));
    const acceleration = hasRawAcceleration ? rawAcceleration : event.accelerationIncludingGravity;
    if (!acceleration) return;
    const magnitude = Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0);
    const now = performance.now();
    if (lastMagnitude !== null && Math.abs(magnitude - lastMagnitude) > 4.5 && now - lastHitAt > 280){
      hits += 1;
      lastHitAt = now;
      els.qianTongZone.classList.remove('shaking');
      void els.qianTongZone.offsetWidth;
      els.qianTongZone.classList.add('shaking');
      els.drawHint.textContent = `感應到搖動 ${hits} / ${requiredHits}`;
      if (hits >= requiredHits) complete();
    }
    lastMagnitude = magnitude;
  }

  /* 看門狗：有些裝置（桌機瀏覽器、沒有加速度計的平板）即使拿得到權限，
     devicemotion 也永遠不會觸發。這裡在 start() 之後等一段時間，
     若完全沒收到事件就回報給 flow-controller，讓它把「直接抽籤」按鈕放出來，
     使用者才不會卡在一個搖不動的畫面。 */
  function start(){
    if (!state.mobileShakeReady) return false;
    stop();
    active = true;
    sawMotion = false;
    window.addEventListener('devicemotion', onMotion, { passive:true });
    watchdog = window.setTimeout(() => {
      if (active && !sawMotion) callbacks.onMotionUnavailable && callbacks.onMotionUnavailable();
    }, 4000);
    return true;
  }

  return { requestAccess, start, stop };
}

// 裝置偵測：原始碼裡的判斷式（User-Agent + 觸控點數 + pointer:coarse媒體查詢 + 視窗寬度），
// 完全原封不動搬遷，用來決定要走「攝影機手勢」還是「手機搖晃」路徑。
export function isMobileDevice(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.matchMedia('(pointer:coarse)').matches && window.innerWidth < 900);
}
