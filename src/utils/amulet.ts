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
import { makeQrDataUrl } from './qr'
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
  /* 回訪連結（/fortune/<sessionId>）。給了就在符面蓋一枚 QR，
     符被存下來或轉傳出去之後，掃一下就能回到這一支籤。
     沒給就不畫——例如離線籤沒有場次編號，畫了也是死連結。 */
  shareUrl?: string | null
}

const WIDTH = 600
const HEIGHT = 900
/** 輸出倍率：座標仍以 600×900 思考，實際像素放大這麼多倍（見 renderAmulet） */
const OUTPUT_SCALE = 2

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

/** 畫出平安符，回傳 PNG 的 data URL */
/* 把 QR 蓋到符面上。
   刻意產 2 倍解析度再縮著畫：符是要被存進相簿、甚至被別人翻拍的，
   QR 的模組邊緣一模糊就掃不出來。
   下面墊一塊米白底板也是為了掃描對比——深色符面直接疊 QR 會讓相機辨識變差。 */
async function drawShareQr(
  ctx: CanvasRenderingContext2D,
  url: string,
  centerX: number,
  centerY: number,
  size: number,
  gold: string
): Promise<void> {
  let qrUrl = ''
  try {
    /* 來源解析度給到繪製尺寸的 4 倍：符本身已經以 2 倍輸出，
       再多留一倍才能在「被壓縮縮圖」之後還有足夠的模組像素可掃。
       errorCorrectionLevel 維持 M（見 utils/qr），容錯與模組數的平衡較好。 */
    qrUrl = await makeQrDataUrl(url, size * 4)
  } catch {
    return // 產不出來就不畫，符本身照樣成立
  }
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = qrUrl
  })
  if (!image) return

  const pad = 7
  const x = centerX - size / 2
  const y = centerY - size / 2

  ctx.save()
  ctx.fillStyle = '#fbf9f5'
  ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2)
  ctx.strokeStyle = gold
  ctx.globalAlpha = 0.75
  ctx.lineWidth = 1.5
  ctx.strokeRect(x - pad, y - pad, size + pad * 2, size + pad * 2)
  ctx.globalAlpha = 1
  ctx.drawImage(image, x, y, size, size)
  ctx.restore()

  // 說明：小字、貼在碼下面，讓人知道這是可以掃的
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = '11.5px "Noto Serif TC", serif'
  ctx.fillStyle = 'rgba(242,226,179,0.8)'
  ctx.fillText('掃 碼 回 看 這 支 籤', centerX, Math.min(y + size + pad + 17, 812))
  ctx.restore()
}

