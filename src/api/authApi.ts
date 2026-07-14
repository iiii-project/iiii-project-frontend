import { apiClient } from './client'

interface ApiResponse<T> {
  success: boolean
  data: T
}

export interface AuthUser {
  id: number
  username: string
  email: string
}

export interface AuthSession {
  user: AuthUser
  access: string
  refresh: string
}

function unwrap<T>(response: T | ApiResponse<T>): T {
  return 'data' in Object(response) && 'success' in Object(response) ? (response as ApiResponse<T>).data : (response as T)
}

export async function registerAccount(payload: { username: string; email: string; password: string }): Promise<AuthSession> {
  const { data } = await apiClient.post<ApiResponse<AuthSession> | AuthSession>('/auth/register/', payload)
  return unwrap(data)
}

export async function loginAccount(payload: { username: string; password: string }): Promise<AuthSession> {
  const { data } = await apiClient.post<ApiResponse<{ access: string; refresh: string }> | { access: string; refresh: string }>('/auth/token/', payload)
  const tokens = unwrap(data)
  const user = await getCurrentUser(tokens.access)
  return { ...tokens, user }
}

export async function getCurrentUser(accessToken?: string): Promise<AuthUser> {
  const { data } = await apiClient.get<ApiResponse<AuthUser> | AuthUser>('/auth/me/', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  })
  return unwrap(data)
}
