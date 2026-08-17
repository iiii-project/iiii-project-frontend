/* =========================================================================
   flow-controller — 插香 → 搖籤/抽籤 → 擲筊 場景切換與流程狀態機

   來源：temple_oracle_v17.html 的 UIActions 模組（2749–3361行，共806行）。
   這是整個抽取工作裡「改動最多」的一支檔案，因為原始 UIActions 把AR核心流程
   跟大量周邊功能（結果畫面文字排版、平安符產生器、快速解籤表單、手動查籤……）
   混在同一個IIFE裡。以下清楚列出取捨：

   【原封不動保留的函式】
     showScene（僅保留incense/draw/bwa三段，result交由callbacks.onSequenceComplete）
     flashOnce, darken
     completeIncense, completeDraw
     resetBwaVisual, playLandingSounds, playClickBwaAnimation
     tossBwa, resolveBwaResult, gradeTier
     playInkTransition（原本是模組外的獨立函式，邏輯相同一併搬入）

   【刻意省略、交給新前端自行處理的部分（皆為周邊功能，非AR核心）】
     - showResultScene() 内部的文字渲染/書法動畫/平安符——交由 sequence-complete
       事件把資料整包丟出去，畫面完全由新前端決定怎麼呈現
     - SincereStreak.increment()（誠心次數統計，屬於「籤詩收藏」周邊功能）
     - castLookupBwa()（「已知籤號查詢」模式專用，這是首頁的手動查籤周邊功能，
       不是插香→搖籤→擲筊的核心儀式路徑，這次v1沒有搬）
     - castClickBwa() 內原本判斷 AppState.isFortuneLookup 導向 castLookupBwa
       的那個分支，已一併移除（因為上面那支沒搬，這個分支目前用不到）

   【行為調整（不是原封不動，這裡明確列出）】
     - 原始 goHome() 會一併關掉 profile/vow/history/chat 等周邊 modal，
       這裡的 reset() 只保留AR核心場景相關的重置，周邊 modal 由新前端自己管理。
     - 原本用 `window.location.search` 的 mode（manual/lookup/interpret）與
       `isMobileDevice` 全域變數做流程分支，這裡改成呼叫 start() 時由外部明確
       傳入 requestedMode（'auto' | 'camera' | 'motion' | 'manual'），內部再依
       裝置能力/鏡頭權限解析出最終 resolvedMode，透過 'input-mode-resolved'
       事件回報給宿主頁面（取代原本壞掉的 window.parent.location.assign 寫法，
       這一段在前面討論就已經先跟你確認過）。
   ========================================================================= */
import { isMobileDevice } from "./mobile-shake.js";
import { spawnLightBurst, screenShakeOnce } from "./particle-system.js";

/* 領籤過場：播放自製的 5.12 秒動畫（龍銜籤送到眼前）。
   影片沒進版控（.gitignore），所以一定要能在缺檔時自動退回墨染過場——
   載入失敗、解碼失敗、或播放卡住超過預期時間，都走 fallback。
   預設值是這支影片；呼叫端可透過 options.src / hooks.src 覆蓋，未帶入時
   就走這個預設值。<temple-ar-oracle> 把這個覆蓋參數接到 transition-src
   attribute，例如桌機版 OracleWizard.vue 就是靠這個 attribute 換成 dragon.mp4，
   手機版沒帶這個 attribute，維持這支預設影片。 */
export const ORACLE_TRANSITION_SRC = "/videos/oracle-transition.mov";
const ORACLE_TRANSITION_MS = 5120; // 素材長度（拿不到 metadata 時的備用值）
const REVEAL_LEAD_MS = 350; // 影片剩這麼久時才揭曉籤詩，讓最後一格溶進結果頁
const HARD_CAP_EXTRA_MS = 2500; // 影片真的卡死時的保險

export function preloadOracleTransition(els, options = {}) {
  const video = els.transitionVideo;
  if (!video || video.dataset.ready === "1" || video.dataset.failed === "1")
    return;
  video.src = options.src || ORACLE_TRANSITION_SRC;
  video.addEventListener(
    "canplaythrough",
    () => {
      video.dataset.ready = "1";
    },
    { once: true },
  );
  video.addEventListener(
    "error",
    () => {
      video.dataset.failed = "1";
    },
    { once: true },
  );
  video.load();
}

