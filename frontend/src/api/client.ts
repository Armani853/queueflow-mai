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
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
  } catch {
    throw new ApiError('Сервер временно недоступен. Обновите страницу и попробуйте ещё раз.', 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Неизвестная ошибка' }))
    throw new ApiError(body.detail ?? 'Не удалось выполнить запрос', response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  createSession: (payload: SessionCreatePayload) =>
    request<CreatedSession>('/api/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  publicSession: (token: string) => request<QueueSession>(`/api/sessions/${token}`),
  manageSession: (token: string) => request<QueueSession>(`/api/manage/${token}`),
  createBooking: (token: string, payload: { student_name: string; group_name: string; lab_name: string; slot_index: number }) =>
    request<Booking>(`/api/sessions/${token}/bookings`, { method: 'POST', body: JSON.stringify(payload) }),
  readBooking: (token: string) => request<Booking>(`/api/bookings/${token}`),
  cancelBooking: (token: string) => request<Booking>(`/api/bookings/${token}`, { method: 'DELETE' }),
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
