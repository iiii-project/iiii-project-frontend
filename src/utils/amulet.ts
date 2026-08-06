/* 數位平安符。
   舊版（temple_oracle_v17.html 的 generateAmulet）在抽完籤之後可以生成一張
   600×900 的平安符 PNG 下載帶走，元件化時沒有搬過來，這裡把它接回來。
   繪圖元素沿用舊版那一套台灣廟宇語彙：燕尾脊剪影、雲紋邊框、八卦圖騰、硃砂印章。

   跟舊版最大的差別是「每一支籤的符長得不一樣」的程度：
   舊版只依吉凶分三種配色，同一個吉凶等級的 20 幾支籤會長得幾乎一樣。
   這裡在吉凶主色之外，另外用籤號當種子（seedFrom）決定色相偏移、雲紋的角度與
   大小、八卦的轉向、印文選字與做舊缺口的位置——同一支籤永遠畫出同一張符
   （這是他的符，不能每次按都不同），不同籤則明顯不同。 */
import { splitPoem } from './poem'
import { formatRocDate } from './roc'

export interface AmuletData {
  /** 籤號 */
  number: number | string
  ganzhi?: string | null
  /** 吉凶（上籤／中平／下下…） */
  level?: string | null
  poem?: string | null
  /** 符面下半的白話小語（白話翻譯或現代解說皆可） */
  note?: string | null
  /** 祈福日期，預設今天 */
  date?: Date
}

const WIDTH = 600
const HEIGHT = 900

type Tier = 'auspicious' | 'neutral' | 'caution'

/* 吉凶分級與 AR 引擎的 gradeTier 同一套判斷（上→吉、下→警、其餘→平） */
function tierOf(level?: string | null): Tier {
  const text = level ?? ''
  if (text.includes('上')) return 'auspicious'
  if (text.includes('下')) return 'caution'
  return 'neutral'
}

interface Theme {
  top: string
  bottom: string
  gold: string
  cloudOpacity: number
  seals: string[]
}

const THEMES: Record<Tier, Theme> = {
  auspicious: {
    top: '#5c1a1a',
    bottom: '#1c1210',
    gold: 'rgba(255,221,140,0.95)',
    cloudOpacity: 0.55,
    seals: ['鎮宅光明', '福祿雙全', '諸事大吉']
  },
  neutral: {
    top: '#3a1216',
    bottom: '#14100e',
    gold: 'rgba(212,175,55,0.85)',
    cloudOpacity: 0.4,
    seals: ['平安如意', '守心得安', '順時而行']
  },
  caution: {
    top: '#241412',
    bottom: '#0e0b0a',
    gold: 'rgba(180,160,120,0.55)',
    cloudOpacity: 0.25,
    seals: ['趨吉避凶', '謹言慎行', '守正待時']
  }
}

/* 用籤號當種子的小型偽隨機。
   要的是「同一支籤每次都畫出同一張符」，所以不能用 Math.random（舊版的做舊
   缺口就是用它，同一支籤每次都不一樣）。 */
