import { expect, test } from '@playwright/test'
import './fixHelpers'

test('past date is blocked in UI and API', async ({ page, request }) => {
  await page.goto('/')
  const date = page.getByLabel('Дата')
  await date.fill('2020-01-01')
  await expect(date).toHaveAttribute('min', /\d{4}-\d{2}-\d{2}/)
  await date.evaluate((element) => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('form.create-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await expect(page.getByRole('alert')).toHaveText('Нельзя создать очередь на прошедшую дату.')

  const response = await request.post('/api/sessions', {
    headers: { 'Idempotency-Key': `past-${Date.now()}` },
    data: {
      title: `[FIX-AUDIT-PAST] ${Date.now()}`,
      subject: 'FIX audit',
      session_date: '2020-01-01',
      start_time: '10:00',
      end_time: '12:00',
      room: 'ГУК Б-315',
      slot_duration_minutes: 10,
      buffer_minutes: 2,
      max_students: 5,
    },
  })
  expect(response.status()).toBe(422)
  expect((await response.json()).detail).toBe('Нельзя создать окно сдачи в прошлом.')
  await page.screenshot({ path: 'test-results/fix-audit/past-date.png', fullPage: true })
})
