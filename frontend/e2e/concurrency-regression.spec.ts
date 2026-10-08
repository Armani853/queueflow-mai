import { expect, test } from '@playwright/test'
import { cleanup, sessionPayload } from './fixHelpers'

test('booking, close, status and settings races preserve queue invariants', async ({ request }) => {
  const adminTokens: string[] = []
  try {
    const createdResponse = await request.post('/api/sessions', { data: sessionPayload(`[POLISH-QA-RACES] ${Date.now()}`, 4) })
    expect(createdResponse.status()).toBe(201)
    const session = await createdResponse.json()
    adminTokens.push(session.admin_token)
    const book = (name: string, slot: number) => request.post(`/api/sessions/${session.public_token}/bookings`, {
      data: { student_name: name, group_name: 'М8О-301Б-23', lab_name: 'ЛР race', slot_index: slot },
    })

    const competing = await Promise.all([book('Один', 0), book('Два', 0)])
    expect(competing.map((response) => response.status()).sort()).toEqual([201, 409])
    const first = await competing.find((response) => response.status() === 201)!.json()

    const [cancelled, started] = await Promise.all([
      request.delete(`/api/bookings/${first.booking_token}`),
      request.patch(`/api/manage/${session.admin_token}/bookings/${first.id}`, { data: { status: 'CURRENT' } }),
    ])
    expect([200, 409]).toContain(cancelled.status())
    expect([200, 409]).toContain(started.status())
    const afterCancelStart = await (await request.get(`/api/sessions/${session.public_token}`)).json()
    expect((await (await request.get(`/api/bookings/${first.booking_token}`)).json()).status).toBe('CANCELLED')
    expect(afterCancelStart.bookings.filter((entry: { status: string }) => entry.status === 'CURRENT')).toHaveLength(0)

    const secondResponse = await book('Три', 0)
    expect(secondResponse.status()).toBe(201)
    const second = await secondResponse.json()
    expect((await request.patch(`/api/manage/${session.admin_token}/bookings/${second.id}`, { data: { status: 'CURRENT' } })).status()).toBe(200)
    const [passed, cancelledAfterStart] = await Promise.all([
      request.post(`/api/bookings/${second.booking_token}/complete`),
      request.delete(`/api/bookings/${second.booking_token}`),
    ])
    expect([200, 409]).toContain(passed.status())
    expect([200, 409]).toContain(cancelledAfterStart.status())
    const afterPassCancel = await (await request.get(`/api/sessions/${session.public_token}`)).json()
    const terminal = await (await request.get(`/api/bookings/${second.booking_token}`)).json()
    expect(['PASSED', 'CANCELLED']).toContain(terminal.status)
    expect(afterPassCancel.bookings.filter((entry: { status: string }) => entry.status === 'CURRENT')).toHaveLength(0)

    const thirdResponse = await book('Четыре', 0)
    expect(thirdResponse.status()).toBe(201)
    expect((await book('Пять', 1)).status()).toBe(201)
    const lowerLimit = await request.patch(`/api/manage/${session.admin_token}/session`, { data: { max_students: 1 } })
    expect(lowerLimit.status()).toBe(409)
    const stillOpen = await (await request.get(`/api/sessions/${session.public_token}`)).json()
    expect(stillOpen.bookings.find((entry: { student_name: string }) => entry.student_name === 'Четыре').status).not.toBe('CANCELLED')
    expect(stillOpen.max_students).toBe(4)

    const [closed, duringClose] = await Promise.all([
      request.patch(`/api/manage/${session.admin_token}/session`, { data: { is_active: false } }),
      book('Шесть', 2),
    ])
    expect(closed.status()).toBe(200)
    expect([201, 409]).toContain(duringClose.status())
    const afterClose = await (await request.get(`/api/sessions/${session.public_token}`)).json()
    expect(afterClose.is_active).toBe(false)
    const lateBooking = await book('Семь', 3)
    expect(lateBooking.status()).toBe(409)
  } finally {
    await cleanup(request, adminTokens)
  }
})
