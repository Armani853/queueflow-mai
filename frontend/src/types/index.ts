export type BookingStatus = 'BOOKED' | 'WAITING' | 'CURRENT' | 'PASSED' | 'CANCELLED' | 'LATE'

export interface Booking {
  id: number
  booking_token?: string
  student_name: string
  group_name: string
  lab_name: string
  position: number
  slot_index: number | null
  scheduled_time: string | null
  status: BookingStatus
  notes: string | null
  created_at: string
}

export interface Slot {
  index: number
  time: string
  available: boolean
  booking: Booking | null
}

export interface QueueSession {
  title: string
  subject: string
  session_date: string
  start_time: string
  end_time: string | null
  room: string
  slot_duration_minutes: number
  buffer_minutes: number
  max_students: number
  queue_mode: 'COMPACT' | 'KEEP_TIME'
  is_active: boolean
  public_token: string
  admin_token?: string
  slots: Slot[]
  bookings: Booking[]
  current: Booking | null
  next_booking: Booking | null
}

export interface CreatedSession extends QueueSession {
  admin_token: string
  public_path: string
  manage_path: string
}

export interface SessionCreatePayload {
  title: string
  subject: string
  session_date: string
  start_time: string
  end_time?: string | null
  room: string
  slot_duration_minutes: number
  buffer_minutes: number
  max_students: number
}

