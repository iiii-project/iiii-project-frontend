/* =========================================================================
   PresenceDetector — 用人像去背遮罩判斷「有人／身體部位進到主要位置」
   不再跑 MediaPipe Hands：去背模型本來就在跑，這裡只是把它產生的遮罩縮成
   很小的圖（預設 16×28），算主要區域內人像像素的比例，超過門檻就觸發一次。

   - 只有在 waitForPresence() 等待中才讀遮罩，平常完全不做事。
   - 觸發一次就解除，後續流程不再需要偵測（只是動畫的開關）。
   - 一直收不到遮罩（去背模型載不到、被停用）時，等 noMaskFallbackMs 後
     直接觸發，避免流程卡住。
   ========================================================================= */
export function createPresenceDetector({ config: CONFIG }) {
  const SAMPLE_W = CONFIG.PRESENCE_SAMPLE_WIDTH;
  const SAMPLE_H = CONFIG.PRESENCE_SAMPLE_HEIGHT;
  let canvas = null;
  let ctx = null;
  let waiter = null;

  function ensureCanvas() {
    if (ctx) return ctx;
    canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    return ctx;
  }

  /* 主要區域以「使用者看到的鏡像畫面」為準，遮罩本身沒有鏡像，
     所以 x 要翻過來取。 */
  function zoneCoverage(mask) {
    const context = ensureCanvas();
    context.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
    context.drawImage(mask, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = context.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const [zoneX0, zoneX1] = CONFIG.PRESENCE_ZONE_X;
    const [zoneY0, zoneY1] = CONFIG.PRESENCE_ZONE_Y;
    const x0 = Math.floor((1 - zoneX1) * SAMPLE_W);
    const x1 = Math.ceil((1 - zoneX0) * SAMPLE_W);
    const y0 = Math.floor(zoneY0 * SAMPLE_H);
    const y1 = Math.ceil(zoneY1 * SAMPLE_H);
    let hit = 0;
    let total = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        // 去背遮罩的人像信心值在 alpha 通道（與 destination-in 合成一致）
        if (data[(y * SAMPLE_W + x) * 4 + 3] >= 128) hit += 1;
        total += 1;
      }
    }
    return total ? hit / total : 0;
  }

  function fire() {
    const current = waiter;
    if (!current) return;
    clearTimeout(current.fallbackTimer);
    waiter = null;
    current.onDetected();
  }

  /** 去背每產生一張新遮罩就呼叫一次；沒有人在等就直接返回。 */
  function update(mask) {
    if (!waiter || !mask) return;
    if (!waiter.sawMask) {
      waiter.sawMask = true;
      clearTimeout(waiter.fallbackTimer);
    }
    let coverage = 0;
    try {
      coverage = zoneCoverage(mask);
    } catch (error) {
      // 讀不到像素（例如 WebGL 遮罩被瀏覽器拒絕讀回）就不要卡住流程
      console.warn('[temple-ar-oracle] 無法讀取去背遮罩，直接觸發', error);
      fire();
      return;
    }
    if (coverage >= CONFIG.PRESENCE_MIN_COVERAGE) {
      waiter.hits += 1;
      if (waiter.hits >= CONFIG.PRESENCE_REQUIRED_HITS) fire();
    } else {
      waiter.hits = 0;
    }
  }

  /** 等到有人進入主要區域就呼叫 onDetected（只呼叫一次）；回傳取消函式。 */
  function waitForPresence(onDetected) {
    cancel();
    const current = { onDetected, hits: 0, sawMask: false, fallbackTimer: 0 };
    current.fallbackTimer = setTimeout(() => {
      if (waiter === current && !current.sawMask) fire();
    }, CONFIG.PRESENCE_NO_MASK_FALLBACK_MS);
    waiter = current;
    return () => {
      if (waiter === current) cancel();
    };
  }

  function cancel() {
    if (!waiter) return;
    clearTimeout(waiter.fallbackTimer);
    waiter = null;
  }

  function destroy() {
    cancel();
    canvas = null;
    ctx = null;
  }

  return { update, waitForPresence, cancel, destroy };
}
