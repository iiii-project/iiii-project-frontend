<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import type { BlockCast } from '@/types/divination'

// ⚠️ Props 介面與原本的 BlockCups.vue 完全相同，外部（BlocksView.vue）不需要任何修改。
// 這個元件只負責「演出」cast 這個 prop 裡已經由後端決定好的結果，絕不自己產生結果。
const props = defineProps<{ cast?: BlockCast | null; casting: boolean }>()

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let cupA: THREE.Mesh | null = null
let cupB: THREE.Mesh | null = null
let rafId = 0
let resizeObserver: ResizeObserver | null = null
let animating = false

function buildCupGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 1.1)
  shape.bezierCurveTo(0.7, 1.1, 0.9, 0.5, 0.9, 0)
  shape.bezierCurveTo(0.9, -0.5, 0.7, -1.1, 0, -1.1)
  shape.bezierCurveTo(-0.2, -1.1, -0.1, -0.6, -0.4, 0)
  shape.bezierCurveTo(-0.1, 0.6, -0.2, 1.1, 0, 1.1)

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.1,
    bevelSegments: 8,
    curveSegments: 32
  })
  geo.center()
  geo.scale(0.5, 0.6, 0.7)
  return geo
}

// 「凸」「平」文字標記：直接貼在局部座標的正反兩面，
// 不依賴 ExtrudeGeometry 的材質分組（不同版本行為不一致），保證兩面一定能明確區分。
function createFaceLabelTexture(char: string, style: 'round' | 'flat') {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  if (style === 'round') {
    const g = ctx.createRadialGradient(100, 90, 10, 128, 128, 150)
    g.addColorStop(0, '#ff9a68')
    g.addColorStop(0.55, '#c53a1c')
    g.addColorStop(1, '#7a1c0a')
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = '#e2c88f'
  }
  ctx.beginPath()
  ctx.arc(128, 128, 120, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = style === 'round' ? 'rgba(255,230,190,0.8)' : 'rgba(90,50,20,0.6)'
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.fillStyle = style === 'round' ? '#fff6e6' : '#5c2210'
  ctx.font = 'bold 150px "Noto Serif TC", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(char, 128, 140)
  return new THREE.CanvasTexture(canvas)
}

function addFaceLabels(mesh: THREE.Mesh) {
  const roundMat = new THREE.MeshStandardMaterial({
    map: createFaceLabelTexture('凸', 'round'),
    roughness: 0.35,
    metalness: 0.05,
    transparent: true
  })
  const flatMat = new THREE.MeshStandardMaterial({
    map: createFaceLabelTexture('平', 'flat'),
    roughness: 0.7,
    metalness: 0,
    transparent: true
  })
  const geo = new THREE.CircleGeometry(0.32, 40)

  const roundPlane = new THREE.Mesh(geo, roundMat)
  roundPlane.position.z = 0.19 // 局部 +z：rotation.x = 0 時朝向相機 → 對應「凸面朝上」
  mesh.add(roundPlane)

  const flatPlane = new THREE.Mesh(geo, flatMat)
  flatPlane.position.z = -0.19 // 局部 -z：rotation.x = π 時朝向相機 → 對應「平面朝上」
  flatPlane.rotation.y = Math.PI
  mesh.add(flatPlane)
}

function makeCup() {
  const geo = buildCupGeometry()
  const mat = new THREE.MeshStandardMaterial({ color: 0xa81d1d, roughness: 0.4, metalness: 0.05 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  addFaceLabels(mesh)
  return mesh
}

function initScene() {
  const container = containerRef.value
  if (!container) return
  const w = container.clientWidth || 280
  const h = container.clientHeight || 220

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 50)
  camera.position.set(0, 1.4, 6.4)
  camera.lookAt(0, -0.1, 0)

  scene.add(new THREE.AmbientLight(0xfff3e0, 0.6))
  const light = new THREE.DirectionalLight(0xfff2d8, 1.3)
  light.position.set(2, 3.5, 3)
  light.castShadow = true
  light.shadow.mapSize.set(512, 512)
  light.shadow.radius = 4
  scene.add(light)
  scene.add(new THREE.DirectionalLight(0x8899bb, 0.3))

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.35 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -1.0
  ground.receiveShadow = true
  scene.add(ground)

  cupA = makeCup()
  cupB = makeCup()
  cupA.position.set(-0.62, 0, 0)
  cupB.position.set(0.62, 0, 0)
  scene.add(cupA)
  scene.add(cupB)

  resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(container)

  loop()
}

function resize() {
  const container = containerRef.value
  if (!renderer || !camera || !container) return
  const w = container.clientWidth || 280
  const h = container.clientHeight || 220
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function loop() {
  rafId = requestAnimationFrame(loop)
  if (!renderer || !scene || !camera || !cupA || !cupB) return
  if (!animating) {
    const t = performance.now() * 0.001
    if (props.casting) {
      // 擲筊進行中：捧在手中般的輕微浮動與搖晃，結果尚未揭曉
      cupA.position.y = Math.sin(t * 3) * 0.08
      cupB.position.y = Math.sin(t * 3 + 0.5) * 0.08
      cupA.rotation.z = Math.sin(t * 2) * 0.15
      cupB.rotation.z = Math.cos(t * 2) * 0.15
    } else {
      // 閒置：安靜擺放，優雅的極輕微懸浮
      cupA.position.y = Math.sin(t * 1.2) * 0.04
      cupB.position.y = Math.sin(t * 1.2 + 0.6) * 0.04
    }
  }
  renderer.render(scene, camera)
}

// ============================================================
// 播放「後端已決定結果」的落地動畫：完全依 cast.block_one / cast.block_two
// 決定每顆筊杯最終停在哪一面，動畫只負責演出，不影響、也不能覆寫這個結果。
// ============================================================
function playCastAnimation(cast: BlockCast) {
  if (!cupA || !cupB) return
  animating = true

  const restY = -0.55
  const gravity = 12
  let vyA = 3.2
  let vyB = 3.5
  let doneA = false
  let doneB = false

  const finalRotA = cast.block_one === 'round' ? 0 : Math.PI
  const finalRotB = cast.block_two === 'round' ? 0 : Math.PI

  function step() {
    const dt = 0.016
    if (!doneA) {
      vyA -= gravity * dt
      cupA!.position.y += vyA * dt
      cupA!.rotation.x += 0.3
      cupA!.rotation.y += 0.15
      if (cupA!.position.y <= restY) {
        cupA!.position.y = restY
        cupA!.rotation.set(finalRotA, 0, 0)
        doneA = true
      }
    }
    if (!doneB) {
      vyB -= gravity * dt
      cupB!.position.y += vyB * dt
      cupB!.rotation.x += 0.26
      cupB!.rotation.z += 0.2
      if (cupB!.position.y <= restY) {
        cupB!.position.y = restY
        cupB!.rotation.set(finalRotB, 0, 0)
        doneB = true
      }
    }
    if (doneA && doneB) {
      animating = false
      return
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

watch(
  () => props.cast,
  (cast) => {
    if (cast) playCastAnimation(cast)
  }
)

onMounted(initScene)

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  scene = null
  camera = null
  cupA = null
  cupB = null
  renderer = null
})
</script>

<template>
  <div ref="containerRef" class="blocks-scene-3d" aria-label="擲筊結果"></div>
</template>

<style scoped>
.blocks-scene-3d {
  width: 280px;
  height: 220px;
  margin: 0 auto;
}
.blocks-scene-3d :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
