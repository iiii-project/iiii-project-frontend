/* =========================================================================
   GestureEngine — 相機／人像去背畫面繪製
   MediaPipe Hands 手勢判定已移除（JJ5 上太卡）。動作觸發改由
   presence-detector.js 讀去背遮罩判斷，這裡只負責把去背人物畫到
   #output_canvas，並提供各階段的畫面重置。
   ========================================================================= */
 import { getPerformanceProfile } from '@/utils/performance';

export function createGestureEngine({ els, state, config: CONFIG }) {
  const outCtx = els.outputCanvas.getContext('2d');
  const profile = getPerformanceProfile();
  let personLayerCanvas = null;
  let personLayerCtx = null;

  /* 畫布的後備緩衝區跟著實際顯示尺寸走；只在尺寸真的變了才重設，
     因為指定 width/height 會清空畫布內容。AR 座標系以整個瀏覽器視窗為基準。 */
  function syncCanvasSize(){
    const canvas = els.outputCanvas;
    const scale = profile.canvasPixelRatio * profile.arCanvasScale;
    const w = Math.round(window.innerWidth * scale);
    const h = Math.round(window.innerHeight * scale);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h){
      canvas.width = w;
      canvas.height = h;
    }
  }

  function imageSize(image, fallbackWidth, fallbackHeight){
    return {
      width: image?.videoWidth || image?.naturalWidth || image?.width || fallbackWidth,
      height: image?.videoHeight || image?.naturalHeight || image?.height || fallbackHeight,
    };
  }

  /* 人物顯示框：整張鏡頭畫面 contain 進 CONFIG.PERSON_BOX（畫面下方、神明下面），
     保持原比例、不裁切；水平置中、底部貼齊框底。 */
  function personFrame(width, height, source){
    const box = CONFIG.PERSON_BOX;
    const boxX = box.left * width;
    const boxW = (box.right - box.left) * width;
    const boxH = (box.bottom - box.top) * height;
    const scale = Math.min(boxW / source.width, boxH / source.height);
    const personWidth = source.width * scale;
    const personHeight = source.height * scale;
    return {
      x: boxX + (boxW - personWidth) / 2,
      y: box.bottom * height - personHeight,
      width: personWidth,
      height: personHeight,
    };
  }

  function ensurePersonLayer(width, height){
    if (!personLayerCanvas){
      personLayerCanvas = document.createElement('canvas');
      personLayerCtx = personLayerCanvas.getContext('2d');
    }
    if (personLayerCanvas.width !== width || personLayerCanvas.height !== height){
      personLayerCanvas.width = width;
      personLayerCanvas.height = height;
    }
    return personLayerCtx;
  }

  /* 鏡像繪製：呼叫端看到的是自拍鏡像，所以 destination x 從右側起算。 */
  function drawMirrored(image, frame){
    outCtx.save();
    outCtx.scale(-1, 1);
    outCtx.drawImage(image, -(frame.x + frame.width), frame.y, frame.width, frame.height);
    outCtx.restore();
  }

  function onResults(results){
    // 過場影片播放中：整格跳過，把資源讓給影片解碼
    if (state.transitionActive) return;
    syncCanvasSize();
    const cw = els.outputCanvas.width, ch = els.outputCanvas.height;
    const image = results.image;
    const source = imageSize(image, cw, ch);
    outCtx.clearRect(0, 0, cw, ch);

    if (state.segmentationMask) {
      /* 去背在鏡頭原生解析度（JJ5 約 240×320）完成，再一次縮放貼到人物框。
         以前是先放大到整張畫布再合成，像素量多了好幾倍；結果畫面相同。 */
      const layerCtx = ensurePersonLayer(source.width, source.height);
      layerCtx.globalCompositeOperation = 'copy';
      layerCtx.drawImage(image, 0, 0, source.width, source.height);
      layerCtx.globalCompositeOperation = 'destination-in';
      layerCtx.drawImage(state.segmentationMask, 0, 0, source.width, source.height);
      layerCtx.globalCompositeOperation = 'source-over';
      drawMirrored(personLayerCanvas, personFrame(cw, ch, source));
    } else if (state.useSelfieSegmentation === false) {
      // 停用去背時直接鏡像畫出完整鏡頭畫面。
      drawMirrored(image, personFrame(cw, ch, source));
    }
    // 去背遮罩尚未準備好時不畫原始畫面，避免先閃出全身再突然切成摳像。
  }

  function resetIncenseProgress(){
    els.incenseAnchor.style.left = '50%';
    els.incenseAnchor.style.top = '62%';
    els.incenseAnchor.style.transform = 'translate3d(-50%,-50%,0)';
    els.incenseRing.classList.remove('on'); els.incenseRing.style.setProperty('--p',0);
    els.incenseHint.classList.remove('sensing'); els.incenseStick.classList.remove('sensing');
  }

  function resetShakeProgress(){
    els.qianTongZone.classList.remove('shaking'); els.sticksGroup.classList.remove('is-shaking'); els.shakeRing.classList.remove('on');
    els.shakeRing.style.setProperty('--p', 0);
  }

  function resetDrawReveal(){
    els.qianStick.classList.add('hidden');
    els.qianStick.classList.remove('auto-draw', 'punch');
    els.qianStick.style.transform = 'translate(-50%, 0)';
  }

  function destroy(){
    personLayerCanvas = null;
    personLayerCtx = null;
  }

  return { onResults, syncCanvasSize, resetDrawReveal, resetShakeProgress, resetIncenseProgress, destroy };
}
