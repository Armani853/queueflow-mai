import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Clock3, Link2, MapPin, RefreshCw, ShieldCheck, Sparkles, UsersRound, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { CopyButton } from '../components/CopyButton'
import { Layout } from '../components/Layout'
import { forgetTeacherSession, queueCode, readRememberedTeacherSessions, rememberTeacherSession, type RememberedTeacherSession } from '../lib/teacherSession'
import type { QueueSession, SessionCreatePayload } from '../types'

function tomorrow() { const date = new Date(); date.setDate(date.getDate() + 1); return date.toISOString().slice(0, 10) }
const initialForm: SessionCreatePayload = { title: 'Сдача лабораторных', subject: 'Численные методы', session_date: tomorrow(), start_time: '12:00', end_time: '14:00', room: 'ГУК Б-315', slot_duration_minutes: 10, buffer_minutes: 2, max_students: 10 }
type SavedQueue = RememberedTeacherSession & { session?: QueueSession; networkError?: boolean }
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

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
    setShowCreate(live.length === 0)
    setChecking(false)
  }

  useEffect(() => { void verifySaved() }, [])

  function setField<K extends keyof SessionCreatePayload>(key: K, value: SessionCreatePayload[K]) { setForm((current) => ({ ...current, [key]: value })) }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const next = await api.createSession({ ...form, end_time: form.end_time || null })
      rememberTeacherSession({ adminToken: next.admin_token, publicToken: next.public_token, title: next.title, subject: next.subject, sessionDate: next.session_date, room: next.room, maxStudents: next.max_students })
      navigate(`${next.manage_path}?onboarding=1`, { replace: true })
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Не удалось создать очередь') }
    finally { setLoading(false) }
  }

  function requestNewQueue() {
    if (queues.length) setConfirmCreate(true)
    else setShowCreate(true)
  }

  function openRecovery(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try {
      const url = new URL(recovery, window.location.origin)
      const match = url.pathname.match(/^\/manage\/([^/]+)\/?$/)
      if (!match || url.origin !== window.location.origin) throw new Error()
      navigate(`/manage/${match[1]}`)
    } catch { setError('Вставьте полную секретную ссылку вида /manage/… с этого сайта.') }
  }

  const active = queues[0]
  return (
    <Layout wide>
      {!checking && active && <section className="active-queue-card panel" data-testid="active-queue">
        <div className="active-queue-copy"><span className="eyebrow"><span className="pulse-dot" /> У вас есть активная очередь</span><h1>{active.session?.title ?? active.title}</h1><p>{active.session?.subject ?? active.subject}</p><div className="active-facts"><span><ShieldCheck size={15} /> {queueCode(active.publicToken)}</span>{active.session && <><span><CalendarDays size={15} /> {dateFormatter.format(new Date(`${active.session.session_date}T00:00:00`))}</span><span><MapPin size={15} /> {active.session.room}</span><span><UsersRound size={15} /> {active.session.bookings.length} / {active.session.max_students}</span></>}</div>{active.networkError && <div className="warning-inline">Не удалось проверить очередь. Ссылка сохранена — попробуйте ещё раз.</div>}</div>
        <div className="active-actions"><Link className="button button-primary" to={`/manage/${active.adminToken}`}>Продолжить управление <ArrowRight size={17} /></Link><CopyButton value={`${window.location.origin}/q/${active.publicToken}`} label="Ссылка для студентов" /><button className="button button-secondary" onClick={requestNewQueue}>Создать новую очередь</button>{active.networkError && <button className="button button-secondary" onClick={() => void verifySaved()}><RefreshCw size={16} /> Повторить</button>}</div>
      </section>}

      {queues.length > 1 && <section className="panel recent-queues"><div className="section-title"><div><span>На этом устройстве</span><h2>Ваши очереди</h2></div></div>{queues.map((item, index) => <div className="recent-row" key={item.adminToken}><div><strong>{index === 0 ? '●' : '○'} {item.session?.title ?? item.title}</strong><span>{queueCode(item.publicToken)} · {item.session?.room || item.room || 'аудитория не указана'}</span></div><Link className="button button-secondary" to={`/manage/${item.adminToken}`}>Управлять</Link></div>)}</section>}

      {(!active || !showCreate) && <section className="landing-intro"><div><span className="eyebrow"><Sparkles size={15} /> Очередь без хаоса в чате</span><h1>{active ? 'Одна очередь — две понятные ссылки' : 'Создайте очередь на сдачу за минуту'}</h1><p>Секретная ссылка остаётся у преподавателя, публичная ссылка и QR отправляются студентам.</p></div><div className="how-grid"><span><b>1</b>Преподаватель создаёт очередь</span><span><b>2</b>Отправляет public link или QR</span><span><b>3</b>Студенты записываются</span><span><b>4</b>Записи появляются автоматически</span><span><b>5</b>Преподаватель управляет сдачей</span></div>{active && <button className="button button-secondary" onClick={requestNewQueue}>Создать ещё одну очередь</button>}</section>}

      {(showCreate || (!checking && !active)) && <section className="landing-grid">
        <div className="hero-copy"><span className="eyebrow"><Sparkles size={15} /> Новое окно сдачи</span><h1>Настройте <span>расписание</span></h1><p>После создания откроется панель преподавателя. Мы сохраним её на этом устройстве.</p><div className="feature-strip"><div><CalendarDays /><strong>Точные слоты</strong><span>Время видно всем</span></div><div><UsersRound /><strong>Live-очередь</strong><span>Обновляется сама</span></div><div><Clock3 /><strong>Автосдвиг</strong><span>После отмены</span></div></div></div>
        <form className="panel create-form" onSubmit={submit}><div className="form-header"><div><span>Преподаватель</span><h2>Создать очередь</h2></div>{active && <button type="button" className="modal-close inline-close" onClick={() => setShowCreate(false)}><X /></button>}</div><div className="form-grid">
          <label className="field field-wide"><span>Название очереди</span><input value={form.title} maxLength={120} onChange={(e) => setField('title', e.target.value)} required /></label><label className="field field-wide"><span>Предмет</span><input value={form.subject} maxLength={120} onChange={(e) => setField('subject', e.target.value)} required /></label><label className="field"><span>Дата</span><input type="date" value={form.session_date} onChange={(e) => setField('session_date', e.target.value)} required /></label><label className="field"><span>Начало</span><input type="time" value={form.start_time} onChange={(e) => setField('start_time', e.target.value)} required /></label><label className="field"><span>Окончание</span><input type="time" value={form.end_time ?? ''} onChange={(e) => setField('end_time', e.target.value)} /></label><label className="field"><span>Аудитория</span><input value={form.room} maxLength={80} onChange={(e) => setField('room', e.target.value)} required /></label><label className="field"><span>Слот, минут</span><input type="number" min="1" max="180" value={form.slot_duration_minutes} onChange={(e) => setField('slot_duration_minutes', Number(e.target.value))} required /></label><label className="field"><span>Буфер, минут</span><input type="number" min="0" max="60" value={form.buffer_minutes} onChange={(e) => setField('buffer_minutes', Number(e.target.value))} required /></label><label className="field field-wide"><span>Максимум студентов</span><input type="number" min="1" max="200" value={form.max_students} onChange={(e) => setField('max_students', Number(e.target.value))} required /></label>
        </div>{error && <div className="error-banner">{error}</div>}<button className="button button-primary button-large" disabled={loading}>{loading ? <span className="spinner" /> : <Sparkles size={18} />}{loading ? 'Создаём…' : 'Создать очередь'}<ArrowRight size={18} /></button><p className="form-foot"><ShieldCheck size={14} /> Секретная ссылка управления сохранится только на этом устройстве.</p></form>
      </section>}

      <form className="recovery-box" onSubmit={openRecovery}><div><Link2 size={18} /><span><strong>У меня есть ссылка преподавателя</strong><small>Вставьте сохранённую секретную ссылку, чтобы вернуть панель на это устройство.</small></span></div><input aria-label="Ссылка преподавателя" value={recovery} onChange={(event) => setRecovery(event.target.value)} placeholder={`${window.location.origin}/manage/…`} /><button className="button button-secondary"><ShieldCheck size={16} /> Открыть</button></form>

      {confirmCreate && active && <div className="modal-backdrop"><div className="modal panel confirm-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setConfirmCreate(false)}><X /></button><span className="eyebrow"><ShieldCheck size={14} /> Активная очередь</span><h2>У вас уже есть «{active.title}»</h2><p>Создать ещё одну очередь? Она получит отдельные student и teacher ссылки.</p><div className="button-row"><Link className="button button-primary" to={`/manage/${active.adminToken}`}>Вернуться к текущей</Link><button className="button button-secondary" onClick={() => { setConfirmCreate(false); setShowCreate(true) }}>Создать новую</button></div></div></div>}
    </Layout>
  )
}
