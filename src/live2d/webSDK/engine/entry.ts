// @ts-nocheck
/* eslint-disable no-underscore-dangle */
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { LAppDelegate } from "./lappdelegate";
import * as LAppDefine from "./lappdefine";
import { LAppGlManager } from "./lappglmanager";
import { LAppLive2DManager } from "./lapplive2dmanager";
import { LAppAdapter } from "./lappadapter";

let live2dPaused = false;

/**
 * 釋放目前的 Live2D 執行個體與 WebGL manager。
 * Live2DCompanion 會全站保留；儀式期間只暫停 rAF，避免舊 canvas
 * 繼續和 AR 的 MediaPipe/Three.js 佔用主執行緒。
 */
export function releaseLive2D(): void {
  LAppDelegate.releaseInstance();
  LAppLive2DManager.releaseInstance();
  LAppGlManager.releaseInstance();
}

export function pauseLive2D(): void {
  live2dPaused = true;
  LAppDelegate.getExistingInstance()?.pause();
}

export function resumeLive2D(): void {
  live2dPaused = false;
  LAppDelegate.getExistingInstance()?.run();
}

/**
 * Initialize the Live2D application
 */
export function initializeLive2D(): void {
  console.log(
    "Initializing Live2D with resourcePath:",
    LAppDefine.ResourcesPath
  );
  console.log("Model directories:", LAppDefine.ModelDir);

  // 初始化前完整釋放舊 singleton，讓 LAppGlManager 的 constructor 重新抓取
  // 目前 DOM 裡的 #canvas。正常求籤流程不會卸載這個 canvas，因此不會在結果頁
  // 再次觸發初始化。
  releaseLive2D();

  const glManager = LAppGlManager.getInstance();
  const delegate = LAppDelegate.getInstance();
  if (!glManager || !delegate.initialize()) {
    console.error("Failed to initialize Live2D");
    return;
  }

  if (!live2dPaused) delegate.run();

  (window as any).getLive2DManager = () => LAppLive2DManager.getInstance();

  // Make sure LAppAdapter is available globally
  if (!(window as any).getLAppAdapter) {
    console.log('Setting up getLAppAdapter function');
    (window as any).getLAppAdapter = () => LAppAdapter.getInstance();
  }

  if ((window as any).api?.setIgnoreMouseEvent) {
    const parent = document.getElementById("live2d");

    parent?.addEventListener("pointermove", (e) => {
      const model = LAppLive2DManager.getInstance().getModel(0);
      const view = LAppDelegate.getExistingInstance()?.getView();

      // Transform screen coordinates to Live2D canvas coordinates
      const x = view?._deviceToScreen.transformX(e.x);
      const y = view?._deviceToScreen.transformY(e.y);

      // Check if mouse is over the Live2D model
      (window as any).api.setIgnoreMouseEvent(!model?.anyhitTest(x, y) && !model?.isHitOnModel(x, y));
    });

    // Add pointerdown event listener
    parent?.addEventListener("pointerdown", (e) => {
      const model = LAppLive2DManager.getInstance().getModel(0);
      const view = LAppDelegate.getExistingInstance()?.getView();

      // Transform screen coordinates to Live2D canvas coordinates
      const x = view?._deviceToScreen.transformX(e.x);
      const y = view?._deviceToScreen.transformY(e.y);

      // Test hit and log result
      const hitAreaName = model?.anyhitTest(x, y);
      const isHit = hitAreaName !== null || model?.isHitOnModel(x, y);
      console.log("Model clicked:", isHit, hitAreaName ? `in area: ${hitAreaName}` : '');
    });
  }
}

/**
 * Keep the original window.load handler for backwards compatibility
 * (for the standalone HTML file)
 */
/* // Comment out the window.load listener
window.addEventListener(
  "load",
  (): void => {
    initializeLive2D();
  },
  { passive: true }
);
*/

/**
 * 終了時の処理
 * 结束时的处理
 */
window.addEventListener(
  "beforeunload",
  (): void => LAppDelegate.releaseInstance(),
  { passive: true }
);

/**
 * Process when changing screen size.
 */
window.addEventListener(
  "resize",
  () => {
    if (LAppDefine.CanvasSize === "auto") {
      LAppDelegate.getExistingInstance()?.onResize();
    }
  },
  { passive: true }
);

// Make the initialization function available globally
(window as any).initializeLive2D = initializeLive2D;
