import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const sizes = [
  [320, 700], [360, 800], [390, 844], [430, 932],
  [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1512, 770], [1920, 1080],
] as const

test('redesign visual and responsive audit on real queues', async ({ page, browser }) => {
  const folder = process.env.SCREENSHOT_DIR ?? 'test-results/redesign-v2'
  mkdirSync(folder, { recursive: true })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Создайте очередь/ })).toBeVisible()
  await expect(page.locator('h1')).toHaveCount(1)
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${folder}/landing-${width}x${height}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => { document.body.style.zoom = '2' })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `${folder}/landing-zoom-200.png`, fullPage: true })
  await page.evaluate(() => { document.body.style.zoom = '' })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByLabel('Название очереди').fill('')
  await page.getByRole('button', { name: 'Создать очередь' }).click()
  await expect(page.getByRole('alert')).toHaveText(/Введите название очереди/)
  await expect(page.getByLabel('Название очереди')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Название очереди').fill(`[REDESIGN-QA] Сдача лабораторных ${Date.now()}`)
  await page.getByRole('button', { name: 'Создать очередь' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const teacherUrl = page.url()
  const publicUrl = await page.locator('.share-modal .url-box').innerText()
  await expect(page.getByRole('button', { name: 'Закрыть окно' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const student = await browser.newPage()
  student.on('pageerror', (error) => pageErrors.push(error.message))
  await student.goto(publicUrl)
  await expect(student.getByRole('heading', { name: /Сдача лабораторных/ })).toBeVisible()
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    await student.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect.poll(() => student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${folder}/teacher-empty-${width}x${height}.png`, fullPage: true })
    await student.screenshot({ path: `${folder}/student-open-${width}x${height}.png`, fullPage: true })
  }

  await student.setViewportSize({ width: 390, height: 844 })
  await student.locator('.slot:not(:disabled)').first().click()
  await student.getByPlaceholder('Иванов Иван Иванович').fill('Иван Петров')
  await student.getByPlaceholder('М8О-301Б-23').fill('М8О-301Б-23')
  await student.getByPlaceholder('ЛР 1.3').fill('ЛР 1.3')
  await student.getByRole('button', { name: 'Записаться' }).click()
  await expect(student.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  await expect(page.locator('.queue-row', { hasText: 'Иван Петров' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await student.screenshot({ path: `${folder}/student-booked-390.png`, fullPage: true })
  await page.screenshot({ path: `${folder}/teacher-booked-390.png`, fullPage: true })

  await page.locator('.queue-row', { hasText: 'Иван Петров' }).getByRole('button', { name: 'Начать' }).click()
  await expect(student.getByRole('button', { name: 'Я сдал', exact: true })).toBeVisible()
  await page.screenshot({ path: `${folder}/teacher-current-390.png`, fullPage: true })
  await student.screenshot({ path: `${folder}/student-current-390.png`, fullPage: true })
  await student.getByRole('button', { name: 'Я сдал', exact: true }).click()
  await expect(student.getByRole('dialog')).toBeVisible()
  await student.screenshot({ path: `${folder}/student-dialog-390.png`, fullPage: true })
  await student.getByRole('dialog').getByRole('button', { name: 'Да, я сдал' }).click()
  await expect(student.getByRole('button', { name: 'Я сдал', exact: true })).toHaveCount(0)
  await expect(student.getByRole('heading', { name: 'Вы сдали' })).toBeVisible()
  await expect(page.locator('.current-card')).toContainText('Все записи обработаны')
  await page.screenshot({ path: `${folder}/teacher-passed-390.png`, fullPage: true })
  await student.screenshot({ path: `${folder}/student-passed-390.png`, fullPage: true })

  await page.goto(teacherUrl)
  await expect(page.getByRole('heading', { name: /Сдача лабораторных/ })).toBeVisible()
  await student.goto('/q/invalid-visual-audit-token')
  await expect(student.getByRole('link', { name: 'На главную', exact: true })).toBeVisible()
  await student.screenshot({ path: `${folder}/invalid-student-390.png`, fullPage: true })
  await student.goto('/manage/invalid-visual-audit-token')
  await expect(student.getByRole('link', { name: 'На главную', exact: true })).toBeVisible()
  await student.screenshot({ path: `${folder}/invalid-teacher-390.png`, fullPage: true })
  await student.goto('/not-a-route')
  await expect(student.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible()
  await student.screenshot({ path: `${folder}/not-found-390.png`, fullPage: true })
  expect(pageErrors).toEqual([])
  await student.close()
})