export function playOracleTransition(els, onCovered, hooks = {}) {
  const video = els.transitionVideo;
  if (
    !video ||
    video.dataset.failed === "1" ||
    !video.canPlayType("video/mp4")
  ) {
    playInkTransition(els, onCovered);
    return;
  }

  let settled = false;
  let revealed = false;
  let capTimer = 0;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    if (onCovered) onCovered();
  };

  const cleanup = () => {
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("ended", onEnded);
    if (capTimer) clearTimeout(capTimer);
    // 過場結束，把 AR 的繪圖負載放回去
    if (hooks.onEnd) hooks.onEnd();
  };

  const finish = () => {
    if (settled) return;
    settled = true;
    reveal();
    cleanup();
    video.classList.remove("show");
    video.classList.add("fade-out");
    setTimeout(() => {
      video.classList.remove("fade-out");
      video.pause();
      video.currentTime = 0;
    }, 720);
  };

  const bail = () => {
    if (settled) return;
    settled = true;
    cleanup();
    video.classList.remove("show", "fade-out");
    playInkTransition(els, onCovered);
  };

  /* 揭曉時機改用影片自己的 currentTime，而不是 setTimeout。
     牆上時鐘與影片時鐘會分岔——畫面掉格時影片會落後，
     用計時器就會在影片還沒播完時就把籤詩掀出來。 */
  function onTimeUpdate() {
    const total =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : ORACLE_TRANSITION_MS / 1000;
    if (video.currentTime >= total - REVEAL_LEAD_MS / 1000) reveal();
  }
  function onEnded() {
    finish();
  }

  if (!video.src) video.src = hooks.src || ORACLE_TRANSITION_SRC;
  video.currentTime = 0;
  /* 開聲播放。瀏覽器只在頁面已有使用者互動時才允許非靜音自動播放，
     走到這步使用者早就點過擲筊；若仍被擋，退成靜音再播一次，
     不能直接放棄影片（否則「沒聲音」會變成「沒畫面」）。 */
  video.muted = false;
  video.volume = 0.9;
  video.addEventListener("error", bail, { once: true });
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("ended", onEnded);

  // 播放期間把 AR 的重繪工作停掉，讓解碼吃得到資源
  if (hooks.onStart) hooks.onStart();

  const tryPlay = video.play();
  if (tryPlay && typeof tryPlay.catch === "function") {
    tryPlay.catch(() => {
      video.muted = true;
      const retry = video.play();
      if (retry && typeof retry.catch === "function") retry.catch(bail);
    });
  }

  /* 讓影片浮出來。
     原本是 requestAnimationFrame(() => add('show'))——目的是先讓瀏覽器套用
     移除 fade-out 後的樣式，再加 show 才會有淡入。問題是這一格 rAF 不保證會
     來（頁面被判定為不可見、分頁在背景、或這一刻正忙著解碼與 three.js 重繪），
     一旦沒來，class 就永遠不會加上：影片其實在播、有聲音，但整個是透明的，
     使用者看到的就是「過場動畫沒播」。
     改用強制重排（與 playInkTransition 同一個手法）同步把樣式沖出去，
     淡入照樣有，但不再依賴 rAF 會不會被呼叫。 */
  video.classList.remove("fade-out");
  void video.offsetWidth;
  video.classList.add("show");

  const total =
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration * 1000
      : ORACLE_TRANSITION_MS;
  capTimer = setTimeout(finish, total + HARD_CAP_EXTRA_MS);
}

export function playInkTransition(els, onCovered) {
  els.transitionOverlay.classList.remove("play");
  void els.transitionOverlay.offsetWidth;
  els.transitionOverlay.classList.add("play");
  setTimeout(() => {
    if (onCovered) onCovered();
  }, 320);
  setTimeout(() => {
    els.transitionOverlay.classList.remove("play");
  }, 950);
}

