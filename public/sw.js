/* 離線可用的 service worker。
   目的很單純：讓「查籤」在沒有網路時也打得開。籤詩資料本身已經打包進前端
   （見 src/utils/offlineFortunes.ts），但如果連 HTML 與 JS 都載不到，畫面根本
   不會出現，所以這裡把 app shell 與靜態檔案在第一次上線瀏覽時存起來。

   策略刻意分三種，不用任何套件：
   1. 導覽請求（開頁面）：先走網路，失敗就拿快取裡的 index.html 頂上——
      SPA 的路由在前端，拿到 shell 就能跑到 /lookup。
   2. 同源靜態檔（js / css / 字型 / 圖）：先給快取、背景更新（stale-while-revalidate），
      離線時直接命中，上線時會自己換新。
   3. /api 與 /admin：一律不碰。離線時就是要讓它快快失敗，
      前端才會走各自的離線備援（查籤用本地籤詩表、求籤用離線籤）。

   影片（/videos）也不進快取：檔案大、又常以 206 range 回應，存不進 Cache API，
   交給瀏覽器自己的 HTTP 快取即可。 */
const VERSION = 'v3'
const SHELL_CACHE = `temple-shell-${VERSION}`
const ASSET_CACHE = `temple-assets-${VERSION}`
const SHELL_URL = '/index.html'

/* 第一次上線瀏覽就要把該存的都存起來。
   只靠 runtime 快取的話，js/css 是在 SW 還沒接管前就載完的（註冊發生在 load 之後），
   等於第一次瀏覽什麼都沒存到，要到第二次上線才有離線能力——實測就是這樣，
   斷線重開只剩一個空殼。所以這裡在安裝階段照建置產出的資產清單一次抓齊。 */
const ASSET_MANIFEST_URL = '/asset-manifest.json'

async function precache() {
  const shell = await caches.open(SHELL_CACHE)
  await shell.addAll([SHELL_URL, '/']).catch(() => undefined)

  try {
    const response = await fetch(ASSET_MANIFEST_URL, { cache: 'no-cache' })
    if (!response.ok) return
    const manifest = await response.json()
    const files = Object.values(manifest)
      .flatMap((entry) => [entry.file, ...(entry.css || [])])
      .filter(Boolean)
      .map((file) => `/${String(file).replace(/^\/+/, '')}`)
    const assets = await caches.open(ASSET_CACHE)
    // 個別失敗（某支檔案 404）不要讓整包安裝失敗
    await Promise.allSettled(files.map((file) => assets.add(file)))
  } catch {
    // 沒有清單（舊版建置）就退回純 runtime 快取，第二次上線後照樣能離線
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('temple-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isBypassed(url) {
  return (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/videos') ||
    url.pathname === ASSET_MANIFEST_URL
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || isBypassed(url)) return

  // 1. 開頁面：先網路，離線就用快取的 shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          /* 只有成功的回應才能覆蓋 shell。
             不檢查的話，任何一次 404／500 錯誤頁都會被存成 shell，
             之後離線開站就變成把那張錯誤頁端出來（實測踩過）。 */
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy)).catch(() => undefined)
          }
          return response
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
    )
    return
  }

  // 2. 靜態檔：先快取、背景更新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          }
          return response
        })
        .catch(() => cached || Response.error())
      return cached || network
    })
  )
})
