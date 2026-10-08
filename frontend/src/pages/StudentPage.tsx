import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, MapPin, RefreshCw, SearchX, TicketCheck, UserRound, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { CopyButton } from '../components/CopyButton'
import { Layout } from '../components/Layout'
import { QueueList } from '../components/QueueList'
import type { Booking, QueueSession } from '../types'
import { queueCode } from '../lib/teacherSession'
import { useDialogKeyboard } from '../lib/useDialogKeyboard'

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
  const [bookingRestoreError, setBookingRestoreError] = useState('')
  const [bookingFieldError, setBookingFieldError] = useState<'student_name' | 'group_name' | 'lab_name' | null>(null)
  const [updated, setUpdated] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeSuccess, setCompleteSuccess] = useState('')
  const [networkError, setNetworkError] = useState(false)
  const submittingRef = useRef(false)
  const completingRef = useRef(false)
  useDialogKeyboard(confirmCancel || confirmComplete, () => { setConfirmCancel(false); if (!completing) setConfirmComplete(false) })

  useEffect(() => {
    if (!session || confirmation || selectedSlot === null) return
    if (session.slots.some((slot) => slot.index === selectedSlot && slot.available)) return
    setSelectedSlot(null)
    setError('Выбранное время больше недоступно. Выберите другой свободный слот.')
  }, [session, confirmation, selectedSlot])

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
      setConfirmation((current) => {
        if (!current) return current
        const refreshed = next.bookings.find((booking) => booking.id === current.id)
        return refreshed ? { ...refreshed, booking_token: current.booking_token } : current
      })
      setNetworkError(false)
      if (!quiet) setError('')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить очередь')
      setNetworkError(reason instanceof ApiError && reason.status === 0)
    } finally {
      setLoading(false)
    }
  }, [token])

  const restoreBooking = useCallback(async (secret: string) => {
    try {
      const booking = await api.readBooking(secret)
      if (booking.status !== 'CANCELLED') setConfirmation(booking)
      setBookingRestoreError('')
      setNetworkError(false)
      setError('')
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        localStorage.removeItem(`queueflow:${token}`)
        setBookingToken('')
        setBookingRestoreError('')
      } else {
        setBookingRestoreError(reason instanceof ApiError ? reason.message : 'Не удалось восстановить запись. Повторите попытку.')
      }
    }
  }, [token])

  useEffect(() => {
    void load()
    if (bookingToken) {
      localStorage.setItem(`queueflow:${token}`, bookingToken)
      void restoreBooking(bookingToken)
    }
    const interval = window.setInterval(() => void load(true), 2000)
    return () => window.clearInterval(interval)
  }, [load, restoreBooking, token])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (selectedSlot === null || submittingRef.current) return
    const formElement = event.currentTarget as HTMLFormElement
    const invalid = (field: 'student_name' | 'group_name' | 'lab_name', message: string) => {
      setBookingFieldError(field)
      setError(message)
      formElement.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus()
    }
    if (!form.student_name.trim()) return invalid('student_name', 'Введите ФИО студента.')
    if (!form.group_name.trim()) return invalid('group_name', 'Укажите группу.')
    if (!form.lab_name.trim()) return invalid('lab_name', 'Укажите лабораторную работу.')
    setBookingFieldError(null)
    submittingRef.current = true
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
      const message = reason instanceof ApiError ? reason.message : 'Не удалось записаться'
      if (reason instanceof ApiError && reason.status === 409) setSelectedSlot(null)
      await load(true)
      setError(message)
    } finally {
      submittingRef.current = false
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
      setSelectedSlot(null)
      setConfirmation(null)
      setError('Запись отменена')
      await load()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отменить запись')
    } finally {
      setSubmitting(false)
    }
  }

  async function complete() {
    if (!bookingToken || completingRef.current) return
    completingRef.current = true
    setCompleting(true)
    setError('')
    setCompleteSuccess('')
    try {
      const next = await api.completeBooking(bookingToken)
      setSession(next)
      const completed = next.bookings.find((booking) => booking.id === confirmation?.id)
      if (completed) setConfirmation({ ...completed, booking_token: bookingToken })
      setConfirmComplete(false)
      setCompleteSuccess('Готово. Очередь обновлена.')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отметить сдачу')
      setConfirmComplete(false)
    } finally {
      completingRef.current = false
      setCompleting(false)
    }
  }

  if (loading) return <Layout><div className="page-loading"><span className="spinner" /><strong>Подключаемся к серверу</strong><span>Первый ответ иногда занимает до минуты. Если соединение не удастся, появится кнопка повтора.</span></div></Layout>
  if (!session) return <Layout><div className="not-found"><SearchX size={42} /><span className="eyebrow">Не удалось открыть очередь</span><h1>{networkError ? 'Сервер пока не ответил' : 'Эта очередь не найдена или больше недоступна'}</h1><p>{networkError ? 'Сервис может запускаться до минуты. Повторите попытку.' : 'Проверьте адрес или запросите новую ссылку у преподавателя.'}</p><div className="button-row">{networkError && <button className="button button-primary" onClick={() => { setLoading(true); void load(); if (bookingToken) void restoreBooking(bookingToken) }}><RefreshCw size={17} /> Повторить</button>}<Link className="button button-secondary" to="/">На главную</Link></div></div></Layout>

  if (confirmation) {
    const personalUrl = `${window.location.origin}/q/${token}?booking=${encodeURIComponent(bookingToken)}`
    return (
      <Layout>
        <section className="confirmation-card panel">
          <div className="confirmation-icon"><CheckCircle2 /></div>
          <span className="eyebrow">{confirmation.status === 'PASSED' ? 'Сдача завершена' : 'Место подтверждено'}</span>
          <h1>{confirmation.status === 'PASSED' ? 'Вы сдали' : 'Вы записаны'}</h1>
          <span className="queue-identity">Очередь {queueCode(session.public_token)}</span>
          <p className="confirmation-context">{session.title} · {session.subject}</p>
          <p><strong>{confirmation.student_name}</strong><br />Очередь обновляется автоматически.</p>
          <span className={`personal-status personal-status-${confirmation.status.toLowerCase()}`}>{confirmation.status === 'PASSED' ? 'Сдано' : confirmation.status === 'CURRENT' ? 'Сейчас сдаёт' : 'Ожидает'}</span>
          {completeSuccess && <div className="success-banner" role="status">{completeSuccess}</div>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="confirmation-time-label">{confirmation.status === 'PASSED' ? 'Время записи' : 'Ориентировочное время'}</div>
          <div className="confirmation-time">{confirmation.scheduled_time?.slice(0, 5)}</div>
          <div className="confirmation-details">
            <div><CalendarDays /><span>Дата<strong>{dateFormatter.format(new Date(`${session.session_date}T00:00:00`))}</strong></span></div>
            <div><MapPin /><span>Аудитория<strong>{session.room}</strong></span></div>
            <div><TicketCheck /><span>Позиция<strong>№ {confirmation.position}</strong></span></div>
            <div><UserRound /><span>Лабораторная<strong>{confirmation.lab_name}</strong></span></div>
          </div>
          {confirmation.status === 'CURRENT' && session.is_active && <div className="self-complete-box"><strong>Закончили сдачу?</strong><span>Подтвердите завершение — следующий студент станет текущим автоматически.</span><button className="button button-success button-large" disabled={completing} onClick={() => setConfirmComplete(true)}><CheckCircle2 size={19} /> Я сдал</button></div>}
          <div className="personal-link">
            <strong>Сохраните личную ссылку</strong>
            <span>Она вернёт вас к записи после закрытия браузера. Не пересылайте её другим.</span>
            <div className="url-box">{personalUrl}</div>
            <CopyButton value={personalUrl} label="Копировать личную ссылку" />
          </div>
          {!['PASSED', 'CANCELLED'].includes(confirmation.status) && <button className="button button-danger-text" disabled={submitting || completing} onClick={() => setConfirmCancel(true)}>Отменить мою запись</button>}
        </section>
        <section className="section-block"><div className="section-title"><div><span>Live</span><h2>Актуальная очередь</h2><small className="live-caption"><span className="pulse-dot" /> Онлайн · обновляется автоматически</small></div>{updated && <div className="update-toast"><RefreshCw size={14} /> Очередь обновилась</div>}</div><QueueList bookings={session.bookings} /></section>
        {confirmCancel && <div className="modal-backdrop"><div className="modal panel confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setConfirmCancel(false)}><X /></button><h2>Отменить вашу запись?</h2><p>Ваше место освободится, а следующие студенты автоматически сдвинутся вперёд.</p><div className="button-row"><button className="button button-secondary" onClick={() => setConfirmCancel(false)}>Назад</button><button className="button button-danger-text" onClick={() => { setConfirmCancel(false); void cancel() }}>Отменить запись</button></div></div></div>}
        {confirmComplete && <div className="modal-backdrop"><div className="modal panel confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" disabled={completing} onClick={() => setConfirmComplete(false)}><X /></button><h2>Вы действительно закончили сдачу?</h2><p>Время остальных участников очереди будет пересчитано от фактического времени завершения.</p><div className="button-row"><button className="button button-secondary" disabled={completing} onClick={() => setConfirmComplete(false)}>Отмена</button><button className="button button-success" disabled={completing} onClick={() => void complete()}>{completing ? <><span className="spinner" /> Отмечаем сдачу...</> : 'Да, я сдал'}</button></div></div></div>}
      </Layout>
    )
  }

  return (
    <Layout wide>
      <section className="student-header">
        <div><span className="eyebrow"><span className="pulse-dot" /> QueueFlow · Студент</span><span className="queue-identity">Очередь {queueCode(session.public_token)}</span><h1>{session.title}</h1><p>{session.subject}</p><small className="student-role-note">Это общая очередь группы. После записи ваше имя появится здесь и в панели преподавателя.</small></div>
        <div className="session-facts"><div><CalendarDays /><span>{dateFormatter.format(new Date(`${session.session_date}T00:00:00`))}</span></div><div><MapPin /><span>{session.room}</span></div><div><Clock3 /><span>{session.slot_duration_minutes} мин + {session.buffer_minutes} мин буфер</span></div></div>
      </section>
      {error === 'Запись отменена' && <div className="success-banner">{error}</div>}
      {!session.is_active ? <><section className="panel closed-state"><CheckCircle2 /><span className="eyebrow">Очередь {queueCode(session.public_token)}</span><h2>Эта очередь закрыта</h2><p>Преподаватель завершил запись. Итоговый список остаётся доступен ниже.</p></section><section className="section-block compact-queue"><div className="section-title"><div><span>Итоги</span><h2>Очередь</h2></div></div><QueueList bookings={session.bookings} /></section></> : <><div className="student-grid">
        <section className="panel slots-panel">
          <div className="section-title"><div><span>Шаг 1</span><h2>Выберите свободное время</h2></div><span className="availability">{session.slots.filter((slot) => slot.available).length} свободно</span></div>
          <div className="slots-grid">
            {session.slots.map((slot) => <button key={slot.index} className={`slot ${selectedSlot === slot.index ? 'slot-selected' : ''}`} disabled={!slot.available} onClick={() => setSelectedSlot(slot.index)}><strong>{slot.time.slice(0, 5)}</strong><span>{slot.available ? selectedSlot === slot.index ? 'Выбрано' : 'Свободно' : 'Занято'}</span></button>)}
          </div>
          {!session.slots.some((slot) => slot.available) && <div className="empty-inline">Свободных мест пока нет</div>}
        </section>
        <form className="panel booking-form" onSubmit={submit} noValidate>
          <div className="section-title"><div><span>Шаг 2</span><h2>Подтвердите запись</h2></div></div>
          {error && error !== 'Запись отменена' && <div className="error-banner" role="alert">{error}</div>}
          {bookingRestoreError && <div className="error-banner" role="alert">{bookingRestoreError}<button type="button" className="button button-secondary" onClick={() => void restoreBooking(bookingToken)}>Восстановить мою запись</button></div>}
          {selectedSlot === null ? <div className="form-placeholder"><Clock3 /><p>Сначала выберите свободный слот слева</p></div> : <><div className="selected-time"><span>Ваше время</span><strong>{session.slots[selectedSlot]?.time.slice(0, 5)}</strong></div><label className="field"><span>ФИО</span><input name="student_name" placeholder="Иванов Иван Иванович" value={form.student_name} maxLength={120} onChange={(e) => { setForm({ ...form, student_name: e.target.value }); setBookingFieldError(null); setError('') }} aria-invalid={bookingFieldError === 'student_name'} required /></label><label className="field"><span>Группа</span><input name="group_name" placeholder="М8О-301Б-23" value={form.group_name} maxLength={40} onChange={(e) => { setForm({ ...form, group_name: e.target.value }); setBookingFieldError(null); setError('') }} aria-invalid={bookingFieldError === 'group_name'} required /></label><label className="field"><span>Лабораторная</span><input name="lab_name" placeholder="ЛР 1.3" value={form.lab_name} maxLength={120} onChange={(e) => { setForm({ ...form, lab_name: e.target.value }); setBookingFieldError(null); setError('') }} aria-invalid={bookingFieldError === 'lab_name'} required /></label><button className="button button-primary button-large" disabled={submitting}>{submitting ? <span className="spinner" /> : <TicketCheck size={18} />}{submitting ? 'Записываем…' : 'Записаться'}</button></>}
        </form>
      </div>
      <section className="section-block compact-queue"><div className="section-title"><div><span>Live</span><h2>Очередь сейчас</h2><small className="live-caption"><span className="pulse-dot" /> Онлайн · обновляется автоматически</small></div>{updated && <div className="update-toast"><RefreshCw size={14} /> Очередь обновилась</div>}</div><QueueList bookings={session.bookings} /></section>
      </>}
    </Layout>
  )
}
