<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { templeLocations, type TempleLocation } from '@/data/temples'

const canvas = ref<HTMLCanvasElement>()
const selectedTemple = ref<TempleLocation>(templeLocations[0])
const isDragging = ref(false)
let disposeScene: (() => void) | undefined

function selectTemple(temple: TempleLocation) {
  selectedTemple.value = temple
}

onMounted(() => {
  if (!canvas.value) return

  const renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  camera.position.set(0, 7.6, 12.5)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.HemisphereLight(0xfff7e8, 0x5f3c28, 2.5))
  const sun = new THREE.DirectionalLight(0xffd98b, 3.2)
  sun.position.set(-4, 9, 6)
  scene.add(sun)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7.6, 96),
    new THREE.MeshStandardMaterial({ color: 0xf4ead7, roughness: 0.9, metalness: 0 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.42
  scene.add(floor)

  const taiwanOutline = [
    [-0.7, 4.55], [-1.28, 3.9], [-1.38, 3.18], [-1.13, 2.47], [-1.45, 1.6], [-1.22, 0.72],
    [-1.12, -0.2], [-0.86, -1.15], [-0.63, -2.2], [-0.35, -3.28], [0.02, -4.2], [0.34, -4.52],
    [0.63, -4.18], [0.76, -3.52], [0.92, -2.88], [1.16, -2.05], [1.28, -1.05], [1.48, -0.05],
    [1.32, 0.95], [1.6, 1.77], [1.39, 2.65], [1.0, 3.38], [0.55, 4.1], [-0.05, 4.55]
  ]
  const shape = new THREE.Shape()
  taiwanOutline.forEach(([x, z], index) => index === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z))
  shape.closePath()
  const island = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.07, bevelThickness: 0.08 }),
    new THREE.MeshStandardMaterial({ color: 0xe0b749, roughness: 0.66, metalness: 0.14 })
  )
  island.rotation.x = -Math.PI / 2
  island.position.y = -0.1
  scene.add(island)

  const islandEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(island.geometry),
    new THREE.LineBasicMaterial({ color: 0x8e2f31, transparent: true, opacity: 0.7 })
  )
  islandEdge.rotation.copy(island.rotation)
  islandEdge.position.copy(island.position)
  scene.add(islandEdge)

  const markerGroup = new THREE.Group()
  scene.add(markerGroup)
  const pinMaterial = new THREE.MeshStandardMaterial({ color: 0x9f3434, emissive: 0x3f0909, emissiveIntensity: 0.28, roughness: 0.45 })
  const pinGlow = new THREE.MeshStandardMaterial({ color: 0xffe4a1, emissive: 0xe3a423, emissiveIntensity: 1.2 })

  function project(temple: TempleLocation) {
    const x = (temple.longitude - 120.85) * 1.22
    const z = (temple.latitude - 23.98) * 2.32
    return new THREE.Vector3(x, 0.17, z)
  }

  templeLocations.forEach((temple) => {
    const point = project(temple)
    const marker = new THREE.Group()
    marker.position.copy(point)
    marker.userData.temple = temple
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.42, 10), pinMaterial)
    stem.position.y = 0.21
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 16), pinGlow)
    cap.position.y = 0.47
    marker.add(stem, cap)
    markerGroup.add(marker)
  })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let yaw = -0.28
  let pitch = 0.53
  let radius = 13.5
  let lastX = 0
  let lastY = 0
  let dragged = false

  function updateCamera() {
    camera.position.set(
      radius * Math.cos(pitch) * Math.sin(yaw),
      radius * Math.sin(pitch),
      radius * Math.cos(pitch) * Math.cos(yaw)
    )
    camera.lookAt(0, 0, 0)
  }

  function resize() {
    const rect = canvas.value!.getBoundingClientRect()
    renderer.setSize(rect.width, rect.height, false)
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
  }

  function pointerPosition(event: PointerEvent) {
    const rect = canvas.value!.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  function onPointerDown(event: PointerEvent) {
    isDragging.value = true
    dragged = false
    lastX = event.clientX
    lastY = event.clientY
    canvas.value!.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging.value) return
    const dx = event.clientX - lastX
    const dy = event.clientY - lastY
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true
    yaw -= dx * 0.012
    pitch = Math.max(0.25, Math.min(1.18, pitch + dy * 0.01))
    lastX = event.clientX
    lastY = event.clientY
    updateCamera()
  }

  function onPointerUp(event: PointerEvent) {
    isDragging.value = false
    if (!dragged) {
      pointerPosition(event)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(markerGroup.children, true)[0]
      const marker = hit?.object.parent
      if (marker?.userData.temple) selectTemple(marker.userData.temple as TempleLocation)
    }
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    radius = Math.max(9, Math.min(18, radius + event.deltaY * 0.012))
    updateCamera()
  }

  canvas.value.addEventListener('pointerdown', onPointerDown)
  canvas.value.addEventListener('pointermove', onPointerMove)
  canvas.value.addEventListener('pointerup', onPointerUp)
  canvas.value.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('resize', resize)
  resize()
  updateCamera()

  let animationFrame = 0
  const clock = new THREE.Clock()
  function animate() {
    animationFrame = requestAnimationFrame(animate)
    const time = clock.getElapsedTime()
    markerGroup.children.forEach((marker, index) => {
      marker.children[1].position.y = 0.47 + Math.sin(time * 1.8 + index * 0.8) * 0.035
    })
    renderer.render(scene, camera)
  }
  animate()

  disposeScene = () => {
    cancelAnimationFrame(animationFrame)
    window.removeEventListener('resize', resize)
    canvas.value?.removeEventListener('pointerdown', onPointerDown)
    canvas.value?.removeEventListener('pointermove', onPointerMove)
    canvas.value?.removeEventListener('pointerup', onPointerUp)
    canvas.value?.removeEventListener('wheel', onWheel)
    renderer.dispose()
  }
})

