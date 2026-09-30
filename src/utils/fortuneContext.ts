/* 給 Live2D 小夥伴（金鶴）的求籤資料。
   求籤結果頁與查籤結果頁共用：送到後端後會放進角色 system prompt 的資料區塊
   （見後端 apps/live2d/engine/prompt_safety.py），信眾之後的追問都接著這支籤回答。

   問題與籤詩兩件事都要放：只放解籤，角色答不出「你剛才問的是什麼」；
   只放問題，角色答不出籤詩本身的內容。 */

export interface FortuneContextInput {
  question: string
  number?: number | null
  poem?: string | null
  interpretation?: {
    overall_meaning?: string
    relation_to_question?: string
    suggested_actions?: string[]
    warnings?: string[]
  } | null
}

export function buildFortuneContext({ question, number, poem, interpretation }: FortuneContextInput): string {
  const parts: string[] = []
  if (question) parts.push(`信眾這次求籤問的是：「${question}」。`)
  if (number) parts.push(`抽到第 ${number} 籤。`)
  if (poem) parts.push(`籤詩原文：${poem.replace(/\s+/g, ' ').trim()}`)
  if (interpretation?.overall_meaning) parts.push(`解籤結果：${interpretation.overall_meaning}`)
  if (interpretation?.relation_to_question) parts.push(interpretation.relation_to_question)
  if (interpretation?.suggested_actions?.length) {
    parts.push(`建議：${interpretation.suggested_actions.join('，')}。`)
  }
  return parts.join('\n').trim()
}
