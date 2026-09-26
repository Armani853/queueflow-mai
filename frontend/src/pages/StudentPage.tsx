import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, MapPin, RefreshCw, TicketCheck, UserRound, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { CopyButton } from '../components/CopyButton'
import { Layout } from '../components/Layout'
import { QueueList } from '../components/QueueList'
import type { Booking, QueueSession } from '../types'
import { queueCode } from '../lib/teacherSession'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

export function StudentPage() {
  const { token = '' } = useParams()
  const [session, setSession] = useState<QueueSession | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [form, setForm] = useState({ student_name: '', group_name: '', lab_name: '' })
  const [confirmation, setConfirmation] = useState<Booking | null>(null)
  const [bookingToken, setBookingToken] = useState(() => {
    const linkToken = new URLSearchParams(window.location.search).get('booking')
    return linkToken ?? localStorage.getItem(`queueflow:${token}`) ?? ''
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const load = useCallback(async (quiet = false) => {
    try {
      const next = await api.publicSession(token)
      setSession((current) => {
        if (quiet && current && JSON.stringify(current.bookings) !== JSON.stringify(next.bookings)) {
          setUpdated(true)
          window.setTimeout(() => setUpdated(false), 1800)
        }
        return next
      })
      setError('')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить очередь')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
    if (bookingToken) {
      localStorage.setItem(`queueflow:${token}`, bookingToken)
      void api.readBooking(bookingToken).then((booking) => {
        if (booking.status !== 'CANCELLED') setConfirmation(booking)
      }).catch(() => {
        localStorage.removeItem(`queueflow:${token}`)
        setBookingToken('')
      })
    }
    const interval = window.setInterval(() => void load(true), 2000)
    return () => window.clearInterval(interval)
  }, [load, token])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (selectedSlot === null || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const booking = await api.createBooking(token, { ...form, slot_index: selectedSlot })
      setConfirmation(booking)
      if (booking.booking_token) {
        localStorage.setItem(`queueflow:${token}`, booking.booking_token)
        setBookingToken(booking.booking_token)
      }
      await load()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось записаться')
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel() {
    if (!bookingToken) return
    setSubmitting(true)
    try {
      await api.cancelBooking(bookingToken)
      localStorage.removeItem(`queueflow:${token}`)
      setBookingToken('')
      setConfirmation(null)
      setError('Запись отменена')
      await load()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отменить запись')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Layout><div className="page-loading"><span className="spinner" /><strong>Сервис запускается</strong><span>На бесплатном сервере первая загрузка может занять до минуты.</span></div></Layout>
  if (!session) return <Layout><div className="not-found"><h1>Сессия не найдена</h1><p>{error || 'Проверьте ссылку у преподавателя.'}</p></div></Layout>

  if (confirmation) {
    const personalUrl = `${window.location.origin}/q/${token}?booking=${encodeURIComponent(bookingToken)}`
    return (
      <Layout>
        <section className="confirmation-card panel">
          <div className="confirmation-icon"><CheckCircle2 /></div>
          <span className="eyebrow">Место подтверждено</span>
          <h1>Вы записаны</h1>
          <span className="queue-identity">Очередь {queueCode(session.public_token)}</span>
          <p><strong>{confirmation.student_name}</strong><br />Сохраните эту страницу: очередь обновляется автоматически.</p>
          <div className="confirmation-time">{confirmation.scheduled_time?.slice(0, 5)}</div>
          <div className="confirmation-details">
            <div><CalendarDays /><span>Дата<strong>{dateFormatter.format(new Date(`${session.session_date}T00:00:00`))}</strong></span></div>
            <div><MapPin /><span>Аудитория<strong>{session.room}</strong></span></div>
            <div><TicketCheck /><span>Позиция<strong>№ {confirmation.position}</strong></span></div>
            <div><UserRound /><span>Лабораторная<strong>{confirmation.lab_name}</strong></span></div>
          </div>
          <div className="personal-link">
            <strong>Сохраните личную ссылку</strong>
            <span>Она вернёт вас к записи после закрытия браузера. Не пересылайте её другим.</span>
            <div className="url-box">{personalUrl}</div>
            <CopyButton value={personalUrl} label="Копировать личную ссылку" />
          </div>
          <button className="button button-danger-text" disabled={submitting} onClick={() => setConfirmCancel(true)}>Отменить мою запись</button>
        </section>
        <section className="section-block"><div className="section-title"><div><span>Live</span><h2>Актуальная очередь</h2><small className="live-caption"><span className="pulse-dot" /> Онлайн · обновляется автоматически</small></div>{updated && <div className="update-toast"><RefreshCw size={14} /> Очередь обновилась</div>}</div><QueueList bookings={session.bookings} /></section>
        {confirmCancel && <div className="modal-backdrop"><div className="modal panel confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setConfirmCancel(false)}><X /></button><h2>Отменить вашу запись?</h2><p>Ваше место освободится, а следующие студенты автоматически сдвинутся вперёд.</p><div className="button-row"><button className="button button-secondary" onClick={() => setConfirmCancel(false)}>Назад</button><button className="button button-danger-text" onClick={() => { setConfirmCancel(false); void cancel() }}>Отменить запись</button></div></div></div>}
      </Layout>
    )
  }

  return (
    <Layout wide>
      <section className="student-header">
        <div><span className="eyebrow"><span className="pulse-dot" /> QueueFlow · Студент</span><span className="queue-identity">Очередь {queueCode(session.public_token)}</span><h1>{session.title}</h1><p>{session.subject}</p><small className="student-role-note">Это общая очередь группы. После записи ваше имя появится здесь и в панели преподавателя.</small></div>
        <div className="session-facts"><div><CalendarDays /><span>{dateFormatter.format(new Date(`${session.session_date}T00:00:00`))}</span></div><div><MapPin /><span>{session.room}</span></div><div><Clock3 /><span>{session.slot_duration_minutes} мин + {session.buffer_minutes} мин буфер</span></div></div>
      </section>
      {error && <div className={error === 'Запись отменена' ? 'success-banner' : 'error-banner'}>{error}</div>}
      <div className="student-grid">
        <section className="panel slots-panel">
          <div className="section-title"><div><span>Шаг 1</span><h2>Выберите свободное время</h2></div><span className="availability">{session.slots.filter((slot) => slot.available).length} свободно</span></div>
          <div className="slots-grid">
            {session.slots.map((slot) => <button key={slot.index} className={`slot ${selectedSlot === slot.index ? 'slot-selected' : ''}`} disabled={!slot.available} onClick={() => setSelectedSlot(slot.index)}><strong>{slot.time.slice(0, 5)}</strong><span>{slot.available ? selectedSlot === slot.index ? 'Выбрано' : 'Свободно' : 'Занято'}</span></button>)}
          </div>
          {!session.slots.some((slot) => slot.available) && <div className="empty-inline">Свободных мест пока нет</div>}
        </section>
        <form className="panel booking-form" onSubmit={submit}>
          <div className="section-title"><div><span>Шаг 2</span><h2>Подтвердите запись</h2></div></div>
          {selectedSlot === null ? <div className="form-placeholder"><Clock3 /><p>Сначала выберите свободный слот слева</p></div> : <><div className="selected-time"><span>Ваше время</span><strong>{session.slots[selectedSlot]?.time.slice(0, 5)}</strong></div><label className="field"><span>ФИО</span><input placeholder="Иванов Иван Иванович" value={form.student_name} maxLength={120} onChange={(e) => setForm({ ...form, student_name: e.target.value })} required /></label><label className="field"><span>Группа</span><input placeholder="М8О-301Б-23" value={form.group_name} maxLength={40} onChange={(e) => setForm({ ...form, group_name: e.target.value })} required /></label><label className="field"><span>Лабораторная</span><input placeholder="ЛР 1.3" value={form.lab_name} maxLength={120} onChange={(e) => setForm({ ...form, lab_name: e.target.value })} required /></label><button className="button button-primary button-large" disabled={submitting}>{submitting ? <span className="spinner" /> : <TicketCheck size={18} />}{submitting ? 'Проверяем слот…' : 'Записаться'}</button></>}
        </form>
      </div>
      <section className="section-block compact-queue"><div className="section-title"><div><span>Live</span><h2>Очередь сейчас</h2><small className="live-caption"><span className="pulse-dot" /> Онлайн · обновляется автоматически</small></div>{updated && <div className="update-toast"><RefreshCw size={14} /> Очередь обновилась</div>}</div><QueueList bookings={session.bookings} /></section>
    </Layout>
  )
}