function seedFrom(number: number | string): () => number {
  let seed = 0
  for (const ch of String(number)) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647
  seed = seed || 1
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

// ── 廟宇語彙的幾個裝飾（都沿用舊版的路徑數值）──

function drawCloudMotif(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  opacity: number,
  color: string
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = color
  ctx.globalAlpha = opacity
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-40, 10)
  ctx.bezierCurveTo(-44, -4, -30, -14, -18, -10)
  ctx.bezierCurveTo(-14, -22, 4, -24, 12, -14)
  ctx.bezierCurveTo(26, -18, 40, -8, 34, 4)
  ctx.bezierCurveTo(40, 12, 32, 22, 20, 18)
  ctx.bezierCurveTo(16, 26, 2, 28, -4, 20)
  ctx.bezierCurveTo(-14, 26, -30, 20, -26, 10)
  ctx.bezierCurveTo(-32, 12, -38, 8, -40, 10)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

/** 燕尾脊剪影：台灣廟宇屋脊兩端向上翹起的曲線 */
function drawSwallowtailRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  width: number,
  color: string,
  opacity: number
) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.globalAlpha = opacity
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - width / 2 - 26, y - 46)
  ctx.quadraticCurveTo(cx - width / 2, y + 6, cx - width / 2 + 30, y)
  ctx.quadraticCurveTo(cx - width / 4, y - 16, cx, y - 8)
  ctx.quadraticCurveTo(cx + width / 4, y - 16, cx + width / 2 - 30, y)
  ctx.quadraticCurveTo(cx + width / 2, y + 6, cx + width / 2 + 26, y - 46)
  ctx.stroke()
  // 兩端翹起的燕尾尖端小點綴
  ;[cx - width / 2 - 26, cx + width / 2 + 26].forEach((px) => {
    ctx.beginPath()
    ctx.arc(px, y - 46, 3.5, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
}

/** 八卦圖騰：外八卦框 + 中央太極（示意性圖案，非嚴謹卦位排序） */
function drawBagua(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  opacity: number,
  rotation: number
) {
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + rotation
    const bx = cx + Math.cos(ang) * r
    const by = cy + Math.sin(ang) * r
    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate(ang + Math.PI / 2)
    const broken = i % 2 === 0
    for (let line = 0; line < 3; line++) {
      const yy = -9 + line * 9
      if (broken) {
        ctx.beginPath()
        ctx.moveTo(-9, yy)
        ctx.lineTo(-2, yy)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(2, yy)
        ctx.lineTo(9, yy)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(-9, yy)
        ctx.lineTo(9, yy)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  // 中央太極
  const tr = r * 0.42
  ctx.beginPath()
  ctx.arc(cx, cy, tr, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, tr, Math.PI / 2, Math.PI * 1.5)
  ctx.fillStyle = color
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy - tr / 2, tr / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy + tr / 2, tr / 2, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.restore()
}

/** 硃砂印章：帶做舊缺口的紅色方印，印文四字 */
function drawSeal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  text: string,
  rand: () => number
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.08 + (rand() - 0.5) * 0.1)
  ctx.strokeStyle = 'rgba(196,42,30,0.88)'
  ctx.lineWidth = 4
  const half = size / 2
  ctx.strokeRect(-half, -half, size, size)
  // 做舊邊緣：缺口位置由籤號決定，同一支籤永遠一樣
  for (let i = 0; i < 14; i++) {
    ctx.clearRect(-half + rand() * size, -half + rand() * size, 2 + rand() * 3, 2 + rand() * 3)
  }
  ctx.fillStyle = '#fdf3e2'
  ctx.font = `bold ${size * 0.32}px "Noto Serif TC", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const positions: [number, number][] = [
    [-half * 0.42, -half * 0.42],
    [half * 0.42, -half * 0.42],
    [-half * 0.42, half * 0.42],
    [half * 0.42, half * 0.42]
  ]
  Array.from(text).forEach((ch, i) => {
    const [px, py] = positions[i] ?? [0, 0]
    ctx.fillText(ch, px, py)
  })
  ctx.restore()
}

/** 逐字斷行（中文沒有空白可斷，只能量寬度） */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4
): number {
  let line = ''
  let cy = y
  let used = 1
  for (const ch of text) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      if (used >= maxLines) {
        ctx.fillText(`${line.slice(0, -1)}…`, x, cy)
        return cy
      }
      ctx.fillText(line, x, cy)
      line = ch
      cy += lineHeight
      used += 1
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, cy)
  return cy
}

// 品牌 logo（畫在符頂）。載入是非同步的，沒載到就用燕尾脊備援。
const logoUrl = new URL('../assets/images/logo.png', import.meta.url).href
let logoImage: HTMLImageElement | null = null
let logoPromise: Promise<HTMLImageElement | null> | null = null

function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoImage) return Promise.resolve(logoImage)
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const image = new Image()
      image.onload = () => {
        logoImage = image
        resolve(image)
      }
      image.onerror = () => resolve(null)
      image.src = logoUrl
    })
  }
  return logoPromise
}

/** 畫出平安符，回傳 PNG 的 data URL */
export async function renderAmulet(data: AmuletData): Promise<string> {
  const tier = tierOf(data.level)
  const theme = THEMES[tier]
  const rand = seedFrom(data.number)
  const logo = await loadLogo()

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // 底色：吉凶決定主色，籤號決定色相微偏，同一等級的籤也不會長得一樣
  const hueShift = Math.round((rand() - 0.5) * 26)
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  bg.addColorStop(0, theme.top)
  bg.addColorStop(1, theme.bottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = `hsla(${(28 + hueShift + 360) % 360}, 60%, 50%, 0.16)`
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.restore()

  // 雲紋邊框（四角）：角度與大小依籤號變化
  const cloudScale = 0.9 + rand() * 0.45
  drawCloudMotif(ctx, 80, 80, cloudScale, theme.cloudOpacity, theme.gold)
  drawCloudMotif(ctx, 520, 80, -cloudScale, theme.cloudOpacity, theme.gold)
  drawCloudMotif(ctx, 80, 820, cloudScale * 0.9, theme.cloudOpacity * 0.8, theme.gold)
  drawCloudMotif(ctx, 520, 820, -cloudScale * 0.9, theme.cloudOpacity * 0.8, theme.gold)

  // 外框（雙線）
  ctx.strokeStyle = theme.gold
  ctx.lineWidth = 6
  ctx.strokeRect(24, 24, 552, 852)
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.5
  ctx.strokeRect(38, 38, 524, 824)
  ctx.globalAlpha = 1

  // 符頂：品牌 logo，載不到就畫燕尾脊
  if (logo) {
    const logoW = 176
    const logoH = logoW * (logo.naturalHeight / logo.naturalWidth)
    ctx.drawImage(logo, WIDTH / 2 - logoW / 2, 14, logoW, logoH)
  } else {
    drawSwallowtailRoof(ctx, WIDTH / 2, 96, 380, theme.gold, 0.8)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f2e2b3'
  ctx.font = '26px "Noto Serif TC", serif'
  ctx.fillText('籤 好 運 · 數 位 平 安 符', WIDTH / 2, 206)
  ctx.font = '13px "Noto Serif TC", serif'
  ctx.fillStyle = 'rgba(242,226,179,0.7)'
  ctx.fillText('TAIWAN TEMPLE ORACLE · 六十甲子籤', WIDTH / 2, 230)

  // 籤號圓章
  ctx.beginPath()
  ctx.arc(WIDTH / 2, 322, 78, 0, Math.PI * 2)
  ctx.strokeStyle = theme.gold
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.font = 'bold 34px "Noto Serif TC", serif'
  ctx.fillStyle = '#f2e2b3'
  ctx.fillText(`第 ${data.number} 籤`, WIDTH / 2, 314)
  ctx.font = '19px "Noto Serif TC", serif'
  const subtitle = [data.ganzhi, data.level].filter(Boolean).join(' · ')
  if (subtitle) ctx.fillText(subtitle, WIDTH / 2, 348)

  // 籤詩本文：一句一行（來源可能是整行用逗號隔開，交給 splitPoem 斷句）
  const lines = splitPoem(data.poem)
  ctx.font = '18px "Noto Serif TC", serif'
  ctx.fillStyle = '#f2e2b3'
  lines.slice(0, 6).forEach((line, index) => {
    ctx.fillText(line, WIDTH / 2, 430 + index * 38)
  })

  // 白話小語
  if (data.note) {
    ctx.font = '14px "Noto Serif TC", serif'
    ctx.fillStyle = 'rgba(242,226,179,0.85)'
    wrapText(ctx, data.note.trim(), WIDTH / 2, 620, 440, 24, 4)
  }

  // 八卦（轉向依籤號）與硃砂印（印文依吉凶 + 籤號選字）
  drawBagua(ctx, WIDTH / 2, 726, 46, theme.gold, 0.6, rand() * Math.PI)
  const sealText = theme.seals[Math.floor(rand() * theme.seals.length)] ?? theme.seals[0]
  drawSeal(ctx, 470, 782, 86, sealText, rand)

  ctx.font = '13px "Noto Serif TC", serif'
  ctx.fillStyle = 'rgba(242,226,179,0.55)'
  ctx.fillText(`祈福日期：${formatRocDate(data.date ?? new Date())}`, WIDTH / 2, 836)
  ctx.fillText('僅為互動祈福小語，非命理定論，願你事事順心', WIDTH / 2, 860)

  return canvas.toDataURL('image/png')
}

/** 下載用的檔名 */
export function amuletFileName(data: AmuletData): string {
  return `籤好運-平安符-第${data.number}籤.png`
}
