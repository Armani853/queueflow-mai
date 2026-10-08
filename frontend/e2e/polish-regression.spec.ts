import { expect, test } from '@playwright/test'
import { cleanup, sessionPayload } from './fixHelpers'

test('transient booking lookup failure does not erase the personal link', async ({ page, request }) => {
  const adminTokens: string[] = []
  try {
    const createdResponse = await request.post('/api/sessions', { data: sessionPayload(`[POLISH-QA-RECOVERY] ${Date.now()}`) })
    expect(createdResponse.status()).toBe(201)
    const session = await createdResponse.json()
    adminTokens.push(session.admin_token)
    const bookedResponse = await request.post(`/api/sessions/${session.public_token}/bookings`, {
      data: { student_name: 'Тест Восстановления', group_name: 'М8О-301Б-23', lab_name: 'ЛР 1', slot_index: 0 },
    })
    expect(bookedResponse.status()).toBe(201)
    const booking = await bookedResponse.json()
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`queueflow:${session.public_token}`, booking.booking_token])
    await page.route(`**/api/bookings/${booking.booking_token}`, async (route) => route.abort('failed'))
    await page.goto(`/q/${session.public_token}`)
    await expect(page.getByRole('alert')).toContainText('Не удалось подключиться к серверу')
    expect(await page.evaluate((key) => localStorage.getItem(key), `queueflow:${session.public_token}`)).toBe(booking.booking_token)
    await page.unroute(`**/api/bookings/${booking.booking_token}`)
    await page.getByRole('button', { name: 'Восстановить мою запись' }).click()
    await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
    await expect(page.locator('.confirmation-card').getByText('Тест Восстановления', { exact: true })).toBeVisible()
  } finally {
    await cleanup(request, adminTokens)
  }
})

test('polling clears a selected slot that another student occupied', async ({ page, request }) => {
  const adminTokens: string[] = []
  try {
    const createdResponse = await request.post('/api/sessions', { data: sessionPayload(`[POLISH-QA-STALE] ${Date.now()}`) })
    const session = await createdResponse.json()
    adminTokens.push(session.admin_token)
    await page.goto(`/q/${session.public_token}`)
    await page.getByRole('button', { name: /10:00 Свободно/ }).click()
    expect((await request.post(`/api/sessions/${session.public_token}/bookings`, {
      data: { student_name: 'Другой Студент', group_name: 'М8О-301Б-23', lab_name: 'ЛР 2', slot_index: 0 },
    })).status()).toBe(201)
    await expect(page.getByRole('alert')).toHaveText('Выбранное время больше недоступно. Выберите другой свободный слот.')
    await expect(page.getByText('Сначала выберите свободный слот слева')).toBeVisible()
  } finally {
    await cleanup(request, adminTokens)
  }
})

test('student required-field feedback is Russian and points to the field', async ({ page, request }) => {
  const adminTokens: string[] = []
  try {
    const createdResponse = await request.post('/api/sessions', { data: sessionPayload(`[POLISH-QA-VALIDATION] ${Date.now()}`) })
    const session = await createdResponse.json()
    adminTokens.push(session.admin_token)
    await page.goto(`/q/${session.public_token}`)
    await page.getByRole('button', { name: /10:00 Свободно/ }).click()
    await page.getByRole('button', { name: 'Записаться' }).click()
    await expect(page.getByRole('alert')).toHaveText('Введите ФИО студента.')
    await expect(page.getByPlaceholder('Иванов Иван Иванович')).toBeFocused()
    await expect(page.getByPlaceholder('Иванов Иван Иванович')).toHaveAttribute('aria-invalid', 'true')
  } finally {
    await cleanup(request, adminTokens)
  }
})
