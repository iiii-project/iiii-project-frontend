// 全站唯一的「手機／電腦」路由分流依據：router/index.ts 依此決定要掛
// src/mobile/router.ts 還是 src/desktop/router.ts 的路由表。
// 各頁面內部原本就有的響應式設計（CSS @media、少數 matchMedia 判斷）不受影響。
export const MOBILE_QUERY = '(max-width: 640px)'

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}
