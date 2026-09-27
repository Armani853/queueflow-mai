import type { APIRequestContext } from '@playwright/test'
import { mkdirSync } from 'node:fs'

mkdirSync('test-results/fix-audit', { recursive: true })

export function futureDate(days = 1) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function sessionPayload(title: string, maxStudents = 5) {
  return {
    title,
    subject: 'FIX audit',
    session_date: futureDate(),
    start_time: '10:00',
    end_time: '12:00',
    room: 'ГУК Б-315',
    slot_duration_minutes: 10,
    buffer_minutes: 2,
    max_students: maxStudents,
  }
}

export async function cleanup(request: APIRequestContext, adminTokens: string[]) {
  for (const token of adminTokens) await request.delete(`/api/manage/${token}/session`)
}
