/* =========================================================================
   BwaScene — 以 Three.js 渲染兩顆筊杯的真實 3D 場景
   來源：temple_oracle_v17.html 1808–2116行（原始檔案裡緊接在GestureEngine
   註解標題之後，但實際內容是擲筊3D引擎，這裡維持原始程式碼不動，僅調整檔案位置）。

   擬真漆器筊杯渲染引擎，優化重點（皆為原始註解，原文照錄）：
   1. 精準貝茲曲線：模擬真實筊杯的非對稱腰豆形。
   2. 進階材質：使用 MeshPhysicalMaterial 模擬漆木質感，加入 Clearcoat (清漆層)。
   3. 動態紋理：代碼自動生成木質纖維貼圖，無需外部圖檔。

   【封裝調整說明（僅此三處，其餘幾何/材質/物理數值全部逐行相同）】
   1. 全域 `THREE`（原本由 CDN <script> 掛在 window 上）改為標準 `import * as THREE from 'three'`。
   2. 全域 `AppState.bwaTossing` 改為由外部注入的 `state.bwaTossing`
      （state 由 engine/state.js 的 createArState() 產生，跟 GestureEngine 共用同一份，
      語意與讀寫時機完全相同）。
   3. 原本整個模組是頁面級單例 IIFE，改成 createBwaScene(state) 工廠函式，
      每個 <temple-ar-oracle> 元件實例呼叫一次即可得到一份獨立場景；
      resize() 原本讀取全域 `els.bwaThreeContainer`，改為讀取 init() 時傳入、
      並保存在模組內部的 container 參照。
   ========================================================================= */
import * as THREE from 'three';

