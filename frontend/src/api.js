export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export async function requestApi(path, { method = 'GET', body, headers: requestHeaders } = {}) {
  let response
  try {
    const isBlob = body instanceof Blob
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body && !isBlob ? { 'Content-Type': 'application/json' } : {}),
        ...requestHeaders,
      },
      body: body ? (isBlob ? body : JSON.stringify(body)) : undefined,
    })
  } catch {
    const error = new Error('Không thể kết nối API. Kiểm tra backend đang chạy.')
    error.status = 0
    throw error
  }

  if (response.status === 204) return null
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(result?.message || 'Yêu cầu không thành công.')
    error.status = response.status
    throw error
  }
  return result
}
