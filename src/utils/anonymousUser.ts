const STORAGE_KEY = 'ai-fortune-anonymous-user-id'

export function getAnonymousUserId(): string {
  const existingId = localStorage.getItem(STORAGE_KEY)
  if (existingId) return existingId

  const nextId = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, nextId)
  return nextId
}
