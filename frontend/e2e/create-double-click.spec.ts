import { expect, test } from '@playwright/test'
import { cleanup } from './fixHelpers'

test('20 rapid submits create exactly one queue and one history entry', async ({ page, request }) => {
  const adminTokens: string[] = []
  let successfulCreates = 0
  page.on('response', async (response) => {
    if (response.request().method() === 'POST' && response.url().endsWith('/api/sessions') && response.status() === 201) {
      successfulCreates += 1
      const body = await response.json()
      if (!adminTokens.includes(body.admin_token)) adminTokens.push(body.admin_token)
    }
  })
  try {
    await page.goto('/')
    await page.getByLabel('Название очереди').fill(`[FIX-AUDIT-CREATE] ${Date.now()}`)
    await page.locator('form.create-form').evaluate((form) => {
      for (let index = 0; index < 20; index += 1) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
    })
    await expect(page.getByText('Панель преподавателя', { exact: true })).toBeVisible()
    expect(successfulCreates).toBe(1)
    const historyCount = await page.evaluate(() => {
      const raw = localStorage.getItem('queueflow:teacher-queues:v1')
      return raw ? JSON.parse(raw).length : 0
    })
    expect(historyCount).toBe(1)
    await page.screenshot({ path: 'test-results/fix-audit/create-once.png', fullPage: true })
  } finally {
    await cleanup(request, adminTokens)
  }
})
