import { apiClient } from './client'

interface ApiResponse<T> {
  success: boolean
  data: T
}

interface EcPayCheckoutPayload {
  amount: number
  choose_payment?: string
}

export interface EcPayCheckoutResponse {
  action_url: string
  params: Record<string, string>
}

function unwrap<T>(response: T | ApiResponse<T>): T {
  return 'data' in Object(response) && 'success' in Object(response) ? (response as ApiResponse<T>).data : (response as T)
}

export async function createEcPayCheckout(payload: EcPayCheckoutPayload): Promise<EcPayCheckoutResponse> {
  const { data } = await apiClient.post<ApiResponse<EcPayCheckoutResponse> | EcPayCheckoutResponse>(
    '/donations/ecpay/',
    payload
  )
  return unwrap(data)
}
