/* 離線查籤的資料來源。
   沒有網路時（廟裡訊號差、活動現場網路掛掉）查籤還是要能用，所以直接沿用
   專案內既有的那份 60 首離線籤詩表（src/ar/temple-ar-oracle/engine/offline-fortunes.js，
   AR 引擎在後端連不上時也是用它），把欄位轉成查籤端點回傳的形狀。

   線上永遠優先：後端的籤書資料是可以被管理端更新的，離線表只是備援。 */
import { OFFLINE_FORTUNES } from '@/ar/temple-ar-oracle/engine/offline-fortunes.js'
import type { Fortune } from '@/types/divination'

interface OfflineFortune {
  no: number
  ganzhi: string
  grade: string
  poem: string
  explain: string
  modern: string
}

const TABLE = OFFLINE_FORTUNES as OfflineFortune[]

/** 離線表裡最大的籤號，用來擋明顯的誤輸入 */
export const OFFLINE_MAX_NUMBER = TABLE.reduce((max, item) => Math.max(max, item.no), 0)

/* 欄位對照：
   grade（吉凶，離線表寫成「上　上」這種全角空白排版）→ fortune_level，順手收掉空白
   modern（白話說明）→ translation
   explain（籤書式解釋）→ general_meaning，這樣它會出現在「籤書解釋」那一區 */
export function offlineFortuneByNumber(number: number): Fortune | null {
  const found = TABLE.find((item) => item.no === number)
  if (!found) return null
  return {
    number: found.no,
    title: '',
    ganzhi: found.ganzhi,
    fortune_level: found.grade.replace(/\s+/g, ''),
    poem: found.poem,
    translation: found.modern,
    general_meaning: found.explain
  }
}
