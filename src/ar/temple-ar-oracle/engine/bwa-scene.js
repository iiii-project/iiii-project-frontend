/* =========================================================================
   BwaScene — 以 Three.js 渲染兩顆筊杯的真實 3D 場景
   來源：temple_oracle_v17.html 1808–2116行（原始檔案裡緊接在GestureEngine
   註解標題之後，但實際內容是擲筊3D引擎，這裡維持原始程式碼不動，僅調整檔案位置）。

   擬真漆器筊杯渲染引擎，優化重點（皆為原始註解，原文照錄）：
   1. 精準貝茲曲線：模擬真實筊杯的非對稱腰豆形。
   2. 進階材質：使用 MeshPhysicalMaterial 模擬漆木質感，加入 Clearcoat (清漆層)。
   3. 動態紋理：代碼自動生成木質纖維貼圖，無需外部圖檔。

   【封裝調整說明（其餘幾何/材質/物理數值全部逐行相同）】
   1. 全域 `THREE`（原本由 CDN <script> 掛在 window 上）改為標準 `import * as THREE from 'three'`。
   2. 全域 `AppState.bwaTossing` 改為由外部注入的 `state.bwaTossing`
      （state 由 engine/state.js 的 createArState() 產生，跟 GestureEngine 共用同一份，
      語意與讀寫時機完全相同）。
   3. 原本整個模組是頁面級單例 IIFE，改成 createBwaScene(state) 工廠函式，
      每個 <temple-ar-oracle> 元件實例呼叫一次即可得到一份獨立場景；
      resize() 原本讀取全域 `els.bwaThreeContainer`，改為讀取 init() 時傳入、
      並保存在模組內部的 container 參照。
   4. 筊杯本體改為載入外部 GLTF 模型（來源：Digital-Jiaobei 專案，見檔案下方
      makeCup() 註解），取代原本用 ExtrudeGeometry + Canvas 貼圖程序化產生的
      幾何體與「凸」「平」文字標籤；擲筊物理、命中測試、鏡頭、燈光等其餘邏輯
      不變。
   ========================================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 筊杯 3D 模型來源：Digital-Jiaobei 專案的 models/jiaobeii.glb（原封不動複製到
// public/models/jiaobei.glb）。模型內含 JiaoOne / JiaoTwo 兩個節點，各自的原始
// 網格座標沿用同一套慣例：局部 +Z 是凸面、-Z 是平面，跟這個檔案既有的
// rotation.x（0=凸面朝上、π=平面朝上）判斷邏輯完全吻合，因此下面的擲筊物理、
// 命中測試等邏輯都不需要跟著調整。
const JIAO_MODEL_URL = '/models/jiaobei.glb';
let jiaoTemplatesPromise = null;

function loadJiaoTemplates() {
  if (!jiaoTemplatesPromise) {
    jiaoTemplatesPromise = new GLTFLoader().loadAsync(JIAO_MODEL_URL).then((gltf) => ({
      jiaoOne: gltf.scene.getObjectByName('JiaoOne'),
      jiaoTwo: gltf.scene.getObjectByName('JiaoTwo'),
    }));
  }
  return jiaoTemplatesPromise;
}

// 筊杯落地後的最終高度：跟鏡頭視線焦點（camera.lookAt 的 y）對齊，
// 這樣擲出的結果會停在畫面正中間，而不是偏向畫面下方。
// 地板（陰影承接面）跟著往上移，維持跟原本一樣「杯底貼地」的相對距離（0.1）。
const REST_Y = -0.2;

export function createBwaScene(state) {
  let renderer, scene, camera, cupA, cupB, ground, light;
  let holding = false;
  let destroyed = false;
  let container = null;
  let lastScreenPos = { x: window.innerWidth / 2, y: window.innerHeight * 0.55 };
  let loopRafId = null;

  // 把模型節點複製成一顆獨立的筊杯：重置成原始網格座標（見上方註解），
  // 置中並統一縮放到跟舊版程序化幾何體相近的尺寸，這樣其餘的位置／旋轉／
  // 間距數值（idle、hold、toss 裡的座標）都不必更動。
  function makeCup(template) {
    const inner = template.clone(true);
    inner.position.set(0, 0, 0);
    inner.quaternion.identity();
    inner.scale.set(1, 1, 1);
    inner.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(inner);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    inner.position.sub(center);

    inner.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const cup = new THREE.Group();
    cup.add(inner);
    // 用寬度（X 軸）決定筊杯大小：hold 手持狀態下兩顆筊杯中心距最窄只有 0.8，
    // 寬度抓 0.75 還留一點間隙，不會互相穿插。
    cup.scale.setScalar(0.75 / size.x);
    return cup;
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
    camera.lookAt(0, REST_Y, 0);

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
    ground.position.y = REST_Y - 0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    loopRafId = requestAnimationFrame(loop);

    // 模型是非同步載入，載完才生出兩顆筊杯並加進場景；在這之前場景照常
    // 渲染（燈光、地板都已就緒），下面幾個操作函式也都對 cupA/cupB 尚未
    // 就緒的情況做了保護。
    loadJiaoTemplates().then(({ jiaoOne, jiaoTwo }) => {
      if (destroyed) return;
      cupA = makeCup(jiaoOne);
      cupB = makeCup(jiaoTwo);
      resetIdle();
      scene.add(cupA);
      scene.add(cupB);
    });
  }

  function loop(now) {
    if (!renderer) return;
    if (cupA && cupB && !holding && !state.bwaTossing) {
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
    lastScreenPos = { x: nx01 * window.innerWidth, y: ny01 * window.innerHeight };
    if (!cupA || !cupB) return;
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
  }

  function resetIdle() {
    holding = false;
    state.bwaTossing = false;
    if (!cupA || !cupB) return;
    cupA.position.set(-0.5, 0, 0);
    cupB.position.set(0.5, 0, 0);
    // 預設閒置時：凸面朝上 (0,0,0)
    cupA.rotation.set(0, 0, -Math.PI / 8);
    cupB.rotation.set(0, 0, Math.PI / 8);
  }

  function toss(coinA, coinB, onImpact, onSettle) {
    if (!cupA || !cupB) {
      // 理論上不會發生：進到擲筊步驟前使用者已經走完上香／抽籤等流程，
      // 模型早已載入完畢；保留這個保險，避免極端情況下卡住流程。
      requestAnimationFrame(() => toss(coinA, coinB, onImpact, onSettle));
      return;
    }
    holding = false;
    state.bwaTossing = true;
    const restY = REST_Y;
    const gravity = 4.8;
    // 從畫面上半部開始下落，整段掉落都在鏡頭內，避免只看見最後落地的結果。
    // x 座標維持在這個起始位置不再位移：原本每格畫面還會往中間漂 0.012，
    // 但下落＋彈跳全程加總起來格數不少，兩杯會一路漂到對方原本的位置去，
    // 落地時反而擠在中間、幾乎貼在一起，兩顆筊杯的結果看不清楚。
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
    destroyed = true;
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
