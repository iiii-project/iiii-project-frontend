/// <reference types="vite/client" />

/* AR 引擎那份離線籤詩表是純 JS（由後端籤詩資料產生），
   查籤的離線備援會 import 它，這裡補上型別宣告。 */
declare module '@/ar/temple-ar-oracle/engine/offline-fortunes.js' {
  export const OFFLINE_FORTUNES: Array<{
    no: number
    ganzhi: string
    poem: string
    explain: string
    modern: string
    story: string
  }>
}

/* AR 引擎的流程控制器是純 JS。查籤頁只用到裡面的「領籤過場」，
   沿用同一份實作（揭曉時機、影片載不到時退回墨染），所以補上這兩支的型別。 */
declare module '@/ar/temple-ar-oracle/engine/flow-controller.js' {
  interface TransitionEls {
    transitionVideo: HTMLVideoElement
    transitionOverlay: HTMLElement
  }
  export function preloadOracleTransition(els: TransitionEls, options?: { src?: string }): void
  export function playOracleTransition(
    els: TransitionEls,
    onCovered?: () => void,
    hooks?: { onStart?: () => void; onEnd?: () => void; src?: string }
  ): void
}
