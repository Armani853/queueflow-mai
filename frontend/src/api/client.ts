import type { Booking, BookingStatus, CreatedSession, QueueSession, SessionCreatePayload } from '../types'

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 70_000)
  try {
    response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
  } catch {
    throw new ApiError('Не удалось подключиться к серверу. Повторите попытку.', 0)
  } finally {
    window.clearTimeout(timeout)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Неизвестная ошибка' }))
    const message = response.status >= 500
      ? 'На сервере произошла ошибка. Попробуйте ещё раз.'
      : body.detail ?? 'Не удалось выполнить запрос'
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  createSession: (payload: SessionCreatePayload, idempotencyKey: string) =>
    request<CreatedSession>('/api/sessions', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) }),
  publicSession: (token: string) => request<QueueSession>(`/api/sessions/${token}`),
  manageSession: (token: string) => request<QueueSession>(`/api/manage/${token}`),
  createBooking: (token: string, payload: { student_name: string; group_name: string; lab_name: string; slot_index: number }) =>
    request<Booking>(`/api/sessions/${token}/bookings`, { method: 'POST', body: JSON.stringify(payload) }),
  readBooking: (token: string) => request<Booking>(`/api/bookings/${token}`),
  cancelBooking: (token: string) => request<Booking>(`/api/bookings/${token}`, { method: 'DELETE' }),
  completeBooking: (token: string) => request<QueueSession>(`/api/bookings/${token}/complete`, { method: 'POST' }),
  updateBooking: (adminToken: string, id: number, status: BookingStatus) =>
    request<Booking>(`/api/manage/${adminToken}/bookings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  moveBooking: (adminToken: string, id: number) =>
    request<Booking>(`/api/manage/${adminToken}/bookings/${id}/move`, { method: 'POST' }),
  updateSession: (adminToken: string, payload: Partial<SessionCreatePayload> & { is_active?: boolean }) =>
    request<QueueSession>(`/api/manage/${adminToken}/session`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
}

export { ApiError }
