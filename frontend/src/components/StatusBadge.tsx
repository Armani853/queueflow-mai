import { Check, Clock3, Play, CalendarCheck, Ban, AlarmClock } from 'lucide-react'
import type { BookingStatus } from '../types'

const labels: Record<BookingStatus, string> = {
  BOOKED: 'Записан',
  WAITING: 'Ожидает',
  CURRENT: 'Сейчас',
  PASSED: 'Сдал',
  CANCELLED: 'Отменён',
  LATE: 'Опаздывает',
}

const icons = {
  BOOKED: CalendarCheck,
  WAITING: Clock3,
  CURRENT: Play,
  PASSED: Check,
  CANCELLED: Ban,
  LATE: AlarmClock,
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const Icon = icons[status]
  return <span className={`status status-${status.toLowerCase()}`}><Icon size={13} />{labels[status]}</span>
}

