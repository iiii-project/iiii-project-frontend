/* 民國紀年。
   畫面一律顯示民國，資料仍是西元 ISO（見專案慣例），只在顯示時換算。 */

function toDate(value?: string | number | Date): Date | null {
  if (value === undefined || value === null || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function era(year: number): string {
  const roc = year - 1911
  return roc > 0 ? `民國${roc}` : `民國前${1 - roc}`
}

/** 例：民國115年8月6日 */
export function formatRocDate(value?: string | number | Date): string {
  const date = toDate(value)
  if (!date) return ''
  try {
    const formatted = new Intl.DateTimeFormat('zh-TW-u-ca-roc', { dateStyle: 'long' }).format(date)
    if (formatted.includes('民國')) return formatted
  } catch {
    // 少數環境不支援 roc 曆法，改用下面的手動換算
  }
  return `${era(date.getFullYear())}年${date.getMonth() + 1}月${date.getDate()}日`
}

/** 例：民國115年8月6日 下午2:30 */
export function formatRocDateTime(value?: string | number | Date): string {
  const date = toDate(value)
  if (!date) return ''
  try {
    const formatted = new Intl.DateTimeFormat('zh-TW-u-ca-roc', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(date)
    if (formatted.includes('民國')) return formatted
  } catch {
    // 同上
  }
  const time = new Intl.DateTimeFormat('zh-TW', { timeStyle: 'short' }).format(date)
  return `${formatRocDate(date)} ${time}`
}
