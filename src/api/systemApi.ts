import { apiClient } from './client'

interface ApiResponse<T> {
  success: boolean
  data: T
}

export interface HomeContent {
  eyebrow: string
  title: string
  description: string
  steps: string[]
  notice: string
}

function unwrap<T>(response: T | ApiResponse<T>): T {
  return 'data' in Object(response) && 'success' in Object(response) ? (response as ApiResponse<T>).data : (response as T)
}

export async function getHomeContent(): Promise<HomeContent> {
  const { data } = await apiClient.get<ApiResponse<HomeContent> | HomeContent>('/home/')
  return unwrap(data)
}
