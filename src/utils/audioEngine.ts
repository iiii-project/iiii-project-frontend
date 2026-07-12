// src/utils/audioEngine.ts
// 以 WebAudio 即時合成木質敲擊音效，不需要外部音檔。
// AudioContext 需在使用者手勢（例如點擊「開始」按鈕）後呼叫 unlock()，
// 才符合瀏覽器的自動播放政策。

let ctx: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      ctx = null
    }
  }
  return ctx
}

export function unlock() {
  const c = ensureContext()
  if (c && c.state === 'suspended') c.resume()
}

/** 平面觸地：短促高頻的清脆聲 */
export function tap() {
  const c = ensureContext()
  if (!c) return
  const t0 = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(1500, t0)
  osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.08)
  gain.gain.setValueAtTime(0.22, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + 0.1)
}

/** 凸面觸地：低頻厚實聲 + 短噪訊，模擬木質重量感 */
export function thud() {
  const c = ensureContext()
  if (!c) return
  const t0 = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(180, t0)
  osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.16)
  gain.gain.setValueAtTime(0.35, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + 0.22)

  const bufSize = Math.floor(c.sampleRate * 0.06)
  const buf = c.createBuffer(1, bufSize, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize)
  const noise = c.createBufferSource()
  noise.buffer = buf
  const ngain = c.createGain()
  ngain.gain.setValueAtTime(0.12, t0)
  noise.connect(ngain)
  ngain.connect(c.destination)
  noise.start(t0)
}

/** 依後端回傳的 block_one / block_two 播放對應落地音效（純演出用，不影響任何邏輯） */
export function playBlockLandingSound(blockOne: 'flat' | 'round', blockTwo: 'flat' | 'round') {
  const play = (block: 'flat' | 'round', delay: number) =>
    setTimeout(() => (block === 'flat' ? tap() : thud()), delay)
  play(blockOne, 0)
  play(blockTwo, 55)
  if (navigator.vibrate) navigator.vibrate(20)
}
