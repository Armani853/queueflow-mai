import type { QueueSession } from '../types'

export interface RememberedTeacherSession {
  adminToken: string
  publicToken: string
  title: string
  subject: string
  sessionDate: string
  room: string
  maxStudents: number
  savedAt: string
}

const STORAGE_KEY = 'queueflow:teacher-queues:v1'
const LEGACY_KEY = 'queueflow:last-teacher-session'
const HISTORY_LIMIT = 5

function isRemembered(value: Partial<RememberedTeacherSession>): value is RememberedTeacherSession {
  return Boolean(value.adminToken && value.publicToken && value.title)
}

export function readRememberedTeacherSessions(): RememberedTeacherSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) return parsed.filter(isRemembered).slice(0, HISTORY_LIMIT)
  } catch {
    // A damaged local cache must never block the landing page.
  }
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const legacy = JSON.parse(raw) as Partial<RememberedTeacherSession>
    if (!isRemembered(legacy)) return []
    return [{ ...legacy, subject: legacy.subject ?? '', sessionDate: legacy.sessionDate ?? '', room: legacy.room ?? '', maxStudents: legacy.maxStudents ?? 0, savedAt: legacy.savedAt ?? new Date().toISOString() }]
  } catch {
    return []
  }
}

export function rememberTeacherSession(session: Omit<RememberedTeacherSession, 'savedAt'>) {
  const next = { ...session, savedAt: new Date().toISOString() }
  const history = readRememberedTeacherSessions().filter((item) => item.adminToken !== session.adminToken)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...history].slice(0, HISTORY_LIMIT)))
  localStorage.removeItem(LEGACY_KEY)
}

export function rememberManagedSession(adminToken: string, session: QueueSession) {
  rememberTeacherSession({ adminToken, publicToken: session.public_token, title: session.title, subject: session.subject, sessionDate: session.session_date, room: session.room, maxStudents: session.max_students })
}

export function forgetTeacherSession(adminToken: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readRememberedTeacherSessions().filter((item) => item.adminToken !== adminToken)))
}

export function queueCode(publicToken: string) {
  return `QF-${publicToken.slice(0, 4).toUpperCase()}`
}
