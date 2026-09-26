export interface RememberedTeacherSession {
  adminToken: string
  publicToken: string
  title: string
  savedAt: string
}

const STORAGE_KEY = 'queueflow:last-teacher-session'

export function rememberTeacherSession(session: Omit<RememberedTeacherSession, 'savedAt'>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, savedAt: new Date().toISOString() }))
}

export function readRememberedTeacherSession(): RememberedTeacherSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<RememberedTeacherSession>
    if (!value.adminToken || !value.publicToken || !value.title) return null
    return value as RememberedTeacherSession
  } catch {
    return null
  }
}

export function queueCode(publicToken: string) {
  return publicToken.slice(0, 6).toUpperCase()
}
