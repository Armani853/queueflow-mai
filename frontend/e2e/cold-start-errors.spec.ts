import { expect, test } from '@playwright/test'

test('cold start offers retry and invalid queue has a clear message', async ({ page }) => {
  await page.route('**/api/manage/network-test', (route) => route.abort('failed'))
  await page.goto('/manage/network-test')
  await expect(page.getByRole('heading', { name: 'Сервер пока не ответил' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible()

  await page.unroute('**/api/manage/network-test')
  await page.goto('/q/definitely-not-a-real-token')
  await expect(page.getByRole('heading', { name: 'Эта очередь не найдена или больше недоступна' })).toBeVisible()
})
