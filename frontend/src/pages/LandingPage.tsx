import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Link2, MapPin, RefreshCw, ShieldCheck, Sparkles, UsersRound, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { CopyButton } from '../components/CopyButton'
import { Layout } from '../components/Layout'
import { forgetTeacherSession, queueCode, readRememberedTeacherSessions, rememberTeacherSession, type RememberedTeacherSession } from '../lib/teacherSession'
import { useDialogKeyboard } from '../lib/useDialogKeyboard'
import type { QueueSession, SessionCreatePayload } from '../types'

function moscowDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
function moscowMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Number(parts.find((item) => item.type === 'hour')?.value) * 60 + Number(parts.find((item) => item.type === 'minute')?.value)
}
function tomorrow() { return moscowDateValue(new Date(Date.now() + 86_400_000)) }
const initialForm: SessionCreatePayload = { title: 'Сдача лабораторных', subject: 'Численные методы', session_date: tomorrow(), start_time: '12:00', end_time: '14:00', room: 'ГУК Б-315', slot_duration_minutes: 10, buffer_minutes: 2, max_students: 10 }
type SavedQueue = RememberedTeacherSession & { session?: QueueSession; networkError?: boolean }
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
type CreateField = keyof SessionCreatePayload

export function LandingPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [queues, setQueues] = useState<SavedQueue[]>([])
  const [checking, setChecking] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [recovery, setRecovery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [validationError, setValidationError] = useState<{ field: CreateField; message: string } | null>(null)
  const [recoveryError, setRecoveryError] = useState('')
  const submittingRef = useRef(false)
  const requestIdRef = useRef('')
  const today = moscowDateValue()
  useDialogKeyboard(confirmCreate, () => setConfirmCreate(false))

  async function verifySaved() {
    setChecking(true)
    const saved = readRememberedTeacherSessions()
    const checked = await Promise.all(saved.map(async (item): Promise<SavedQueue | null> => {
      try { return { ...item, session: await api.manageSession(item.adminToken) } }
      catch (reason) {
        if (reason instanceof ApiError && reason.status === 404) { forgetTeacherSession(item.adminToken); return null }
        return { ...item, networkError: true }
      }
    }))
    const live = checked.filter((item): item is SavedQueue => item !== null)
    setQueues(live)
    setShowCreate(!live.some((item) => item.networkError || item.session?.is_active !== false))
    setChecking(false)
  }

  useEffect(() => { void verifySaved() }, [])

  function setField<K extends keyof SessionCreatePayload>(key: K, value: SessionCreatePayload[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    if (validationError?.field === key) setValidationError(null)
    if (error) setError('')
    requestIdRef.current = ''
  }

  function fieldIssue(key: CreateField) {
    return validationError?.field === key ? <small className="field-error" id={`create-${key}-error`} role="alert">{validationError.message}</small> : null
  }

  function invalidProps(key: CreateField) {
    return { 'aria-invalid': validationError?.field === key, 'aria-describedby': validationError?.field === key ? `create-${key}-error` : undefined }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    const formElement = event.currentTarget as HTMLFormElement
    const fail = (field: CreateField, message: string) => {
      setValidationError({ field, message })
      setError('')
      window.requestAnimationFrame(() => formElement.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus())
    }
    if (form.title.trim().length < 2) return fail('title', 'Введите название очереди (не менее двух символов).')
    if (form.subject.trim().length < 2) return fail('subject', 'Укажите предмет (не менее двух символов).')
    if (!form.session_date) return fail('session_date', 'Выберите дату сдачи.')
    if (!form.start_time) return fail('start_time', 'Укажите время начала.')
    if (!form.room.trim()) return fail('room', 'Укажите аудиторию.')
    if (!Number.isInteger(form.slot_duration_minutes) || form.slot_duration_minutes < 1 || form.slot_duration_minutes > 180) return fail('slot_duration_minutes', 'Слот должен длиться от 1 до 180 минут.')
    if (!Number.isInteger(form.buffer_minutes) || form.buffer_minutes < 0 || form.buffer_minutes > 60) return fail('buffer_minutes', 'Буфер должен быть от 0 до 60 минут.')
    if (!Number.isInteger(form.max_students) || form.max_students < 1 || form.max_students > 200) return fail('max_students', 'Укажите от 1 до 200 студентов.')
    if (form.end_time && form.end_time <= form.start_time) return fail('end_time', 'Время окончания должно быть позже начала.')
    const now = new Date()
    if (form.session_date < moscowDateValue(now)) return fail('session_date', 'Нельзя создать очередь на прошедшую дату.')
    if (form.session_date === moscowDateValue(now)) {
      const [startHour, startMinute] = form.start_time.split(':').map(Number)
      const [endHour, endMinute] = (form.end_time || form.start_time).split(':').map(Number)
      const derivedEnd = form.end_time
        ? endHour * 60 + endMinute
        : startHour * 60 + startMinute + (form.max_students - 1) * (form.slot_duration_minutes + form.buffer_minutes)
      if (derivedEnd <= moscowMinutes(now)) return fail('end_time', 'Нельзя создать очередь с прошедшим временем окончания.')
    }
    setValidationError(null)
    submittingRef.current = true
    requestIdRef.current ||= crypto.randomUUID()
    setLoading(true); setError('')
    try {
      const next = await api.createSession({ ...form, end_time: form.end_time || null }, requestIdRef.current)
      rememberTeacherSession({ adminToken: next.admin_token, publicToken: next.public_token, title: next.title, subject: next.subject, sessionDate: next.session_date, room: next.room, maxStudents: next.max_students })
      navigate(`${next.manage_path}?onboarding=1`, { replace: true })
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Не удалось создать очередь') }
    finally { submittingRef.current = false; setLoading(false) }
  }

  function requestNewQueue() {
    if (queues.length) setConfirmCreate(true)
    else setShowCreate(true)
  }

  function openRecovery(event: React.FormEvent) {
    event.preventDefault(); setRecoveryError('')
    try {
      const url = new URL(recovery, window.location.origin)
      const match = url.pathname.match(/^\/manage\/([^/]+)\/?$/)
      if (!match || url.origin !== window.location.origin) throw new Error()
      navigate(`/manage/${match[1]}`)
    } catch { setRecoveryError('Вставьте секретную ссылку /manage/… с этого сайта.') }
  }

  const active = queues.find((item) => item.networkError || item.session?.is_active !== false)
  return (
    <Layout wide>
      {!checking && active && <section className="active-queue-card panel" data-testid="active-queue">
        <div className="active-queue-copy"><span className="eyebrow"><span className="pulse-dot" /> У вас есть активная очередь</span><h1>{active.session?.title ?? active.title}</h1><p>{active.session?.subject ?? active.subject}</p><div className="active-facts"><span><ShieldCheck size={15} /> {queueCode(active.publicToken)}</span>{active.session && <><span><CalendarDays size={15} /> {dateFormatter.format(new Date(`${active.session.session_date}T00:00:00`))}</span><span><MapPin size={15} /> {active.session.room}</span><span><UsersRound size={15} /> {active.session.bookings.length} / {active.session.max_students}</span></>}</div>{active.networkError && <div className="warning-inline">Не удалось проверить очередь. Ссылка сохранена — попробуйте ещё раз.</div>}</div>
        <div className="active-actions"><Link className="button button-primary" to={`/manage/${active.adminToken}`}>Продолжить управление <ArrowRight size={17} /></Link><CopyButton value={`${window.location.origin}/q/${active.publicToken}`} label="Ссылка для студентов" /><button className="button button-secondary" onClick={requestNewQueue}>Создать новую очередь</button>{active.networkError && <button className="button button-secondary" onClick={() => void verifySaved()}><RefreshCw size={16} /> Повторить</button>}</div>
      </section>}

      {queues.length > 0 && <section className="panel recent-queues"><div className="section-title"><div><span>На этом устройстве</span><h2>Ваши очереди</h2></div></div>{queues.map((item) => { const isActive = item.networkError || item.session?.is_active !== false; return <div className={`recent-row ${isActive ? '' : 'recent-row-closed'}`} key={item.adminToken}><div><strong>{isActive ? '●' : '○'} {item.session?.title ?? item.title}</strong><span>{queueCode(item.publicToken)} · {item.session?.room || item.room || 'аудитория не указана'} · {isActive ? 'активна' : 'завершена'}</span></div><Link className="button button-secondary" to={`/manage/${item.adminToken}`}>{isActive ? 'Управлять' : 'Посмотреть итоги'}</Link></div> })}</section>}

      {(showCreate || (!checking && !active)) && <section className="landing-grid">
        <div className="hero-copy"><span className="eyebrow"><Sparkles size={15} /> QueueFlow · для преподавателя</span>{active ? <h2>Новая очередь для новой сдачи</h2> : <h1>Создайте очередь <span>за минуту</span></h1>}<p>Задайте время и аудиторию. Студенты запишутся по ссылке, а очередь будет обновляться автоматически.</p><div className="hero-roles"><span><ShieldCheck size={17} /> Управление — по секретной ссылке</span><span><UsersRound size={17} /> Запись — по ссылке или QR</span></div><a className="hero-recovery-link" href="#recovery">Уже есть ссылка преподавателя? Восстановить доступ <ArrowRight size={15} /></a></div>
        <form className="panel create-form" onSubmit={submit} noValidate aria-busy={loading}><div className="form-header"><div><span>Новое окно сдачи</span><h2>Настройте очередь</h2></div>{active && <button type="button" className="modal-close inline-close" aria-label="Закрыть форму" onClick={() => setShowCreate(false)}><X /></button>}</div><fieldset className="form-fields" disabled={loading}><div className="form-grid">
          <label className="field field-wide"><span>Название очереди</span><input name="title" value={form.title} maxLength={120} onChange={(e) => setField('title', e.target.value)} required {...invalidProps('title')} />{fieldIssue('title')}</label>
          <label className="field field-wide"><span>Предмет</span><input name="subject" value={form.subject} maxLength={120} onChange={(e) => setField('subject', e.target.value)} required {...invalidProps('subject')} />{fieldIssue('subject')}</label>
          <label className="field"><span>Дата · МСК</span><input name="session_date" type="date" lang="ru-RU" min={today} value={form.session_date} onChange={(e) => setField('session_date', e.target.value)} required {...invalidProps('session_date')} /><small className="field-hint">{form.session_date ? form.session_date.split('-').reverse().join('.') : 'ДД.ММ.ГГГГ'}</small>{fieldIssue('session_date')}</label>
          <label className="field"><span>Начало</span><input name="start_time" type="time" lang="ru-RU" value={form.start_time} onChange={(e) => setField('start_time', e.target.value)} required {...invalidProps('start_time')} />{fieldIssue('start_time')}</label>
          <label className="field"><span>Окончание</span><input name="end_time" type="time" lang="ru-RU" value={form.end_time ?? ''} onChange={(e) => setField('end_time', e.target.value)} {...invalidProps('end_time')} />{fieldIssue('end_time')}</label>
          <label className="field"><span>Аудитория</span><input name="room" value={form.room} maxLength={80} onChange={(e) => setField('room', e.target.value)} required {...invalidProps('room')} />{fieldIssue('room')}</label>
          <label className="field"><span>Слот, минут</span><input name="slot_duration_minutes" type="number" min="1" max="180" value={form.slot_duration_minutes} onChange={(e) => setField('slot_duration_minutes', Number(e.target.value))} required {...invalidProps('slot_duration_minutes')} />{fieldIssue('slot_duration_minutes')}</label>
          <label className="field"><span>Буфер, минут</span><input name="buffer_minutes" type="number" min="0" max="60" value={form.buffer_minutes} onChange={(e) => setField('buffer_minutes', Number(e.target.value))} required {...invalidProps('buffer_minutes')} />{fieldIssue('buffer_minutes')}</label>
          <label className="field field-wide"><span>Максимум студентов</span><input name="max_students" type="number" min="1" max="200" value={form.max_students} onChange={(e) => setField('max_students', Number(e.target.value))} required {...invalidProps('max_students')} />{fieldIssue('max_students')}</label>
        </div><p className="field-help">Время — МСК, 24-часовой формат. Слот — время на студента, буфер — пауза между сдачами.</p><div className="form-feedback" aria-live="polite">{error && <div className="error-banner" role="alert">{error}</div>}</div><button className="button button-primary button-large" disabled={loading}>{loading ? <span className="spinner" /> : <Sparkles size={18} />}{loading ? 'Создаём очередь…' : 'Создать очередь'}{!loading && <ArrowRight size={18} />}</button>{loading && <div className="cold-start-note">Первый ответ сервера иногда занимает до минуты.</div>}</fieldset><p className="form-foot"><ShieldCheck size={14} /> Секретная ссылка управления сохранится только на этом устройстве.</p></form>
      </section>}

      {!active && <section className="landing-intro"><div><span className="eyebrow">Как это работает</span><h2>Одна очередь. Две роли.</h2><p>Преподаватель управляет сдачей, студенты видят свои места и актуальное время.</p></div><div className="how-grid"><span><b>1</b><strong>Создайте очередь</strong><small>Укажите дату, слоты и аудиторию.</small></span><span><b>2</b><strong>Поделитесь ссылкой</strong><small>Студенты запишутся по QR или ссылке.</small></span><span><b>3</b><strong>Следите за движением</strong><small>Изменения видны всем автоматически.</small></span></div></section>}

      <form id="recovery" className="recovery-box" onSubmit={openRecovery}><div><Link2 size={18} /><span><strong>Уже есть ссылка преподавателя?</strong><small>Восстановите доступ к существующей очереди на этом устройстве.</small></span></div><input aria-label="Ссылка преподавателя" value={recovery} onChange={(event) => { setRecovery(event.target.value); setRecoveryError('') }} placeholder="https://…/manage/…" /><button className="button button-secondary"><ShieldCheck size={16} /> Открыть панель</button>{recoveryError && <span className="recovery-error" role="alert">{recoveryError}</span>}</form>

      {confirmCreate && active && <div className="modal-backdrop"><div className="modal panel confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setConfirmCreate(false)}><X /></button><span className="eyebrow"><ShieldCheck size={14} /> Активная очередь</span><h2>У вас уже есть «{active.title}»</h2><p>Создать ещё одну очередь? Она получит отдельные student и teacher ссылки.</p><div className="button-row"><Link className="button button-primary" to={`/manage/${active.adminToken}`}>Вернуться к текущей</Link><button className="button button-secondary" onClick={() => { setConfirmCreate(false); setShowCreate(true) }}>Создать новую</button></div></div></div>}
    </Layout>
  )
}
