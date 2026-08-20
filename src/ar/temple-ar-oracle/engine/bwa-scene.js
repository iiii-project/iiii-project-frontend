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

/* ---- 抓杯（hold）動畫參數 ----
   舊版 setHoldPosition 是每收到一次手勢座標就把兩顆筊杯硬設到該位置，
   所以筊杯是「瞬間出現在手上」而且跟著 MediaPipe 的抖動一起跳。
   改成：setHoldPosition 只記錄目標點，實際位移由 render loop 每格插值，
   前 GRAB_MS 毫秒播「被抓起來」的動畫（帶弧線抬起＋握緊的旋轉＋放大回饋），
   之後轉為阻尼跟隨，並依橫向速度給一點慣性傾斜。 */
const GRAB_MS = 420;          // 抓起動畫長度
const GRAB_LIFT = 0.45;       // 抓起過程中額外抬高的弧線高度（世界單位）
const GRAB_SCALE_PUNCH = 0.14; // 抓起瞬間的放大回饋比例
const GRAB_ROLL = 0.55;       // 抓起過程中兩杯向內握緊的旋轉量（弧度）
const HOLD_SPREAD = 0.4;      // 手持時兩杯的中心間距（半距）
const IDLE_SPREAD = 0.5;      // 閒置時兩杯的中心間距（半距）
const FOLLOW_EASE_A = 0.3;    // 跟手的阻尼係數；兩杯稍微不同，跟隨時會有自然的錯位晃動
const FOLLOW_EASE_B = 0.24;
const HOLD_TILT_MAX = 0.35;   // 慣性傾斜上限（弧度）

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

  /* 抓杯狀態：target 是手的世界座標（由 setHoldPosition 更新），
     curA/curB 是兩顆筊杯目前實際所在的位置（由 render loop 逐格逼近 target）。
     from* 記錄「開始被抓起」那一刻的位置與旋轉，抓起動畫就是從這裡插值到手上。 */
  const hold = {
    startTime: 0,
    target: { x: 0, y: 0 },
    curA: { x: -IDLE_SPREAD, y: 0 },
    curB: { x: IDLE_SPREAD, y: 0 },
    fromA: { x: -IDLE_SPREAD, y: 0 },
    fromB: { x: IDLE_SPREAD, y: 0 },
    fromRotA: { x: 0, y: 0, z: -Math.PI / 8 },
    fromRotB: { x: 0, y: 0, z: Math.PI / 8 },
    tiltA: 0,
    tiltB: 0,
  };

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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
    // 抓起動畫要對筊杯做放大回饋，先把「原始尺寸」記下來當基準，動畫結束再還原
    cup.userData.baseScale = cup.scale.x;
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
    if (cupA && cupB && !state.bwaTossing) {
      if (holding) {
        updateHold(now);
      } else {
        const time = now * 0.001;
        // 微弱優雅的懸浮，幅度調小
        const bob = Math.sin(time * 1.2) * 0.05;
        cupA.position.y = bob;
        cupB.position.y = bob;
        cupA.rotation.z = Math.sin(time) * 0.03 - Math.PI / 8;
        cupB.rotation.z = Math.cos(time) * 0.03 + Math.PI / 8;
      }
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

  /* 只負責把「手現在在哪」換算成世界座標記下來；真正的位移與旋轉都交給
     render loop 的 updateHold() 逐格插值，這樣筊杯是「被抓起來並跟著手」，
     而不是每次收到手勢座標就瞬移過去（也順便濾掉 MediaPipe 的座標抖動）。 */
  function setHoldPosition(nx01, ny01) {
    lastScreenPos = { x: nx01 * window.innerWidth, y: ny01 * window.innerHeight };
    if (!cupA || !cupB) return;
    const vFOV = camera.fov * Math.PI / 180;
    const dist = camera.position.z;
    const worldH = 2 * Math.tan(vFOV / 2) * dist;
    const worldW = worldH * camera.aspect;

    hold.target.x = (nx01 - 0.5) * worldW;
    hold.target.y = -(ny01 - 0.5) * worldH * 0.6;

    if (!holding) {
      // 剛被抓起：記錄兩顆筊杯此刻（閒置懸浮中）的位置與旋轉當作動畫起點
      holding = true;
      hold.startTime = performance.now();
      hold.fromA = { x: cupA.position.x, y: cupA.position.y };
      hold.fromB = { x: cupB.position.x, y: cupB.position.y };
      hold.fromRotA = { x: cupA.rotation.x, y: cupA.rotation.y, z: cupA.rotation.z };
      hold.fromRotB = { x: cupB.rotation.x, y: cupB.rotation.y, z: cupB.rotation.z };
      hold.curA = { ...hold.fromA };
      hold.curB = { ...hold.fromB };
      hold.tiltA = 0;
      hold.tiltB = 0;
    }
  }

  /* 抓杯動畫（每格呼叫一次）：
     階段一（t < 1）「被抓起來」——從閒置位置沿弧線抬起飛進手裡，
     兩杯同時向內握緊旋轉，並帶一次放大回饋，做出「抓住」的手感；
     階段二（t >= 1）「跟著手」——以阻尼逼近手的位置（兩杯係數略有差異，
     跟隨時會自然錯位晃動），並依橫向殘餘距離換算慣性傾斜。 */
  function updateHold(now) {
    const t = Math.min(1, (now - hold.startTime) / GRAB_MS);
    const e = easeOutCubic(t);
    const arc = Math.sin(t * Math.PI); // 0→1→0：抬起再落回手中的弧線

    if (t < 1) {
      // 抓起中：位置由起點插值到手上，spread 同時從閒置間距收成手持間距
      const spread = lerp(IDLE_SPREAD, HOLD_SPREAD, e);
      hold.curA.x = lerp(hold.fromA.x, hold.target.x - spread, e);
      hold.curA.y = lerp(hold.fromA.y, hold.target.y, e) + arc * GRAB_LIFT;
      hold.curB.x = lerp(hold.fromB.x, hold.target.x + spread, e);
      hold.curB.y = lerp(hold.fromB.y, hold.target.y, e) + arc * GRAB_LIFT;

      cupA.rotation.set(lerp(hold.fromRotA.x, 0.2, e), lerp(hold.fromRotA.y, 0.1, e),
                        lerp(hold.fromRotA.z, -0.05, e) - arc * GRAB_ROLL);
      cupB.rotation.set(lerp(hold.fromRotB.x, 0.2, e), lerp(hold.fromRotB.y, -0.1, e),
                        lerp(hold.fromRotB.z, 0.05, e) + arc * GRAB_ROLL);

      const punch = 1 + arc * GRAB_SCALE_PUNCH;
      cupA.scale.setScalar(cupA.userData.baseScale * punch);
      cupB.scale.setScalar(cupB.userData.baseScale * punch);
    } else {
      // 已在手上：阻尼跟隨。先取殘餘距離當作橫向速度，再更新位置
      const dxA = (hold.target.x - HOLD_SPREAD) - hold.curA.x;
      const dxB = (hold.target.x + HOLD_SPREAD) - hold.curB.x;
      hold.curA.x += dxA * FOLLOW_EASE_A;
      hold.curA.y += (hold.target.y - hold.curA.y) * FOLLOW_EASE_A;
      hold.curB.x += dxB * FOLLOW_EASE_B;
      hold.curB.y += (hold.target.y - hold.curB.y) * FOLLOW_EASE_B;

      // 慣性傾斜：手往哪個方向移動，筊杯就往反方向後仰一點
      hold.tiltA += (clamp(-dxA * 0.6, -HOLD_TILT_MAX, HOLD_TILT_MAX) - hold.tiltA) * 0.2;
      hold.tiltB += (clamp(-dxB * 0.6, -HOLD_TILT_MAX, HOLD_TILT_MAX) - hold.tiltB) * 0.2;

      // 握在手上的細微呼吸感，避免完全靜止時看起來像貼圖
      const breath = Math.sin(now * 0.0026) * 0.025;
      cupA.rotation.set(0.2, 0.1, -0.05 + hold.tiltA + breath);
      cupB.rotation.set(0.2, -0.1, 0.05 + hold.tiltB - breath);
      cupA.scale.setScalar(cupA.userData.baseScale);
      cupB.scale.setScalar(cupB.userData.baseScale);
    }

    cupA.position.set(hold.curA.x, hold.curA.y, 0);
    cupB.position.set(hold.curB.x, hold.curB.y, 0);
  }

  function resetIdle() {
    holding = false;
    state.bwaTossing = false;
    hold.tiltA = 0; hold.tiltB = 0;
    if (!cupA || !cupB) return;
    // 抓起動畫可能停在放大狀態，回到閒置一律還原成基準尺寸
    cupA.scale.setScalar(cupA.userData.baseScale);
    cupB.scale.setScalar(cupB.userData.baseScale);
    cupA.position.set(-IDLE_SPREAD, 0, 0);
    cupB.position.set(IDLE_SPREAD, 0, 0);
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
    // 擲出前先把抓起動畫的放大回饋還原，避免整段落下都維持放大狀態
    cupA.scale.setScalar(cupA.userData.baseScale);
    cupB.scale.setScalar(cupB.userData.baseScale);
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
