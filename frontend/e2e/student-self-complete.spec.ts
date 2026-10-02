import { expect, test } from '@playwright/test'
import { cleanup, sessionPayload } from './fixHelpers'

const screenshotDir = 'test-results/fix-audit'

function booking(queue: any, name: string) {
  return queue.bookings.find((item: any) => item.student_name === name)
}

function seconds(value: string) {
  const [hours, minutes, secs] = value.slice(0, 8).split(':').map(Number)
  return hours * 3600 + minutes * 60 + secs
}

test('student completes own CURRENT booking and queue advances from server time', async ({ browser, request }) => {
  const admins: string[] = []
  const created = await request.post('/api/sessions', {
    data: { ...sessionPayload('[SELF-COMPLETE-AUDIT] Самостоятельная очередь', 4), start_time: '10:00', end_time: null },
  })
  expect(created.status()).toBe(201)
  const session = await created.json()
  admins.push(session.admin_token)

  const names = ['Иван', 'Мария', 'Арман', 'Анна']
  const entries: any[] = []
  try {
    for (const [slot_index, student_name] of names.entries()) {
      const response = await request.post(`/api/sessions/${session.public_token}/bookings`, {
        data: { student_name, group_name: 'М8О-301Б-23', lab_name: 'ЛР self-complete', slot_index },
      })
      expect(response.status()).toBe(201)
      entries.push(await response.json())
    }

    const started = await request.patch(`/api/manage/${session.admin_token}/bookings/${entries[0].id}`, {
      data: { status: 'CURRENT' },
    })
    expect(started.status()).toBe(200)

    const teacherContext = await browser.newContext()
    const studentContext = await browser.newContext()
    const teacher = await teacherContext.newPage()
    const student = await studentContext.newPage()
    await teacher.goto(`/manage/${session.admin_token}`)
    await student.goto(`/q/${session.public_token}?booking=${entries[0].booking_token}`)

    await expect(student.getByRole('button', { name: 'Я сдал', exact: true })).toBeVisible()
    await student.getByRole('button', { name: 'Я сдал', exact: true }).click()
    await expect(student.getByRole('dialog')).toContainText('Вы действительно закончили сдачу?')
    await student.screenshot({ path: `${screenshotDir}/student-self-complete-confirm.png`, fullPage: true })

    let completeRequests = 0
    student.on('request', (outgoing) => {
      if (outgoing.method() === 'POST' && outgoing.url().endsWith(`/api/bookings/${entries[0].booking_token}/complete`)) completeRequests += 1
    })
    await student.getByRole('button', { name: 'Да, я сдал' }).evaluate((element: HTMLButtonElement) => {
      for (let index = 0; index < 20; index += 1) element.click()
    })

    await expect(student.getByRole('status')).toHaveText('Готово. Очередь обновлена.')
    await expect(student.getByRole('button', { name: 'Сдано' })).toBeDisabled()
    expect(completeRequests).toBe(1)

    await expect(teacher.locator('.current-card')).toContainText('Мария')
    await student.screenshot({ path: `${screenshotDir}/student-self-complete-passed.png`, fullPage: true })
    await teacher.screenshot({ path: `${screenshotDir}/teacher-after-self-complete.png`, fullPage: true })

    const queueResponse = await request.get(`/api/sessions/${session.public_token}`)
    const queue = await queueResponse.json()
    const ivan = booking(queue, 'Иван')
    const maria = booking(queue, 'Мария')
    const arman = booking(queue, 'Арман')
    const anna = booking(queue, 'Анна')
    expect(ivan.status).toBe('PASSED')
    expect(ivan.actual_finished_at).toBeTruthy()
    expect(maria.status).toBe('CURRENT')
    const finishedTime = ivan.actual_finished_at.split('T')[1]
    expect(seconds(maria.scheduled_time) - seconds(finishedTime)).toBe(120)
    expect(seconds(arman.scheduled_time) - seconds(maria.scheduled_time)).toBe(720)
    expect(seconds(anna.scheduled_time) - seconds(arman.scheduled_time)).toBe(720)

    const repeated = await Promise.all([
      request.post(`/api/bookings/${entries[0].booking_token}/complete`),
      request.post(`/api/bookings/${entries[0].booking_token}/complete`),
    ])
    expect(repeated.map((response) => response.status())).toEqual([200, 200])
    const unchanged = await (await request.get(`/api/sessions/${session.public_token}`)).json()
    expect(booking(unchanged, 'Мария').scheduled_time).toBe(maria.scheduled_time)

    const mariaContext = await browser.newContext()
    const mariaPage = await mariaContext.newPage()
    await mariaPage.goto(`/q/${session.public_token}?booking=${entries[1].booking_token}`)
    await expect(mariaPage.getByRole('button', { name: 'Я сдал', exact: true })).toBeVisible()
    await mariaPage.getByRole('button', { name: 'Я сдал', exact: true }).click()
    await mariaPage.getByRole('button', { name: 'Да, я сдал' }).click()
    await expect(mariaPage.getByRole('status')).toHaveText('Готово. Очередь обновлена.')
    await expect(teacher.locator('.current-card')).toContainText('Арман')
    await mariaContext.close()
    await teacherContext.close()
    await studentContext.close()
  } finally {
    await cleanup(request, admins)
  }
})
