/* 產生籤詩分享用的 QR Code。
   底層用 qrcode 套件（經 registry.npmmirror.com 安裝，npmjs.org 在本機無法解析）。
   顏色沿用站上的墨褐與米白，掃出來的圖跟畫面是同一套調性。 */
import QRCode from 'qrcode'

const PALETTE = { dark: '#3a2c22ff', light: '#fbf9f5ff' }

/** 依 session id 組出分享網址；沒有 origin 時（SSR）退回相對路徑 */
export function fortuneShareUrl(sessionId: string): string {
  /* 本機開發時 window.location.origin 會是 localhost，手機掃了連不到。
     需要用手機實測就設 VITE_PUBLIC_ORIGIN（區網 IP 或線上網址）。 */
  const configured = import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined
  const origin = configured || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${origin.replace(/\/$/, '')}/fortune/${sessionId}`
}

/** 把文字轉成 QR 的 data URI，可直接放進 <img src> */
export async function makeQrDataUrl(text: string, size = 320): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: size,
    color: PALETTE
  })
}