export function createBwaScene(state) {
  let renderer, scene, camera, cupA, cupB, ground, light;
  let holding = false;
  let container = null;
  let lastScreenPos = { x: window.innerWidth / 2, y: window.innerHeight * 0.55 };
  let loopRafId = null;

  // 生成凸面（外側）的深紅漆木紋
  function createWoodTextureDomed() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#9e1b1b'; // 深硃砂紅
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(50, 0, 0, ${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 60, 1);
    }
    return new THREE.CanvasTexture(canvas);
  }

  // 生成平面（內側）的淺色木紋（模擬磨損或未上厚漆的切面，方便辨識正反）
  function createWoodTextureFlat() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c25140'; // 較淺、帶橘紅的木頭切面色
    ctx.fillRect(0, 0, 256, 256);
    // 加點年輪木紋感
    for (let i = 0; i < 15; i++) {
      ctx.strokeStyle = `rgba(90, 20, 10, 0.1)`;
      ctx.lineWidth = Math.random() * 3 + 1;
      ctx.beginPath();
      ctx.arc(128, 128, Math.random() * 150, 0, Math.PI * 2);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  }

  function buildCupGeometry() {
    const shape = new THREE.Shape();
    // 重新校正基本輪廓，稍微瘦身，避免過度肥大
    shape.moveTo(0, 1.1);
    shape.bezierCurveTo(0.7, 1.1, 0.9, 0.5, 0.9, 0);
    shape.bezierCurveTo(0.9, -0.5, 0.7, -1.1, 0, -1.1);
    shape.bezierCurveTo(-0.2, -1.1, -0.1, -0.6, -0.4, 0);
    shape.bezierCurveTo(-0.1, 0.6, -0.2, 1.1, 0, 1.1);

    const extrudeSettings = {
      depth: 0.2,            // 降低厚度，避免像大木塊
      bevelEnabled: true,
      bevelThickness: 0.15,   // 縮小倒角
      bevelSize: 0.1,
      bevelSegments: 8,
      curveSegments: 32
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();

    // 控制最終尺寸：原來的太大，這裡全面縮小 (X縮小到0.5, Y縮小到0.6, Z厚度縮小)
    geo.scale(0.5, 0.6, 0.7);
    return geo;
  }

  // 產生「凸」「平」標記貼圖：不依賴 ExtrudeGeometry 的材質分組（該分組在不同版本
  // 行為不一致，容易導致兩面看起來完全相同），改用獨立的文字貼圖平面固定貼附在
  // 局部座標的正反兩面，保證無論如何都能清楚分辨「凸面／平面」。
  function createFaceLabelTexture(char, style){
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (style === 'domed'){
      const g = ctx.createRadialGradient(100,90,10,128,128,150);
      g.addColorStop(0, '#ff9a68'); g.addColorStop(0.55, '#c53a1c'); g.addColorStop(1, '#7a1c0a');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = '#e2c88f';
    }
    ctx.beginPath(); ctx.arc(128,128,120,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = style==='domed' ? 'rgba(255,230,190,0.8)' : 'rgba(90,50,20,0.6)';
    ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = style==='domed' ? '#fff6e6' : '#5c2210';
    ctx.font = 'bold 150px "Noto Serif TC", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char, 128, 140);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function addFaceLabels(mesh){
    const domedTex = createFaceLabelTexture('凸', 'domed');
    const flatTex = createFaceLabelTexture('平', 'flat');
    const domedMat = new THREE.MeshStandardMaterial({ map: domedTex, roughness: 0.35, metalness: 0.05, transparent:true });
    const flatMat = new THREE.MeshStandardMaterial({ map: flatTex, roughness: 0.7, metalness: 0.0, transparent:true });
    const geo = new THREE.CircleGeometry(0.32, 40);
    const domedPlane = new THREE.Mesh(geo, domedMat);
    domedPlane.position.z = 0.19; // 局部 +z 面：rotation.x=0 時朝向相機 → 對應「凸面朝上」
    domedPlane.castShadow = false;
    const flatPlane = new THREE.Mesh(geo, flatMat);
    flatPlane.position.z = -0.19; // 局部 -z 面：rotation.x=π 時朝向相機 → 對應「平面朝上」
    flatPlane.rotation.y = Math.PI;
    flatPlane.castShadow = false;
    mesh.add(domedPlane);
    mesh.add(flatPlane);
  }

  function makeCup() {
    const geo = buildCupGeometry();

    // 💡 核心修正：利用多重材質群組（Groups），讓正面與反面吃不同材質！
    // 凸面（背面）：深紅清漆感
    const matDomed = new THREE.MeshPhysicalMaterial({
      map: createWoodTextureDomed(),
      color: 0xa81d1d,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });

    // 平面（正面）：淺橘紅、高粗糙度（無亮面漆），製造物理正反面反差
    const matFlat = new THREE.MeshStandardMaterial({
      map: createWoodTextureFlat(),
      color: 0xd6634f,
      roughness: 0.6, // 霧面，不反光
    });

    // Three.js Extrude 預設：index 0 是側邊與凸面，index 1 是平面的蓋子
    const mesh = new THREE.Mesh(geo, [matDomed, matFlat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addFaceLabels(mesh);
    return mesh;
  }

  function init(el) {
    container = el;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    // 💡 相機調整：拉遠距離 (7 -> 8.5)，仰角拉高，讓視角更自然、筊杯看起來變小
    camera = new THREE.PerspectiveCamera(25, w / h, 0.1, 50);
    camera.position.set(0, 2.0, 8.5);
    camera.lookAt(0, -0.2, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    light = new THREE.DirectionalLight(0xfff5ea, 1.5);
    light.position.set(3, 6, 3);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.radius = 4;
    scene.add(light);

    // 補光
    const fillLight = new THREE.DirectionalLight(0x8899bb, 0.4);
    fillLight.position.set(-3, 2, 1);
    scene.add(fillLight);

    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    ground.receiveShadow = true;
    scene.add(ground);

    cupA = makeCup();
    cupB = makeCup();

    resetIdle();
    scene.add(cupA);
    scene.add(cupB);

    loopRafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!renderer) return;
    if (!holding && !state.bwaTossing) {
      const time = now * 0.001;
      // 微弱優雅的懸浮，幅度調小
      const bob = Math.sin(time * 1.2) * 0.05;
      cupA.position.y = bob;
      cupB.position.y = bob;
      cupA.rotation.z = Math.sin(time) * 0.03 - Math.PI / 8;
      cupB.rotation.z = Math.cos(time) * 0.03 + Math.PI / 8;
    }
    renderer.render(scene, camera);
    loopRafId = requestAnimationFrame(loop);
  }

  function resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function setHoldPosition(nx01, ny01) {
    holding = true;
    const vFOV = camera.fov * Math.PI / 180;
    const dist = camera.position.z;
    const worldH = 2 * Math.tan(vFOV / 2) * dist;
    const worldW = worldH * camera.aspect;

    const targetX = (nx01 - 0.5) * worldW;
    const targetY = -(ny01 - 0.5) * worldH * 0.6;

    // 手持時的間距縮小
    cupA.position.set(targetX - 0.4, targetY, 0);
    cupB.position.set(targetX + 0.4, targetY, 0);
    cupA.rotation.set(0.2, 0.1, -0.05);
    cupB.rotation.set(0.2, -0.1, 0.05);

    lastScreenPos = { x: nx01 * window.innerWidth, y: ny01 * window.innerHeight };
  }

  function resetIdle() {
    holding = false;
    state.bwaTossing = false;
    cupA.position.set(-0.5, 0, 0);
    cupB.position.set(0.5, 0, 0);
    // 預設閒置時：凸面朝上 (0,0,0)
    cupA.rotation.set(0, 0, -Math.PI / 8);
    cupB.rotation.set(0, 0, Math.PI / 8);
  }

  function toss(coinA, coinB, onImpact, onSettle) {
    holding = false;
    state.bwaTossing = true;
    const restY = -1.1;
    const gravity = 4.8;
    // 從畫面上半部開始下落，整段掉落都在鏡頭內，避免只看見最後落地的結果。
    cupA.position.set(-0.78, 1.55, 0.15);
    cupB.position.set(0.78, 1.85, 0.1);
    cupA.rotation.set(-0.7, 0.35, -0.4);
    cupB.rotation.set(0.55, -0.3, 0.45);
    let vyA = -0.08, vyB = 0.04;
    let doneA = false, doneB = false;
    let bouncesA = 0, bouncesB = 0;

    function step(now) {
      const dt = 0.016;

      if (!doneA) {
        vyA -= gravity * dt;
        cupA.position.y += vyA * dt;
        cupA.position.x += 0.012;
        cupA.rotation.x += 0.16;
        cupA.rotation.y += 0.09;
        if (cupA.position.y <= restY) {
          cupA.position.y = restY;
          if (bouncesA < 1) {
            bouncesA++;
            vyA = 1.35;
            cupA.rotation.x += Math.PI * 0.42;
            onImpact && onImpact();
            requestAnimationFrame(step);
            return;
          }
          // coinA === 'domed' (凸面朝上) -> rotation.x = 0
          // flat (平面朝上) -> rotation.x = Math.PI (翻轉180度)
          cupA.rotation.set(coinA === 'domed' ? 0 : Math.PI, 0, 0);
          doneA = true;
          onImpact && onImpact();
        }
      }
      if (!doneB) {
        vyB -= gravity * dt;
        cupB.position.y += vyB * dt;
        cupB.position.x -= 0.012;
        cupB.rotation.x += 0.14;
        cupB.rotation.z += 0.12;
        if (cupB.position.y <= restY) {
          cupB.position.y = restY;
          if (bouncesB < 1) {
            bouncesB++;
            vyB = 1.15;
            cupB.rotation.x += Math.PI * 0.36;
            requestAnimationFrame(step);
            return;
          }
          cupB.rotation.set(coinB === 'domed' ? 0 : Math.PI, 0, 0);
          doneB = true;
        }
      }

      if (doneA && doneB) {
        onSettle && onSettle();
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // 新增：釋放資源用（原始版本活在單頁iframe裡，卸載時瀏覽器整包回收記憶體；
  // 元件化之後需要能主動釋放WebGL context跟事件監聽，避免切走畫面後仍佔用GPU資源）
  function destroy(){
    window.removeEventListener('resize', resize);
    if (loopRafId) cancelAnimationFrame(loopRafId);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
  }

  /* 點擊命中測試：把畫面座標轉成 NDC 後對兩只筊杯發射線。
     手指比滑鼠粗，所以除了正中心，還在 ±22px 內取樣幾個點，
     擦邊也算命中，不然手機上很難點得準。 */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function hitTest(clientX, clientY) {
    if (!renderer || !camera || !cupA || !cupB) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const targets = [cupA, cupB];
    const offsets = [[0, 0], [-22, 0], [22, 0], [0, -22], [0, 22]];
    for (const [dx, dy] of offsets) {
      pointer.x = ((clientX + dx - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY + dy - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.intersectObjects(targets, true).length > 0) return true;
    }
    return false;
  }

  return {
    init, setHoldPosition, resetIdle, getScreenPos: () => lastScreenPos, toss, destroy, hitTest,
    // 過場影片播放期間暫停 three.js 迴圈
    pause(){ if (loopRafId) { cancelAnimationFrame(loopRafId); loopRafId = 0; } },
    resume(){ if (!loopRafId && renderer) loopRafId = requestAnimationFrame(loop); },
  };
}
