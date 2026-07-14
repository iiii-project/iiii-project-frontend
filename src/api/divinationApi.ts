import { apiClient } from './client'
import type {
  BlockCast,
  Category,
  DivinationSession,
  FortuneSet,
  HistoryItem,
  InteractionMode,
  Interpretation
} from '@/types/divination'

interface ListResponse<T> {
  items: T[]
}

interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
}

function unwrap<T>(response: T | ApiResponse<T>): T {
  return 'data' in Object(response) && 'success' in Object(response) ? (response as ApiResponse<T>).data : (response as T)
}

export async function listFortuneSets(): Promise<FortuneSet[]> {
  const { data } = await apiClient.get<ApiResponse<ListResponse<FortuneSet>> | ListResponse<FortuneSet>>('/fortune-sets/')
  return unwrap(data).items
}

export async function createDivination(payload: {
  fortune_set_code: string
  question: string
  category: Category
  categories: Category[]
  interaction_mode: InteractionMode
  anonymous_user_id: string
}): Promise<DivinationSession> {
  const { category, ...requestBody } = payload
  const { data } = await apiClient.post<ApiResponse<DivinationSession> | DivinationSession>('/divinations/', requestBody)
  return unwrap(data)
}

export async function completePrayer(sessionId: string): Promise<DivinationSession> {
  const { data } = await apiClient.post<ApiResponse<DivinationSession> | DivinationSession>(
    `/divinations/${sessionId}/prayer-complete/`
  )
  return unwrap(data)
}

export async function drawFortune(sessionId: string): Promise<DivinationSession> {
  const { data } = await apiClient.post<ApiResponse<DivinationSession> | DivinationSession>(
    `/divinations/${sessionId}/draw/`
  )
  return unwrap(data)
}

export async function castBlocks(sessionId: string): Promise<BlockCast> {
  const { data } = await apiClient.post<ApiResponse<BlockCast> | BlockCast>(`/divinations/${sessionId}/blocks/`)
  return unwrap(data)
}

export async function interpretFortune(sessionId: string): Promise<DivinationSession & { interpretation: Interpretation }> {
  const { data } = await apiClient.post<
    ApiResponse<DivinationSession & { interpretation: Interpretation }> | (DivinationSession & { interpretation: Interpretation })
  >(
    `/divinations/${sessionId}/interpret/`
  )
  return unwrap(data)
}

export async function interpretFortuneWithContext(
  sessionId: string,
  payload: {
    question: string
    category: Category
    categories: Category[]
    divination_result?: Record<string, unknown>
  }
): Promise<DivinationSession & { interpretation: Interpretation }> {
  const { category, ...requestBody } = payload
  const { data } = await apiClient.post<
    ApiResponse<DivinationSession & { interpretation: Interpretation }> | (DivinationSession & { interpretation: Interpretation })
  >(
    `/divinations/${sessionId}/interpret/`,
    requestBody
  )
  return unwrap(data)
}

export async function sendChat(sessionId: string, message: string): Promise<{ reply: string; remaining_messages: number }> {
  const { data } = await apiClient.post<
    ApiResponse<{ reply: string; remaining_messages: number }> | { reply: string; remaining_messages: number }
  >(
    `/divinations/${sessionId}/chat/`,
    { message }
  )
  return unwrap(data)
}

export async function listHistory(anonymousUserId?: string): Promise<HistoryItem[]> {
  const { data } = await apiClient.get<ApiResponse<ListResponse<HistoryItem>> | ListResponse<HistoryItem>>('/divinations/', {
    params: anonymousUserId ? { anonymous_user_id: anonymousUserId } : undefined
  })
  return unwrap(data).items
}

export async function deleteHistoryItem(sessionId: string): Promise<void> {
  await apiClient.delete(`/divinations/${sessionId}/`)
}
