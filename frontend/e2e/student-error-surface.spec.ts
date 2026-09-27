import { expect, test } from '@playwright/test'
import { cleanup, sessionPayload } from './fixHelpers'

test('student sees slot conflict and stale selection is reset', async ({ page, request }) => {
  const adminTokens: string[] = []
  try {
    const createdResponse = await request.post('/api/sessions', { data: sessionPayload(`[FIX-AUDIT-ERROR] ${Date.now()}`) })
    const session = await createdResponse.json()
    adminTokens.push(session.admin_token)
    await page.goto(`/q/${session.public_token}`)
    await page.getByRole('button', { name: /10:00 Свободно/ }).click()
    await page.getByPlaceholder('Иванов Иван Иванович').fill('Проигравший Студент')
    await page.getByPlaceholder('М8О-301Б-23').fill('М8О-301Б-23')
    await page.getByPlaceholder('ЛР 1.3').fill('ЛР conflict')

    expect((await request.post(`/api/sessions/${session.public_token}/bookings`, { data: { student_name: 'Победивший Студент', group_name: 'М8О-302Б-23', lab_name: 'ЛР winner', slot_index: 0 } })).status()).toBe(201)
    await page.getByRole('button', { name: 'Записаться' }).click()
    await expect(page.getByRole('alert')).toHaveText('Этот слот только что заняли. Выберите другой.')
    await expect(page.getByText('Сначала выберите свободный слот слева')).toBeVisible()
    await expect(page.getByRole('button', { name: /10:00 Занято/ })).toBeDisabled()
    await page.screenshot({ path: 'test-results/fix-audit/student-conflict.png', fullPage: true })
  } finally {
    await cleanup(request, adminTokens)
  }
})