export async function renderAmulet(data: AmuletData): Promise<string> {
  const tier = tierOf(data.level)
  const theme = THEMES[tier]
  const rand = seedFrom(data.number)

  /* 以 2 倍解析度輸出（1200×1800）。
     動機是 QR：符被轉傳時通訊軟體會壓縮縮圖，實測 600×900 的符縮到 40%
     之後 QR 就掃不出來了。把畫布放大、再用 ctx.scale 把座標系縮回原本的
     600×900，下面所有既有的排版座標都不用改，卻多了一倍的像素可以被壓。
     整張符的線條與字也跟著變銳利。 */
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * OUTPUT_SCALE
  canvas.height = HEIGHT * OUTPUT_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE)

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

  /* 以下由上往下依序排版（不是寫死座標）：
     籤詩可能 2～6 句、白話可能 1～4 行，寫死 y 會在句子少的時候留一個大洞。 */
  let y = 0

  /* 符頂：燕尾脊剪影 + 金色字樣。
     原本畫的是品牌 logo PNG，但那張圖是為亮底設計的（自帶暗紅色字樣），
     疊在深色符面上會變成一團看不清的髒污，所以改成自己畫。 */
  drawSwallowtailRoof(ctx, WIDTH / 2, 108, 360, theme.gold, 0.85)
  ctx.textAlign = 'center'
  ctx.fillStyle = theme.gold
  ctx.font = 'bold 30px "Noto Serif TC", serif'
  ctx.fillText('籤 好 運', WIDTH / 2, 156)
  y = 200

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  // logo 裡已經有「籤好運」，標題就不再重複一次，避免兩層字疊在一起
  ctx.fillStyle = '#f2e2b3'
  ctx.font = '24px "Noto Serif TC", serif'
  ctx.fillText('數 位 平 安 符', WIDTH / 2, y)
  y += 24
  ctx.font = '12.5px "Noto Serif TC", serif'
  ctx.fillStyle = 'rgba(242,226,179,0.7)'
  ctx.fillText('TAIWAN TEMPLE ORACLE · 六十甲子籤', WIDTH / 2, y)

  // 籤號圓章
  const circleR = 74
  const circleY = y + 34 + circleR
  ctx.beginPath()
  ctx.arc(WIDTH / 2, circleY, circleR, 0, Math.PI * 2)
  ctx.strokeStyle = theme.gold
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.font = 'bold 32px "Noto Serif TC", serif'
  ctx.fillStyle = '#f2e2b3'
  const subtitle = [data.ganzhi, data.level].filter(Boolean).join(' · ')
  ctx.fillText(`第 ${data.number} 籤`, WIDTH / 2, circleY + (subtitle ? -4 : 11))
  if (subtitle) {
    ctx.font = '18px "Noto Serif TC", serif'
    ctx.fillText(subtitle, WIDTH / 2, circleY + 28)
  }
  y = circleY + circleR + 48

  // 籤詩本文：一句一行（來源可能整行用逗號隔開，交給 splitPoem 斷句）
  const lines = splitPoem(data.poem).slice(0, 6)
  ctx.font = '19px "Noto Serif TC", serif'
  ctx.fillStyle = '#f2e2b3'
  lines.forEach((line) => {
    ctx.fillText(line, WIDTH / 2, y)
    y += 36
  })

  // 白話小語
  if (data.note) {
    y += 16
    ctx.font = '14px "Noto Serif TC", serif'
    ctx.fillStyle = 'rgba(242,226,179,0.85)'
    y = wrapText(ctx, data.note.trim(), WIDTH / 2, y, 430, 24, 4) + 10
  }

  /* 八卦與硃砂印：擺在剩下的空間中央，但不要壓到頁腳（頁腳固定在 826/852），
     所以給一個上下界。 */
  const baguaY = Math.min(Math.max(y + 74, 686), 752)
  drawBagua(ctx, WIDTH / 2, baguaY, 44, theme.gold, 0.6, rand() * Math.PI)
  const sealText = theme.seals[Math.floor(rand() * theme.seals.length)] ?? theme.seals[0]
  drawSeal(ctx, 448, baguaY + 4, 80, sealText, rand)

  /* 回訪 QR：擺在八卦（中央 300）的左邊 152，正好與右邊的硃印（448）對稱，
     所以構圖是「左碼、中八卦、右印」，不是硬塞一塊。
     y 跟著八卦走，八卦的上下界已經避開頁腳（826/852），這裡不會壓到字。 */
  if (data.shareUrl) {
    await drawShareQr(ctx, data.shareUrl, 150, baguaY + 2, 112, theme.gold)
  }

  ctx.font = '13px "Noto Serif TC", serif'
  ctx.fillStyle = 'rgba(242,226,179,0.55)'
  ctx.fillText(`祈福日期：${formatRocDate(data.date ?? new Date())}`, WIDTH / 2, 826)
  ctx.fillText('僅為互動祈福小語，非命理定論，願你事事順心', WIDTH / 2, 852)

  return canvas.toDataURL('image/png')
}

/** 下載用的檔名 */
export function amuletFileName(data: AmuletData): string {
  return `籤好運-平安符-第${data.number}籤.png`
}
