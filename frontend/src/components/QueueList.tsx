import { UsersRound } from 'lucide-react'
import type { Booking } from '../types'
import { StatusBadge } from './StatusBadge'

export function QueueList({ bookings, actions }: { bookings: Booking[]; actions?: (booking: Booking) => React.ReactNode }) {
  if (!bookings.length) {
    return <div className="empty-state"><UsersRound size={34} /><strong>Очередь пока пуста</strong><span>Первая запись появится здесь автоматически</span></div>
  }
  return (
    <div className="queue-list">
      {bookings.map((booking) => (
        <article className={`queue-row ${booking.status === 'CURRENT' ? 'queue-current' : ''}`} data-booking-id={booking.id} key={booking.id}>
          <div className="queue-position">{String(booking.position).padStart(2, '0')}</div>
          <div className="queue-time">{booking.scheduled_time?.slice(0, 5) ?? '—'}</div>
          <div className="queue-person">
            <strong title={booking.student_name}>{booking.student_name}</strong>
            <span>{booking.group_name} · {booking.lab_name}</span>
          </div>
          <StatusBadge status={booking.status} />
          {actions && <div className="queue-actions">{actions(booking)}</div>}
        </article>
      ))}
    </div>
  )
}