onBeforeUnmount(() => disposeScene?.())
</script>

<template>
  <div class="map-page">
    <header class="map-header">
      <RouterLink class="map-brand" to="/">籤好運 <span>TAIWAN TEMPLE ONLINE</span></RouterLink>
      <nav aria-label="主要導覽">
        <RouterLink to="/">首頁</RouterLink>
        <RouterLink to="/donation">功德捐款</RouterLink>
      </nav>
    </header>

    <main class="map-content">
      <section class="map-intro">
        <p class="eyebrow">TEMPLE ATLAS</p>
        <h1>台灣廟宇地圖</h1>
        <p>旋轉地圖、點選金色標記，探索各地已立案寺廟的分布。</p>
      </section>

      <section class="map-stage" :class="{ 'is-dragging': isDragging }">
        <canvas ref="canvas" aria-label="可互動 3D 台灣廟宇地圖"></canvas>
        <div class="map-hint">拖曳旋轉 · 滾動縮放 · 點選標記</div>
        <aside class="temple-card">
          <p class="eyebrow">{{ selectedTemple.city }}</p>
          <h2>{{ selectedTemple.name }}</h2>
          <dl>
            <div><dt>主祀</dt><dd>{{ selectedTemple.deity }}</dd></div>
            <div><dt>位置</dt><dd>{{ selectedTemple.address }}</dd></div>
          </dl>
        </aside>
      </section>

      <footer>
        點位資料取自 <a href="https://github.com/cclljj/TW_Temple" target="_blank" rel="noreferrer">cclljj/TW_Temple</a>（MIT License），
        原始資料為全國已立案寺廟開放資料；目前地圖展示各縣市代表點位。
      </footer>
    </main>
  </div>
</template>

<style scoped>
.map-page { min-height: 100vh; color: #3a2c22; background: #fbf9f5; }
.map-header { height: 78px; display: flex; align-items: center; justify-content: space-between; padding: 0 clamp(22px, 5vw, 72px); border-bottom: 1px solid rgba(212, 175, 55, .4); background: rgba(251,249,245,.92); }
.map-brand { color: #3a2c22; font-size: 20px; font-weight: 700; letter-spacing: .16em; }
.map-brand span { display: block; margin-top: 3px; color: #9c8b76; font-size: 9px; font-weight: 500; letter-spacing: .26em; }
nav { display: flex; gap: 28px; font-size: 14px; color: #6f5d4c; }
nav a.router-link-active { color: #a63a3a; }
.map-content { width: min(1240px, calc(100% - 40px)); margin: 0 auto; padding: 56px 0 26px; }
.map-intro { max-width: 530px; }
.eyebrow { margin: 0 0 11px; color: #a63a3a; font-size: 11px; font-weight: 600; letter-spacing: .3em; }
h1 { margin: 0; font-size: clamp(34px, 5vw, 58px); font-weight: 600; letter-spacing: .08em; }
.map-intro > p:last-child { color: #6f5d4c; line-height: 1.9; }
.map-stage { position: relative; height: min(66vh, 710px); min-height: 510px; margin-top: 26px; overflow: hidden; border: 1px solid rgba(212,175,55,.52); border-radius: 8px; background: radial-gradient(circle at 49% 42%, #fffdf8 0, #f3e7cf 75%); box-shadow: 0 28px 65px rgba(74,50,25,.17); }
.map-stage canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
.map-stage.is-dragging canvas { cursor: grabbing; }
.map-hint { position: absolute; top: 22px; left: 24px; color: #8a7056; font-size: 12px; letter-spacing: .08em; }
.temple-card { position: absolute; right: 24px; bottom: 24px; width: min(290px, calc(100% - 48px)); padding: 22px; border: 1px solid rgba(212,175,55,.5); border-radius: 6px; background: rgba(255,253,248,.92); box-shadow: 0 12px 28px rgba(74,50,25,.12); backdrop-filter: blur(10px); }
.temple-card h2 { margin: 0 0 15px; color: #7a2626; font-size: 23px; font-weight: 600; }
dl { margin: 0; display: grid; gap: 8px; }
dl div { display: grid; grid-template-columns: 44px 1fr; gap: 8px; color: #6f5d4c; font-size: 13px; line-height: 1.55; }
dt { color: #9c8b76; } dd { margin: 0; }
footer { margin: 20px 0 0; color: #8a7056; font-size: 12px; line-height: 1.7; } footer a { color: #a63a3a; text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 620px) { .map-header { height: 70px; } nav { gap: 15px; font-size: 13px; } .map-content { width: min(100% - 24px, 1240px); padding-top: 34px; } .map-stage { min-height: 560px; } .map-hint { top: auto; bottom: 18px; left: 18px; } .temple-card { right: 12px; bottom: 48px; width: calc(100% - 24px); } }
</style>
