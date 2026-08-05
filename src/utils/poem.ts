/* 籤詩斷句。
   後端回傳的 poem 有兩種樣子：帶換行的四句，或整支擠成一行用全角逗號隔開
   （例：「綠柳蒼蒼正當時，任君此去作乾坤，花果結實無殘謝，福祿自有慶家門。」）。
   直排要一句一行才有籤紙的樣子，所以這裡統一切成句子陣列，並去掉句尾標點
   ——直排的籤紙本來就不點標點。 */
const PUNCTUATION = /[，,。．；;、！!？?\s]+/
// 清理用的要加 g，不然一行裡只會清掉第一處標點
const PUNCTUATION_ALL = /[，,。．；;、！!？?\s]+/g

export function splitPoem(poem: string | undefined | null): string[] {
  if (!poem) return []
  const raw = poem.replace(/\r/g, '').trim()
  // 有換行就照作者斷好的行走，一行內的標點再清掉
  const byLine = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  const lines = byLine.length > 1 ? byLine : raw.split(PUNCTUATION)
  return lines.map((line) => line.replace(PUNCTUATION_ALL, '').trim()).filter(Boolean)
}

/** 直排排得下嗎？句子太長（例如白話式長句）就改回橫排，免得字被壓到看不見 */
export function fitsVertical(lines: string[]): boolean {
  return lines.length > 0 && lines.length <= 6 && lines.every((line) => line.length <= 9)
}
