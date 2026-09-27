import { expect, test } from '@playwright/test'
import { cleanup, sessionPayload } from './fixHelpers'

test('teacher finishes queue and student cannot book it', async ({ page, request, browser }) => {
  const adminTokens: string[] = []
  try {
    const createdResponse = await request.post('/api/sessions', { data: sessionPayload(`[FIX-AUDIT-CLOSE] ${Date.now()}`) })
    const session = await createdResponse.json()
    adminTokens.push(session.admin_token)
    await page.goto(`/manage/${session.admin_token}`)
    await page.getByRole('button', { name: 'Завершить очередь' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/После этого студенты больше не смогут записываться/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Завершить', exact: true }).click()
    await expect(page.locator('.closed-banner').getByText('Очередь завершена')).toBeVisible()
    await page.screenshot({ path: 'test-results/fix-audit/teacher-closed.png', fullPage: true })

    const studentContext = await browser.newContext()
    const student = await studentContext.newPage()
    await student.goto(`/q/${session.public_token}`)
    await expect(student.getByRole('heading', { name: 'Эта очередь закрыта' })).toBeVisible()
    await expect(student.getByRole('button', { name: 'Записаться' })).toHaveCount(0)
    await student.screenshot({ path: 'test-results/fix-audit/student-closed.png', fullPage: true })
    await studentContext.close()

    const rejected = await request.post(`/api/sessions/${session.public_token}/bookings`, { data: { student_name: 'Поздний Студент', group_name: 'М8О-303Б-23', lab_name: 'ЛР closed', slot_index: 0 } })
    expect(rejected.status()).toBe(409)
    expect((await rejected.json()).detail).toBe('Эта очередь закрыта.')
    await page.goto('/')
    await expect(page.locator('.recent-row-closed').getByText(/завершена/)).toBeVisible()
  } finally {
    await cleanup(request, adminTokens)
  }
})
