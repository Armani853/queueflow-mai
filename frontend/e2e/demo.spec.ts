import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const screenshotDir = 'test-results/ux-audit'
test.beforeAll(() => mkdirSync(screenshotDir, { recursive: true }))

test('complete QueueFlow demo scenario', async ({ page, request, context, browser }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Создайте очередь/ })).toBeVisible()
  await page.getByLabel('Название очереди').fill(`[UX-AUDIT] Playwright ${Date.now()}`)
  await page.getByRole('button', { name: /Создать очередь/ }).click()
  await expect(page.getByText('Панель преподавателя', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  const teacherHref = new URL(page.url()).pathname
  const publicUrl = await page.locator('.share-modal .url-box').innerText()
  const studentHref = new URL(publicUrl).pathname
  const pageOrigin = new URL(page.url()).origin
  if (['localhost', '127.0.0.1', '::1'].includes(new URL(pageOrigin).hostname)) {
    await expect(page.getByText('Телефон не откроет localhost.')).toBeVisible()
    const qrOriginInput = page.getByRole('textbox', { name: 'Адрес компьютера для QR' })
    await qrOriginInput.fill('http://192.168.1.42:8000')
    await expect(page.locator('.share-modal [data-qr-url]')).toHaveAttribute(
      'data-qr-url',
      `http://192.168.1.42:8000${studentHref}`,
    )
  } else {
    await expect(page.getByText('Телефон не откроет localhost.')).toHaveCount(0)
    await expect(page.locator('.share-modal [data-qr-url]')).toHaveAttribute('data-qr-url', `${pageOrigin}${studentHref}`)
  }
  await page.goto('/')
  await expect(page.getByText('У вас есть активная очередь')).toBeVisible()
  await expect(page.getByRole('link', { name: /Продолжить управление/ })).toHaveAttribute('href', teacherHref!)
  await page.screenshot({ path: `${screenshotDir}/landing-active-queue.png`, fullPage: true })

  const storageState = await context.storageState()
  const restartedContext = await browser.newContext({ storageState })
  const restartedPage = await restartedContext.newPage()
  await restartedPage.goto('/')
  await expect(restartedPage.getByRole('link', { name: /Продолжить управление/ })).toHaveAttribute('href', teacherHref!)
  await restartedContext.close()

  const studentPage = await context.newPage()
  await studentPage.goto(studentHref!)
  await studentPage.getByRole('button', { name: /12:00 Свободно/ }).click()
  await studentPage.getByPlaceholder('Иванов Иван Иванович').fill('Арман Саркисян')
  await studentPage.getByPlaceholder('М8О-301Б-23').fill('М8О-301Б-23')
  await studentPage.getByPlaceholder('ЛР 1.3').fill('ЛР 1.3')
  await studentPage.getByRole('button', { name: 'Записаться' }).click()
  await expect(studentPage.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  await expect(studentPage.locator('.confirmation-time')).toHaveText('12:00')
  await expect(studentPage.getByText('Сохраните личную ссылку')).toBeVisible()
  await studentPage.screenshot({ path: `${screenshotDir}/student-booked.png`, fullPage: true })
  const personalUrl = await studentPage.locator('.personal-link .url-box').innerText()
  const cleanContext = await browser.newContext()
  const restoredPage = await cleanContext.newPage()
  await restoredPage.goto(personalUrl)
  await expect(restoredPage.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  await cleanContext.close()

  const publicToken = studentHref!.split('/').pop()!
  const bookings = [
    ['Мария Волкова', 1, 'ЛР 1.4'],
    ['Давид Арутюнян', 2, 'ЛР 1.2'],
    ['Анна Соколова', 3, 'ЛР 1.5'],
  ] as const
  const created = []
  for (const [student_name, slot_index, lab_name] of bookings) {
    const response = await request.post(`/api/sessions/${publicToken}/bookings`, {
      data: { student_name, group_name: 'М8О-301Б-23', lab_name, slot_index },
    })
    expect(response.status()).toBe(201)
    created.push(await response.json())
  }

  const teacherPage = await context.newPage()
  await teacherPage.goto(teacherHref!)
  await expect(teacherPage.getByTitle('Арман Саркисян')).toBeVisible()
  await expect(teacherPage.getByTitle('Анна Соколова')).toBeVisible()
  const csv = await request.get(`/api/manage/${teacherHref!.split('/').pop()}/export.csv`)
  expect(csv.status()).toBe(200)
  expect(await csv.text()).toContain('ФИО,Группа,Лабораторная,Время,Статус,Примечание')

  const cancel = await request.delete(`/api/bookings/${created[0].booking_token}`)
  expect(cancel.status()).toBe(200)
  await teacherPage.reload()
  const davidRow = teacherPage.locator('article', { hasText: 'Давид Арутюнян' })
  await expect(davidRow.getByText('12:12')).toBeVisible()
  const annaRow = teacherPage.locator('article', { hasText: 'Анна Соколова' })
  await expect(annaRow.getByText('12:24')).toBeVisible()

  const davidBody = await request.get(`/api/sessions/${publicToken}`)
  const compactPublic = await davidBody.json()
  expect(compactPublic.admin_token).toBeUndefined()
  expect(compactPublic.bookings.find((booking: { student_name: string }) => booking.student_name === 'Давид Арутюнян').scheduled_time).toBe('12:12:00')
  expect(compactPublic.bookings.some((booking: { student_name: string }) => booking.student_name === 'Мария Волкова')).toBe(false)

  const armanRow = teacherPage.locator('article', { hasText: 'Арман Саркисян' })
  await armanRow.getByRole('button', { name: 'Начать' }).click()
  await expect(teacherPage.getByText('Сейчас сдаёт')).toBeVisible()
  await expect(teacherPage.locator('.current-card').getByText('Арман Саркисян')).toBeVisible()
  const currentPublic = await (await request.get(`/api/sessions/${publicToken}`)).json()
  expect(currentPublic.bookings.find((booking: { student_name: string }) => booking.student_name === 'Арман Саркисян').status).toBe('CURRENT')
  await teacherPage.getByRole('button', { name: /Отметить «Сдал»/ }).click()
  await expect(armanRow.getByText('Сдал')).toBeVisible()
  const passedPublic = await (await request.get(`/api/sessions/${publicToken}`)).json()
  expect(passedPublic.bookings.find((booking: { student_name: string }) => booking.student_name === 'Арман Саркисян').status).toBe('PASSED')

  const reopenPassed = await request.patch(
    `/api/manage/${teacherHref!.split('/').pop()}/bookings/${await armanRow.getAttribute('data-booking-id')}`,
    { data: { status: 'CURRENT' } },
  )
  expect(reopenPassed.status()).toBe(409)

  await davidRow.getByTitle('Опоздал').click()
  await expect(davidRow.getByText('Опаздывает')).toBeVisible()
  const latePublic = await (await request.get(`/api/sessions/${publicToken}`)).json()
  expect(latePublic.bookings.find((booking: { student_name: string }) => booking.student_name === 'Давид Арутюнян').status).toBe('LATE')
  await davidRow.getByRole('button', { name: 'Перенести' }).click()
  await expect(davidRow.getByText('Ожидает')).toBeVisible()
  await expect(davidRow.getByText('12:24')).toBeVisible()
  const movedPublic = await (await request.get(`/api/sessions/${publicToken}`)).json()
  expect(movedPublic.bookings.find((booking: { student_name: string }) => booking.student_name === 'Давид Арутюнян').scheduled_time).toBe('12:24:00')

  const racePayload = (name: string) => ({
    data: { student_name: name, group_name: 'М8О-399Б-23', lab_name: 'ЛР race', slot_index: 4 },
  })
  const race = await Promise.all([
    request.post(`/api/sessions/${publicToken}/bookings`, racePayload('Race One')),
    request.post(`/api/sessions/${publicToken}/bookings`, racePayload('Race Two')),
  ])
  expect(race.map((response) => response.status()).sort()).toEqual([201, 409])

  await teacherPage.reload()
  await expect(teacherPage.getByText(/Race (One|Two)/)).toBeVisible()
  await teacherPage.screenshot({ path: `${screenshotDir}/teacher-with-bookings.png`, fullPage: true })
  await studentPage.reload()
  await expect(studentPage.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  const cleanup = await request.delete(`/api/manage/${teacherHref!.split('/').pop()}/session`)
  expect(cleanup.status()).toBe(204)
})

test('two devices share one live queue and roles are explicit', async ({ browser, request }) => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const createdResponse = await request.post('/api/sessions', {
    data: {
      title: `[UX-AUDIT] Live sync ${Date.now()}`,
      subject: 'Проверка общей очереди',
      session_date: tomorrow,
      start_time: '10:00',
      end_time: '12:00',
      room: 'ГУК Б-315',
      slot_duration_minutes: 10,
      buffer_minutes: 2,
      max_students: 8,
    },
  })
  expect(createdResponse.status()).toBe(201)
  const session = await createdResponse.json()

  const teacherContext = await browser.newContext()
  const studentContext = await browser.newContext()
  const secondStudentContext = await browser.newContext()
  const teacherPage = await teacherContext.newPage()
  const studentPage = await studentContext.newPage()
  const secondStudentPage = await secondStudentContext.newPage()

  await teacherPage.goto(`/manage/${session.admin_token}`)
  await expect(teacherPage.getByText('Панель преподавателя', { exact: true })).toBeVisible()
  await expect(teacherPage.getByText('Вы управляете очередью')).toBeVisible()
  await expect(teacherPage.getByText('Очередь пока пуста')).toBeVisible()
  await teacherPage.screenshot({ path: `${screenshotDir}/teacher-empty.png`, fullPage: true })

  await studentPage.goto(`/q/${session.public_token}`)
  await expect(studentPage.getByText(/QueueFlow · Студент/)).toBeVisible()
  await studentPage.getByRole('button', { name: /10:00 Свободно/ }).click()
  await studentPage.getByPlaceholder('Иванов Иван Иванович').fill('Живой Тест Студент')
  await studentPage.getByPlaceholder('М8О-301Б-23').fill('М8О-301Б-23')
  await studentPage.getByPlaceholder('ЛР 1.3').fill('ЛР sync')
  await studentPage.getByRole('button', { name: 'Записаться' }).click()
  await expect(studentPage.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()

  await expect(teacherPage.getByTitle('Живой Тест Студент')).toBeVisible()
  await secondStudentPage.goto(`/q/${session.public_token}`)
  await expect(secondStudentPage.getByTitle('Живой Тест Студент')).toBeVisible()
  await secondStudentPage.getByRole('button', { name: /10:12 Свободно/ }).click()
  await secondStudentPage.getByPlaceholder('Иванов Иван Иванович').fill('Второй Тест Студент')
  await secondStudentPage.getByPlaceholder('М8О-301Б-23').fill('М8О-302Б-23')
  await secondStudentPage.getByPlaceholder('ЛР 1.3').fill('ЛР sync 2')
  await secondStudentPage.getByRole('button', { name: 'Записаться' }).click()
  await expect(teacherPage.getByTitle('Второй Тест Студент')).toBeVisible()

  const secondRow = teacherPage.locator('article', { hasText: 'Второй Тест Студент' })
  await secondRow.getByRole('button', { name: 'Отменить' }).click()
  await expect(teacherPage.getByRole('dialog').getByText(/Отменить запись Второй Тест Студент/)).toBeVisible()
  await teacherPage.getByRole('dialog').getByRole('button', { name: 'Отменить запись' }).click()
  await expect(teacherPage.getByTitle('Второй Тест Студент')).toHaveCount(0)
  await expect(studentPage.getByTitle('Второй Тест Студент')).toHaveCount(0)

  await studentPage.getByRole('button', { name: 'Отменить мою запись' }).click()
  await studentPage.getByRole('dialog').getByRole('button', { name: 'Отменить запись' }).click()
  await expect(teacherPage.getByTitle('Живой Тест Студент')).toHaveCount(0)

  await teacherContext.close()
  await studentContext.close()
  await secondStudentContext.close()
  const cleanup = await request.delete(`/api/manage/${session.admin_token}/session`)
  expect(cleanup.status()).toBe(204)
})

test('student and teacher layouts do not overflow on mobile', async ({ browser, request }) => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const response = await request.post('/api/sessions', {
    data: {
      title: '[UX-AUDIT] Мобильная проверка очень длинного названия очереди',
      subject: 'Информационные технологии разработки',
      session_date: tomorrow,
      start_time: '10:00',
      end_time: '12:00',
      room: 'Очень длинное название аудитории ГУК Б-315',
      slot_duration_minutes: 10,
      buffer_minutes: 2,
      max_students: 8,
    },
  })
  expect(response.status()).toBe(201)
  const session = await response.json()
  const booking = await request.post(`/api/sessions/${session.public_token}/bookings`, {
    data: {
      student_name: 'Александр Александрович Очень-Длинная-Фамилия',
      group_name: 'М8О-301Б-23',
      lab_name: 'Лабораторная работа с длинным названием',
      slot_index: 0,
    },
  })
  expect(booking.status()).toBe(201)

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 412, height: 915 }]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    for (const path of [`/q/${session.public_token}`, `/manage/${session.admin_token}`]) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      expect(hasHorizontalOverflow).toBe(false)
    }
    if (viewport.width === 390) {
      await page.goto(`/manage/${session.admin_token}`)
      await expect(page.getByRole('button', { name: 'Опоздал' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible()
      await page.screenshot({ path: `${screenshotDir}/teacher-mobile.png`, fullPage: true })
      await page.goto(`/q/${session.public_token}`)
      await page.screenshot({ path: `${screenshotDir}/student-mobile.png`, fullPage: true })
    }
    await page.goto(`/q/${session.public_token}`)
    await page.getByRole('button', { name: /10:12 Свободно/ }).click()
    const nameInput = page.getByPlaceholder('Иванов Иван Иванович')
    await expect(nameInput).toBeVisible()
    const box = await nameInput.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(40)
    await context.close()
  }
  const cleanup = await request.delete(`/api/manage/${session.admin_token}/session`)
  expect(cleanup.status()).toBe(204)
})

test('creating a second queue is intentional and both remain in local history', async ({ page, request }) => {
  const names = [`[UX-AUDIT] Первая ${Date.now()}`, `[UX-AUDIT] Вторая ${Date.now()}`]
  const adminTokens: string[] = []
  try {
    await page.goto('/')
    await page.getByLabel('Название очереди').fill(names[0])
    await page.getByRole('button', { name: 'Создать очередь', exact: true }).click()
    await expect(page.getByText('Панель преподавателя', { exact: true })).toBeVisible()
    adminTokens.push(new URL(page.url()).pathname.split('/').pop()!)
    await page.goto('/')
    await page.getByRole('button', { name: 'Создать новую очередь' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/У вас уже есть/)).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Вернуться к текущей' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Создать новую' }).click()
    await page.getByLabel('Название очереди').fill(names[1])
    await page.getByRole('button', { name: 'Создать очередь', exact: true }).click()
    await expect(page.getByText('Панель преподавателя', { exact: true })).toBeVisible()
    adminTokens.push(new URL(page.url()).pathname.split('/').pop()!)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ваши очереди' })).toBeVisible()
    const history = page.locator('.recent-queues')
    await expect(history.getByText(names[0])).toBeVisible()
    await expect(history.getByText(names[1])).toBeVisible()
  } finally {
    for (const token of adminTokens) await request.delete(`/api/manage/${token}/session`)
  }
})