export function createFlowController({
  els,
  state,
  api,
  gestureEngine,
  bwaScene,
  particleSystem,
  audioEngine,
  mobileShake,
  rootEl,
  emit,
  transitionSrc,
}) {
  /* 解籤（AI 生成）通常是整段流程裡最慢的一步。原本是「先等 interpret 回來，
     才開始播領籤過場」，使用者會在定格畫面前面乾等。改成兩件事並行：
     過場影片立刻開始播，interpret 在背景跑，等影片播到揭曉點時才會合。
     若那時還沒回來，最多再多等 REVEAL_GRACE_MS，逾時就先顯示籤詩本文
     （籤詩在擲筊前就已經抽出來了，只有 AI 解說會缺）。 */
  const REVEAL_GRACE_MS = 2500;

  function interpretInBackground() {
    return api
      .interpret(state.sessionId)
      .then((session) => {
        state.currentFortune = session.fortune;
        state.interpretation = session.interpretation;
        /* 解籤實測要 ~21 秒，遠長於 5.1 秒的過場影片，所以揭曉不會等它。
           這裡在它真的回來時再補發一次事件，讓畫面把解籤填進去。 */
        emit("interpretation-ready", {
          sessionId: state.sessionId,
          fortune: state.currentFortune,
          interpretation: state.interpretation,
          offline: Boolean(session.offline),
        });
      })
      .catch((error) => {
        emit("toast", {
          message: error.message || "AI 解籤暫時無法使用，先為你顯示籤詩內容",
        });
      });
  }

  /* ── 擲筊結果預取 ──────────────────────────────────────────────────────
     擲筊的結果是後端決定的（api.blocks），與使用者怎麼擲無關；動畫只是把
     那個結果演出來。原本是「使用者擲了 → 才 POST → 等回應 → 才開始演」，
     等待就卡在最需要即時回饋的那一刻。

     改成進到擲筊場景時就先把那一次 POST 發掉，結果先拿在手上；等前端自己
     判定擲筊動作成立，直接拿現成的結果播動畫，不再等網路。
     一次擲筊只發一次（後端規則是一次聖筊即允准，非聖筊會重抽籤、重新進場
     時才會再發一次），所以不會多打 API。

     另外，預取回來就已經知道是不是聖筊了——是的話解籤（最慢的一步）也在
     這時候一起發出去，比使用者擲完再發又早了整段擲筊動作的時間。 */
  let pendingCast = null; // 這一輪擲筊結果（Promise）
  let pendingInterpret = null; // 這一輪的解籤請求（Promise），只發一次

  /* 神明實景疊加：插香/抽籤/擲筊三階段各自進場先完全不透明蓋住鏡頭，
     維持這裡列的秒數之後才淡化，讓使用者透過半透明畫面看到自己（見 showScene）。 */
  const RITUAL_OVERLAY_VEIL_MS = { incense: 1000, draw: 500, bwa: 500 };
  let ritualOverlayTimer = 0;

  function startInterpretOnce() {
    if (!pendingInterpret) pendingInterpret = interpretInBackground();
    return pendingInterpret;
  }

  function resetCastPrefetch() {
    pendingCast = null;
    pendingInterpret = null;
  }

  function prefetchCast() {
    if (!state.sessionId || pendingCast) return;
    const request = api.blocks(state.sessionId).then((result) => {
      // 聖筊已定：解籤不必等使用者擲完
      if (result.confirmed) startInterpretOnce();
      return result;
    });
    // 還沒有人 await 時不要變成 unhandled rejection；真正的錯誤在 takeCast 處理
    request.catch(() => {});
    pendingCast = request;
  }

  /* 取用預取到的結果。這裡不能一進來就把 pendingCast 清掉：
     pointerdown/click、手勢收尾影格、甚至瀏覽器合成事件有機會在第一個 await
     尚未回來前再次進入 takeCast()。若先清空，第二個呼叫會以為沒有預取而再送
     一次 /blocks/，第一個請求已經讓後端確認時，第二次就會 409。
     因此同一輪擲筊期間所有呼叫都共用同一個 Promise；只有失敗才清掉並現場重試。 */
  async function takeCast() {
    if (!pendingCast) {
      pendingCast = api.blocks(state.sessionId).then((result) => {
        if (result.confirmed) startInterpretOnce();
        return result;
      });
      pendingCast.catch(() => {});
    }

    try {
      return await pendingCast;
    } catch (error) {
      pendingCast = null;
      const result = await api.blocks(state.sessionId);
      if (result.confirmed) startInterpretOnce();
      return result;
    }
  }

  /* 過場動畫至少要有的時間。
     sequence-complete 一發出去，宿主就會切到籤詩頁、把整個 AR 全螢幕層卸載，
     所以這個事件早發＝動畫被砍斷。以前解籤要等 ~21 秒，Promise.race 自然會
     卡在寬限時間上，等於順手給了動畫時間；現在解籤在使用者擲筊前就發出去、
     常常已經回來了，race 會瞬間通過——影片播得動時無妨（reveal 本來就在片尾
     才觸發），但影片播不動改走 320ms 的墨轉場時，畫面會在動畫還沒演完就跳掉。
     這裡明確補上下限，不再依賴「解籤很慢」這個巧合。 */
  const MIN_TRANSITION_MS = 1800;

  /* 等一個繪圖影格。
     預取之後「按下去」到「開始擲」之間已經沒有網路等待了，等於在同一個 task 裡
     就呼叫 bwaScene.toss()。等一格再擲，可以確保筊杯先以起始位置被畫出來一次，
     整段落下都看得到——原本是靠網路來回的那幾十毫秒順手達成的。 */
  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function finishAfter(pending) {
    const startedAt = Date.now(); // 呼叫點就是過場開始的時間
    return async () => {
      const grace = new Promise((resolve) =>
        setTimeout(resolve, REVEAL_GRACE_MS),
      );
      // pending 理論上必有（只在聖筊分支呼叫），沒有時就純粹等寬限時間
      await Promise.race([pending || grace, grace]);
      const left = MIN_TRANSITION_MS - (Date.now() - startedAt);
      if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
      /* 聖筊分支（resolveBwaResult/castClickBwa）呼叫這裡之前都還維持
         bwaTossing=true，就是要撐到這一刻——在這之前手勢/點擊引擎都還可能
         判定成「可以再擲一次」，對同一個 session 重複送出 blocks/interpret。
         真正結束（要離開擲筊場景了）才在這裡解鎖。 */
      state.bwaTossing = false;
      emit("sequence-complete", {
        sessionId: state.sessionId,
        fortune: state.currentFortune,
        interpretation: state.interpretation,
      });
    };
  }

  /* 過場影片播放時，AR 這邊的 MediaPipe 推論、攝影機畫布重繪、
     粒子與 three.js 迴圈全都還在滿載跑，會跟影片解碼搶資源造成掉格。
     這裡在過場期間把它們停掉，結束再放回去。 */
  const transitionLoadHooks = {
    src: transitionSrc,
    onStart() {
      state.transitionActive = true;
      if (particleSystem.pause) particleSystem.pause();
      if (bwaScene.pause) bwaScene.pause();
    },
    onEnd() {
      state.transitionActive = false;
      if (particleSystem.resume) particleSystem.resume();
      if (bwaScene.resume) bwaScene.resume();
    },
  };

  function showScene(name) {
    [els.sceneIncense, els.sceneDraw, els.sceneBwa].forEach((s) =>
      s.classList.add("hidden"),
    );
    if (name !== "draw") mobileShake.stop();
    state.current = name;

    /* 神明實景疊加：每次進場先恢復「純實景、人像先隱藏」（veil），停留該階段的秒數後
       才同步切換——神明實景淡到六成、人像（去背後的#output_canvas）同時淡入疊上來。 */
    window.clearTimeout(ritualOverlayTimer);
    const veilMs = RITUAL_OVERLAY_VEIL_MS[name];
    // 防呆：els.ritualOverlay / els.outputCanvas 理論上一定存在，
    // 但曾經在插香/抽籤/擲筊進場時炸過 undefined.classList，先擋著避免整個流程卡死。
    if (veilMs != null) {
      if (!els.ritualOverlay || !els.outputCanvas) {
        console.warn(
          "[temple-ar-oracle] showScene: ritualOverlay/outputCanvas 缺失，跳過神明實景淡入效果",
          {
            name,
            hasRitualOverlay: !!els.ritualOverlay,
            hasOutputCanvas: !!els.outputCanvas,
          },
        );
      } else {
        els.ritualOverlay.classList.remove("blended");
        els.outputCanvas.classList.remove("blended");
        ritualOverlayTimer = window.setTimeout(() => {
          els.ritualOverlay?.classList.add("blended");
          els.outputCanvas?.classList.add("blended");
        }, veilMs);
      }
    }

    if (name === "incense") {
      els.sceneIncense.classList.remove("hidden");
      gestureEngine.resetIncenseProgress();
      const q = state.userQuery;
      els.incenseHint.textContent = q.question
        ? `請雙手合十，默念：「${q.question}」`
        : `請雙手合十，默念關於「${q.category}」的問題`;
    }
    if (name === "draw") {
      els.sceneDraw.classList.remove("hidden");
      // 回到抽籤（第一次進場或非聖筊重抽）：上一輪預取的結果與解籤都作廢
      resetCastPrefetch();
      state.drawSubState = "shake";
      Array.from(els.sticksGroup.querySelectorAll(".stick")).forEach((s) =>
        s.classList.remove("selected"),
      );
      gestureEngine.resetShakeProgress();
      gestureEngine.resetPinch();
      const useMobileShake =
        state.resolvedMode === "motion" ||
        (isMobileDevice() && state.resolvedMode !== "manual");
      els.drawHint.textContent =
        state.resolvedMode === "manual"
          ? "準備好後，點擊籤筒抽出一支籤。"
          : useMobileShake && state.mobileShakeReady
            ? "拿起手機，上下搖動三次即可抽籤"
            : useMobileShake
              ? "未開啟動作感測，可直接抽籤。"
              : "請對著籤筒握拳，上下搖晃";
      // 手機正常流程只透過搖動抽籤；僅在感測器不可用時才顯示直接抽籤備援。
      els.btnManualDraw.classList.toggle(
        "hidden",
        !(
          state.resolvedMode === "manual" ||
          (useMobileShake && !state.mobileShakeReady)
        ),
      );
      els.btnManualDraw.textContent = useMobileShake
        ? "直 接 抽 籤"
        : "手 動 抽 籤";
      if (useMobileShake && state.mobileShakeReady) mobileShake.start();
    }
    if (name === "bwa") {
      els.sceneBwa.classList.remove("hidden");
      /* 筊杯容器在隱藏狀態下 clientWidth/Height 都是 0，three.js 會以 0×0 建立
         renderer。這裡等它顯示出來後觸發一次 resize，讓畫布重新取得正確尺寸。 */
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      els.bwaResultPanel.classList.add("hidden");
      /* 手動模式改成「直接點筊杯」：不再另外給一顆擲筊按鈕，
         筊杯容器打開 pointer-events，由 index.js 的 pointerdown 做命中判定。 */
      const isClickBwaMode =
        state.resolvedMode === "manual" ||
        state.resolvedMode === "motion" ||
        isMobileDevice();
      state.clickBwaMode = isClickBwaMode;
      els.btnClickBwa.classList.add("hidden");
      els.bwaThreeContainer.classList.toggle("tossable", isClickBwaMode);
      els.bwaHint.textContent = isClickBwaMode
        ? "點擊筊杯，向神明請示此籤"
        : "請伸出雙手，掌心合起捧住筊杯";
      if (!isClickBwaMode) {
        resetBwaVisual();
        gestureEngine.resetBwaTracking();
      }
      state.bwaTossing = false;
      /* 一進擲筊場景就把這一次的結果要回來放著，等使用者真的擲了就直接演，
         不必在那一刻等網路（見 prefetchCast）。 */
      prefetchCast();
    }
  }

  function flashOnce() {
    els.flash.classList.remove("play");
    void els.flash.offsetWidth;
    els.flash.classList.add("play");
  }
  function darken(on) {
    els.darken.classList.toggle("on", on);
  }

  async function completeIncense() {
    if (state.current !== "incense") return;
    state.current = "transition";
    try {
      await api.prayer(state.sessionId);
      emit("incense-complete");
      playInkTransition(els, () => showScene("draw"));
    } catch (error) {
      state.current = "incense";
      emit("toast", { message: error.message || "無法完成祈求，請再試一次" });
    }
  }

  async function completeDraw() {
    if (state.current !== "draw") return;
    state.current = "transition";
    const rect = els.qianStick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2,
      cy = rect.top;
    els.qianStick.classList.add("punch");
    spawnLightBurst(rootEl, cx, cy);
    screenShakeOnce(rootEl);
    particleSystem.burst(cx, cy, 26);
    flashOnce();
    try {
      state.currentFortune = await api.draw(state.sessionId);
      emit("draw-complete", { fortune: state.currentFortune });
      setTimeout(() => playInkTransition(els, () => showScene("bwa")), 700);
    } catch (error) {
      state.current = "draw";
      emit("toast", { message: error.message || "無法抽籤，請再試一次" });
    }
  }

  function resetBwaVisual() {
    els.outputCanvas.classList.remove("dof-blur");
    els.arDecoration.classList.remove("dof-blur");
    bwaScene.resetIdle();
  }

  function playLandingSounds(coinA, coinB) {
    const play = (coin, delay) =>
      setTimeout(() => {
        coin === "flat" ? audioEngine.tap() : audioEngine.thud();
      }, delay);
    play(coinA, 0);
    play(coinB, 55);
  }

  async function playClickBwaAnimation(result) {
    const sides =
      result.result === "sheng"
        ? ["flat", "domed"]
        : result.result === "xiao"
          ? ["flat", "flat"]
          : ["domed", "domed"];
    const [coinA, coinB] = sides;
    // 先讓筊杯以起始位置被畫出一格，落下的過程才完整看得到（見 nextFrame）
    await nextFrame();
    return new Promise((resolve) => {
      bwaScene.toss(
        coinA,
        coinB,
        () => {
          playLandingSounds(coinA, coinB);
          if (navigator.vibrate) navigator.vibrate(20);
        },
        () => setTimeout(resolve, 250),
      );
    });
  }

  // ============================================================
  // 拋擲物理動畫：
  // 依「聖筊／笑筊／陰筊」機率先由後端決定本次結果（coinA, coinB 分別代表
  // 兩顆筊杯落地後是「凸面朝上」或「平面朝上」），交給 bwaScene 以真實的
  // 3D 網格 + 重力公式 + 旋轉補間播放動畫，確保畫面呈現與文字訊息一致。
  // ============================================================
  async function tossBwa(_sx, _sy, _vx, _vy) {
    if (state.bwaTossing) return;
    state.bwaTossing = true;
    els.bwaHint.textContent = "筊杯擲出中…";
    try {
      // 進場時就預取好的結果，這裡通常立刻拿到，不會卡在網路上
      const result = await takeCast();
      const sides =
        result.result === "sheng"
          ? ["flat", "domed"]
          : result.result === "xiao"
            ? ["flat", "flat"]
            : ["domed", "domed"];
      const [coinA, coinB] = sides;
      // 聖筊的解籤在預取回來時就已經發出去了，這裡只是把那個 Promise 帶下去
      state.pendingBwaResult = {
        coinA,
        coinB,
        result,
        pending: result.confirmed ? startInterpretOnce() : null,
      };
      await nextFrame();
      bwaScene.toss(
        coinA,
        coinB,
        () => {
          playLandingSounds(coinA, coinB);
          if (navigator.vibrate) navigator.vibrate(20);
        },
        () => {
          setTimeout(() => {
            resolveBwaResult();
          }, 250);
        },
      );
    } catch (error) {
      state.bwaTossing = false;
      els.bwaHint.textContent = "請伸出雙手，掌心合起捧住筊杯";
      emit("toast", { message: error.message || "無法完成擲筊，請再試一次" });
    }
  }

  async function castClickBwa() {
    if (state.bwaTossing || !state.sessionId || state.current !== "bwa") return;
    let keepLockedForTransition = false;
    state.bwaTossing = true;
    els.btnClickBwa.disabled = true;
    // 結果通常已經預取好了，所以這裡直接說「擲出中」，不再出現「正在請示…」的等待字樣
    els.bwaHint.textContent = "筊杯擲出中…";
    els.bwaThreeContainer.classList.remove("tossable");
    try {
      // 進場時就預取好的結果：點下去等於馬上開始演，不再有「正在請示…」的空等
      const result = await takeCast();
      /* 聖筊的解籤請求在預取回來的那一刻就發了（見 prefetchCast），
         這裡只是取回同一個 Promise，讓過場去等它。 */
      const pending = result.confirmed ? startInterpretOnce() : null;
      await playClickBwaAnimation(result);
      els.bwaResultPanel.classList.remove("hidden");

      if (result.confirmed) {
        flashOnce();
        els.bwaResultTitle.textContent = "聖筊 · 神明允准";
        els.bwaResultDesc.textContent = "聖筊，神明允准解籤。";
        emit("bwa-result", { tier: "sacred" });
        /* 點擊擲筊這條路以前會進 finally 立刻解鎖，使用者在過場開始前再點一次
           就會對同一個 session 重送 /blocks/，後端已經確認過時會回 409。
           聖筊後其實要離開擲筊場景了，所以鎖到 finishAfter() 發 sequence-complete。 */
        keepLockedForTransition = true;
        state.current = "transition";
        els.bwaThreeContainer.classList.remove("tossable");
        /* 解籤與過場並行：不等 interpret 回來就先播影片，
           影片播到揭曉點時才會合（見 finishAfter）。 */
        setTimeout(
          () =>
            playOracleTransition(
              els,
              finishAfter(pending),
              transitionLoadHooks,
            ),
          1200,
        );
      } else {
        if (result.result === "sheng") {
          els.bwaResultTitle.textContent = `第 ${result.attempt_number} 次聖筊`;
          els.bwaResultDesc.textContent = `請再連續取得 ${result.remaining_attempts} 次聖筊。`;
          els.bwaHint.textContent = "請再點一次筊杯。";
          if (state.clickBwaMode)
            els.bwaThreeContainer.classList.add("tossable");
          emit("bwa-result", {
            tier: "sheng-progress",
            attemptNumber: result.attempt_number,
            remainingAttempts: result.remaining_attempts,
          });
        } else {
          els.bwaResultTitle.textContent = `${result.result_name} · 重新抽籤`;
          els.bwaResultDesc.textContent =
            "本輪未能連續取得聖筊，正在重新抽出一支籤。";
          state.currentFortune = await api.draw(state.sessionId);
          els.bwaHint.textContent = "已抽出新籤，請重新開始擲筊。";
          emit("bwa-result", { tier: "other", resultName: result.result_name });
        }
        /* 這條路沒有離開擲筊場景（使用者就地再擲一次），
           所以在這裡替下一次補上預取，下一擲同樣不必等網路。 */
        resetCastPrefetch();
        prefetchCast();
      }
    } catch (error) {
      emit("toast", { message: error.message || "無法完成擲筊，請再試一次" });
    } finally {
      if (!keepLockedForTransition) {
        state.bwaTossing = false;
        els.btnClickBwa.disabled = false;
        if (state.clickBwaMode && state.current === "bwa")
          els.bwaThreeContainer.classList.add("tossable");
      }
    }
  }

  async function resolveBwaResult() {
    const { result, pending } = state.pendingBwaResult || {};
    els.bwaResultPanel.classList.remove("hidden");
    els.bwaResultPanel.classList.remove("reveal");
    void els.bwaResultPanel.offsetWidth;
    els.bwaResultPanel.classList.add("reveal");
    /* 這裡不能提前解鎖 bwaTossing：底下三個分支都還要等 API（interpret/draw）才算真正
       結束，太早解鎖會讓手勢引擎在等待期間把使用者收尾的手勢誤判成「可以再擲一次」，
       對同一個 session 重複送出 blocks/interpret/draw（實測會重複觸發）。改成每個分支
       各自在真正可以再擲一次的時間點才解鎖，跟 castClickBwa() 的 try/finally 寫法一致。 */

    if (result?.confirmed) {
      const pos = bwaScene.getScreenPos();
      particleSystem.burst(pos.x, pos.y);
      spawnLightBurst(rootEl, pos.x, pos.y);
      flashOnce();
      els.bwaResultTitle.textContent = "聖筊 · 神明允准";
      els.bwaResultDesc.textContent = "聖筊，神明允准解籤。";
      emit("bwa-result", { tier: "sacred" });
      /* 解籤與過場並行，使用者不必在定格畫面前乾等 AI 回應。
         pending 是擲筊結果剛回來時就發出的那一份請求（見 tossBwa）。
         bwaTossing 在這裡先不解鎖，要等 finishAfter(pending) 真正跑完
         （interpret 回來或逾時、要離開擲筊場景時）才解鎖，見 finishAfter 定義處。 */
      setTimeout(
        () =>
          playOracleTransition(els, finishAfter(pending), transitionLoadHooks),
        1200,
      );
    } else if (result?.result === "sheng") {
      els.bwaResultTitle.textContent = `第 ${result.attempt_number} 次聖筊`;
      els.bwaResultDesc.textContent = `請再連續取得 ${result.remaining_attempts} 次聖筊。`;
      emit("bwa-result", {
        tier: "sheng-progress",
        attemptNumber: result.attempt_number,
        remainingAttempts: result.remaining_attempts,
      });
      setTimeout(() => {
        els.bwaResultPanel.classList.add("hidden");
        resetBwaVisual();
        gestureEngine.resetBwaTracking();
        els.bwaHint.textContent = "請伸出雙手，掌心合起捧住筊杯";
        state.bwaTossing = false;
      }, 2200);
    } else {
      els.bwaResultTitle.textContent = `${result?.result_name || "非聖筊"} · 重新抽籤`;
      els.bwaResultDesc.textContent =
        "本輪未能連續取得聖筊，正在重新抽出一支籤。";
      emit("bwa-result", { tier: "other", resultName: result?.result_name });
      darken(true);
      api
        .draw(state.sessionId)
        .then((fortune) => {
          state.currentFortune = fortune;
        })
        .then(() =>
          setTimeout(() => {
            darken(false);
            playInkTransition(els, () => showScene("draw"));
          }, 2000),
        )
        .catch((error) => {
          darken(false);
          emit("toast", {
            message: error.message || "無法重新抽籤，請再試一次",
          });
        })
        .finally(() => {
          state.bwaTossing = false;
        });
    }
  }

  // 依吉凶等級文字判斷背景效果分級（上→金光閃爍／中→淡雅／下→墨色沉穩）
  function gradeTier(grade) {
    if (grade.includes("上")) return "tier-auspicious";
    if (grade.includes("下")) return "tier-caution";
    return "tier-neutral";
  }

  // 重置AR核心場景相關狀態（原始 goHome() 的AR部分；周邊 modal 的關閉交還給新前端自己處理）
  function reset() {
    [els.sceneIncense, els.sceneDraw, els.sceneBwa].forEach((s) =>
      s.classList.add("hidden"),
    );
    state.current = "idle";
    state.bwaTossing = false;
    window.clearTimeout(ritualOverlayTimer);
    els.ritualOverlay?.classList.remove("blended");
    els.outputCanvas?.classList.remove("blended");
    gestureEngine.resetIncenseProgress();
    gestureEngine.resetShakeProgress();
    gestureEngine.resetPinch();
    gestureEngine.resetBwaTracking();
    mobileShake.stop();
    // 離開儀式：預取的擲筊結果與解籤請求都不再屬於任何一場
    resetCastPrefetch();
  }

  // ============================================================
  // 對外唯一入口：整個插香→搖籤→擲筊儀式的啟動點。
  // 這裡是新增的整合邏輯（原始碼裡這段散落在 btnHomeStart 的點擊事件、
  // 以及檔案最尾端的 Camera/Hands bootstrap 兩處，這裡合併成一個函式，
  // 方便Web Component呼叫），內部判斷順序與原始碼行為一致：
  //   requestedMode === 'manual' → 一律走純點擊路徑，略過插香手勢偵測（優先權最高，
  //                                 即使同時在手機上也以此為準）
  //   手機裝置（且非manual） → 一律走 devicemotion 搖晃路徑，略過插香手勢偵測
  //   其餘（桌機） → 走攝影機手勢路徑（含插香偵測），若鏡頭權限被拒絕
  //                  則自動降級為純點擊路徑（取代原本的 window.parent.location.assign）
  // ============================================================
  async function start({
    question,
    category,
    requestedMode = "auto",
    startCamera,
  }) {
    state.userQuery = { question, category };
    state.current = "creating";

    const session = await api.create(question, category);
    state.sessionId = session.session_id;
    state.shareToken = session.share_token;
    state.interpretation = null;
    resetCastPrefetch();

    const mobile = isMobileDevice();

    /* 'motion'：不看 User-Agent，強制走搖晃路徑。
       原始碼只用 UA 判斷裝置、無法覆蓋（README 有記錄這個限制），
       這裡補上，讓宿主可以依畫面寬度（而非 UA）決定手機版就用搖的。 */
    if (requestedMode === "motion") {
      state.resolvedMode = "motion";
      state.mobileShakeReady = await mobileShake.requestAccess();
      emit("input-mode-resolved", {
        mode: "motion",
        motionGranted: state.mobileShakeReady,
        forced: true,
      });
      await api.prayer(state.sessionId);
      showScene("draw");
      if (!state.mobileShakeReady)
        emit("toast", { message: "這個裝置沒有動作感測，已提供直接抽籤。" });
      return;
    }

    if (requestedMode === "manual") {
      state.resolvedMode = "manual";
      emit("input-mode-resolved", { mode: "manual" });
      await api.prayer(state.sessionId);
      showScene("draw");
      return;
    }

    if (mobile) {
      state.resolvedMode = "motion";
      state.mobileShakeReady = await mobileShake.requestAccess();
      emit("input-mode-resolved", {
        mode: "motion",
        motionGranted: state.mobileShakeReady,
      });
      await api.prayer(state.sessionId);
      showScene("draw");
      if (!state.mobileShakeReady)
        emit("toast", { message: "未開啟動作感測，已提供直接抽籤。" });
      return;
    }

    // 桌機：嘗試攝影機手勢路徑，交由外部（index.js）啟動 MediaPipe camera
    try {
      await startCamera();
      state.resolvedMode = "camera";
      emit("input-mode-resolved", { mode: "camera" });
      showScene("incense");
    } catch (error) {
      // 對應原本「鏡頭權限被拒絕/無法啟動鏡頭」時的 window.parent.location.assign 寫法：
      // 這裡改為元件內部直接切到手動點擊模式，不做任何頁面跳轉。原本這裡還有一段
      // sessionStorage.setItem('temple-oracle-manual-fallback', 訊息文字) 給下一頁讀取顯示，
      // 因為不跳頁了，改成直接透過 toast 事件把同樣的訊息文字傳出去。
      const permissionDenied =
        error?.name === "NotAllowedError" ||
        error?.name === "PermissionDeniedError";
      state.resolvedMode = "manual";
      emit("input-mode-resolved", {
        mode: "manual",
        reason: permissionDenied ? "permission-denied" : "camera-error",
      });
      emit("toast", {
        message: permissionDenied
          ? "鏡頭權限已被拒絕，已切換為手動抽籤。"
          : "無法啟動鏡頭，已切換為手動抽籤。",
      });
      await api.prayer(state.sessionId);
      showScene("draw");
    }
  }

  return {
    start,
    reset,
    showScene,
    completeIncense,
    completeDraw,
    tossBwa,
    castClickBwa,
    gradeTier,
  };
}
