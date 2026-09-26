import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlarmClock, CalendarDays, Check, ChevronDown, Clock3, Copy, Download, MapPin, PauseCircle, Play, QrCode, RefreshCw, Settings2, ShieldCheck, UsersRound, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { Layout } from '../components/Layout'
import { QueueList } from '../components/QueueList'
import { QrShare } from '../components/QrShare'
import { CopyButton } from '../components/CopyButton'
import { queueCode, rememberTeacherSession } from '../lib/teacherSession'
import type { Booking, BookingStatus, QueueSession } from '../types'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

export function TeacherPage() {
  const { token = '' } = useParams()
  const [session, setSession] = useState<QueueSession | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [updated, setUpdated] = useState(false)

  const load = useCallback(async (quiet = false) => {
    try {
      const next = await api.manageSession(token)
      rememberTeacherSession({ adminToken: token, publicToken: next.public_token, title: next.title })
      setSession((current) => {
        if (quiet && current && JSON.stringify(current.bookings) !== JSON.stringify(next.bookings)) {
          setUpdated(true)
          window.setTimeout(() => setUpdated(false), 1800)
        }
        return next
      })
      setError('')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить панель')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(true), 2000)
    return () => window.clearInterval(interval)
  }, [load])

  async function changeStatus(booking: Booking, status: BookingStatus) {
    setBusyId(booking.id)
    try {
      await api.updateBooking(token, booking.id, status)
      await load()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить статус')
    } finally {
      setBusyId(null)
    }
  }

  async function move(booking: Booking) {
    setBusyId(booking.id)
    try {
      await api.moveBooking(token, booking.id)
      await load()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перенести студента')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <Layout><div className="page-loading"><span className="spinner" /><strong>Сервис запускается</strong><span>На бесплатном сервере первая загрузка может занять до минуты.</span></div></Layout>
  if (!session) return <Layout><div className="not-found"><ShieldCheck size={42} /><h1>Панель не найдена</h1><p>{error || 'Проверьте секретную ссылку.'}</p></div></Layout>

  const remaining = session.bookings.filter((booking) => ['BOOKED', 'WAITING', 'CURRENT'].includes(booking.status)).length

  return (
    <Layout wide>
      <section className="dashboard-heading">
        <div><span className="eyebrow"><ShieldCheck size={14} /> Панель преподавателя · код {queueCode(session.public_token)}</span><h1>{session.title}</h1><p>{session.subject}</p></div>
        <div className="dashboard-buttons"><a className="button button-secondary" href={`/api/manage/${token}/export.csv`} download><Download size={17} /> CSV</a><button className="button button-secondary" onClick={() => setShowShare(true)}><Copy size={17} /> Поделиться</button><button className="button button-secondary" onClick={() => setShowSettings(!showSettings)}><Settings2 size={17} /> Настройки</button></div>
      </section>
      <section className="role-guide panel">
        <div><strong>Вы управляете очередью</strong><span>Студентам отправьте эту ссылку. Все записи из неё появляются ниже автоматически.</span><code>{`${window.location.origin}/q/${session.public_token}`}</code></div>
        <CopyButton value={`${window.location.origin}/q/${session.public_token}`} label="Копировать ссылку студентам" />
      </section>
      <section className="stat-grid">
        <div className="stat-card"><CalendarDays /><span>Дата<strong>{dateFormatter.format(new Date(`${session.session_date}T00:00:00`))}</strong></span></div>
        <div className="stat-card"><MapPin /><span>Аудитория<strong>{session.room}</strong></span></div>
        <div className="stat-card"><UsersRound /><span>Записано<strong>{session.bookings.length} / {session.max_students}</strong></span></div>
        <div className="stat-card"><Clock3 /><span>Осталось<strong>{remaining} студентов</strong></span></div>
      </section>
      {error && <div className="error-banner">{error}</div>}
      {showSettings && <SettingsPanel session={session} token={token} onSaved={() => { setShowSettings(false); void load() }} onError={setError} />}
      <section className="now-grid">
        <div className="now-card current-card">
          <span className="now-label"><span className="pulse-dot" /> Сейчас сдаёт</span>
          {session.current ? <><div className="now-time">{session.current.scheduled_time?.slice(0, 5)}</div><h2>{session.current.student_name}</h2><p>{session.current.group_name} · {session.current.lab_name}</p><button className="button button-success" onClick={() => changeStatus(session.current!, 'PASSED')}><Check size={17} /> Отметить «Сдал»</button></> : <><div className="now-empty"><PauseCircle /><h2>Сдача не начата</h2><p>Выберите студента в очереди и нажмите «Начать»</p></div></>}
        </div>
        <div className="now-card next-card">
          <span className="now-label">Следующий</span>
          {session.next_booking ? <><div className="next-time">{session.next_booking.scheduled_time?.slice(0, 5)}</div><h2>{session.next_booking.student_name}</h2><p>{session.next_booking.group_name} · {session.next_booking.lab_name}</p></> : <div className="now-empty"><Check /><h2>Никого нет</h2><p>Очередь закончилась или ещё пуста</p></div>}
        </div>
      </section>
      <section className="panel dashboard-queue">
        <div className="section-title"><div><span>Live-режим</span><h2>Очередь на сдачу</h2></div><div className="queue-meta">{updated && <span className="update-toast"><RefreshCw size={14} /> Обновлено</span>}<span>Шаг {session.slot_duration_minutes + session.buffer_minutes} мин</span></div></div>
        <QueueList bookings={session.bookings} actions={(booking) => <BookingActions booking={booking} busy={busyId === booking.id} onStatus={(status) => changeStatus(booking, status)} onMove={() => move(booking)} />} />
      </section>
      {showShare && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowShare(false)}><div className="modal panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowShare(false)}><X /></button><div className="panel-heading"><div className="icon-box"><QrCode /></div><div><span>Для студентов</span><h2>Ссылка на очередь</h2></div></div><QrShare publicPath={`/q/${session.public_token}`} size={180} /></div></div>}
    </Layout>
  )
}

function BookingActions({ booking, busy, onStatus, onMove }: { booking: Booking; busy: boolean; onStatus: (status: BookingStatus) => void; onMove: () => void }) {
  if (busy) return <span className="spinner" />
  if (booking.status === 'LATE') return <button className="mini-button move" title="В ближайший свободный слот" onClick={onMove}><RefreshCw /> Перенести</button>
  if (booking.status === 'PASSED') return <span className="completed-label"><Check /> Готово</span>
  return <div className="action-group"><button className="mini-button start" title="Начать сдачу" onClick={() => onStatus('CURRENT')}><Play /> Начать</button><button className="icon-button late" title="Опоздал" onClick={() => onStatus('LATE')}><AlarmClock /></button><button className="icon-button cancel" title="Отменить" onClick={() => onStatus('CANCELLED')}><X /></button><button className="icon-button dropdown" title="Другие действия"><ChevronDown /></button></div>
}

function SettingsPanel({ session, token, onSaved, onError }: { session: QueueSession; token: string; onSaved: () => void; onError: (value: string) => void }) {
  const initial = useMemo(() => ({ room: session.room, slot_duration_minutes: session.slot_duration_minutes, buffer_minutes: session.buffer_minutes, max_students: session.max_students, is_active: session.is_active }), [session])
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try { await api.updateSession(token, form); onSaved() } catch (reason) { onError(reason instanceof ApiError ? reason.message : 'Не удалось сохранить настройки') } finally { setSaving(false) }
  }
  return <form className="panel settings-panel" onSubmit={save}><div className="section-title"><div><span>Параметры</span><h2>Настройки очереди</h2></div></div><div className="settings-grid"><label className="field"><span>Аудитория</span><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></label><label className="field"><span>Слот, мин</span><input type="number" min="1" value={form.slot_duration_minutes} onChange={(e) => setForm({ ...form, slot_duration_minutes: Number(e.target.value) })} /></label><label className="field"><span>Буфер, мин</span><input type="number" min="0" value={form.buffer_minutes} onChange={(e) => setForm({ ...form, buffer_minutes: Number(e.target.value) })} /></label><label className="field"><span>Лимит</span><input type="number" min="1" value={form.max_students} onChange={(e) => setForm({ ...form, max_students: Number(e.target.value) })} /></label><label className="switch-field"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span className="switch" /><span>Запись открыта</span></label><button className="button button-primary" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></div></form>
}
