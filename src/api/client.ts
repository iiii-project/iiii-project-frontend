import axios, { AxiosError } from 'axios'
import type { ApiErrorBody } from '@/types/divination'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 120000
})

export function toUserMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return '操作失敗，請稍後再試。'

  const axiosError = error as AxiosError<ApiErrorBody>
  const status = axiosError.response?.status
  const apiMessage = axiosError.response?.data?.error?.message || axiosError.response?.data?.message
  if (apiMessage) return `${apiMessage} 請依畫面提示繼續。`
  if (status === 401 || status === 403) return '目前沒有權限執行此操作，請重新整理或聯絡管理者。'
  if (status === 404) return '找不到這次求籤紀錄，請重新開始。'
  if (status === 409) return '目前流程狀態不允許此操作，請依目前頁面繼續。'
  if (status && status >= 500) return '伺服器暫時無法回應，資料已保留，請稍後重試。'
  return '網路連線失敗，請檢查連線後再試。'
}
