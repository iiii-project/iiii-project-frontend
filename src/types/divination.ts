export type InteractionMode = 'click' | 'motion'
export type DivinationStatus =
  | 'created'
  | 'praying'
  | 'drawing'
  | 'waiting_for_blocks'
  | 'confirmed'
  | 'rejected'
  | 'interpreting'
  | 'completed'
  | 'cancelled'

export type Category =
  | 'love'
  | 'career'
  | 'study'
  | 'wealth'
  | 'health'
  | 'family'
  | 'relationship'
  | 'travel'
  | 'other'

export type ActionEvent = 'PRAYER_DETECTED' | 'SHAKE_DETECTED' | 'BLOCK_CAST_DETECTED'

export interface FortuneSet {
  code: string
  name: string
  description?: string
  is_default?: boolean
}

export interface Fortune {
  number: number
  title: string
  ganzhi?: string
  fortune_level?: string
  poem: string
  translation?: string
  story?: string
  explanation?: string
}

export interface BlockCast {
  attempt_number: number
  block_one: 'flat' | 'round'
  block_two: 'flat' | 'round'
  result: 'sheng' | 'xiao' | 'yin'
  result_name: string
  confirmed: boolean
  remaining_attempts: number
}

export interface Interpretation {
  overall_meaning: string
  relation_to_question: string
  suggested_actions: string[]
  warnings: string[]
}

export interface DivinationSession {
  session_id: string
  status: DivinationStatus
  fortune_set: FortuneSet
  fortune?: Fortune | null
  question?: string
  category?: Category
  categories?: Category[]
  confirmed?: boolean
  interpretation?: Interpretation | null
}

export interface HistoryItem extends DivinationSession {
  question: string
  category: Category
  categories?: Category[]
  created_at?: string
}

export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
  message?: string
}
