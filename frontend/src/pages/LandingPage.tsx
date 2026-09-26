import { useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Clock3, Link2, QrCode, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { CopyButton } from '../components/CopyButton'
import { Layout } from '../components/Layout'
import { QrShare } from '../components/QrShare'
import { readRememberedTeacherSession, rememberTeacherSession } from '../lib/teacherSession'
import type { CreatedSession, SessionCreatePayload } from '../types'

function tomorrow() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

const initialForm: SessionCreatePayload = {
  title: 'Сдача лабораторных',
  subject: 'Численные методы',
  session_date: tomorrow(),
  start_time: '12:00',
  end_time: '14:00',
  room: 'ГУК Б-315',
  slot_duration_minutes: 10,
  buffer_minutes: 2,
  max_students: 10,
}

export function LandingPage() {
  const [form, setForm] = useState(initialForm)
  const [created, setCreated] = useState<CreatedSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [remembered] = useState(readRememberedTeacherSession)
  const origin = window.location.origin
  const publicUrl = useMemo(() => created ? `${origin}${created.public_path}` : '', [created, origin])
  const manageUrl = useMemo(() => created ? `${origin}${created.manage_path}` : '', [created, origin])

  function setField<K extends keyof SessionCreatePayload>(key: K, value: SessionCreatePayload[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const next = await api.createSession({ ...form, end_time: form.end_time || null })
      rememberTeacherSession({ adminToken: next.admin_token, publicToken: next.public_token, title: next.title })
      setCreated(next)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось создать очередь')
    } finally {
      setLoading(false)
    }
  }

  if (created) {
    return (
      <Layout>
        <section className="success-hero">
          <span className="eyebrow"><Sparkles size={15} /> Очередь готова</span>
          <h1>Очередь создана — вы преподаватель</h1>
          <p>Откройте панель преподавателя на этом ноутбуке. Студентам отправляйте только публичную ссылку или QR.</p>
        </section>
        <div className="created-grid">
          <section className="panel link-panel">
            <div className="panel-heading"><div className="icon-box"><Link2 /></div><div><span>Для студентов</span><h2>Публичная ссылка</h2></div></div>
            <div className="url-box">{publicUrl}</div>
            <div className="button-row"><CopyButton value={publicUrl} /><Link className="button button-primary" to={created.public_path}>Проверить как студент <ArrowRight size={17} /></Link></div>
          </section>
          <section className="panel qr-panel">
            <div className="panel-heading"><div className="icon-box"><QrCode /></div><div><span>Быстрый вход</span><h2>QR-код</h2></div></div>
            <QrShare publicPath={created.public_path} />
          </section>
          <section className="panel admin-link-panel">
            <div className="panel-heading"><div className="icon-box icon-purple"><ShieldCheck /></div><div><span>Только для вас</span><h2>Ссылка преподавателя</h2></div></div>
            <div className="url-box secret-url">{manageUrl}</div>
            <div className="notice">Не отправляйте эту ссылку в общий чат: она даёт доступ к управлению.</div>
            <div className="button-row"><CopyButton value={manageUrl} /><Link className="button button-primary" to={created.manage_path}>Управлять очередью <ArrowRight size={17} /></Link></div>
          </section>
        </div>
      </Layout>
    )
  }

  return (
    <Layout wide>
      {remembered && <section className="resume-banner panel">
        <div><span className="eyebrow"><ShieldCheck size={14} /> Последняя очередь на этом устройстве</span><strong>{remembered.title}</strong><small>Откройте секретную панель преподавателя. Главная страница предназначена для создания новой очереди.</small></div>
        <Link className="button button-primary" to={`/manage/${remembered.adminToken}`}>Продолжить управление <ArrowRight size={17} /></Link>
      </section>}
      <section className="landing-grid">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={15} /> Очередь без хаоса в чате</span>
          <h1>Создайте очередь на сдачу <span>за минуту</span></h1>
          <p>Студенты сами выберут свободное время, а QueueFlow сохранит порядок и пересчитает расписание при изменениях.</p>
          <div className="role-explainer"><strong>Как это работает</strong><span>1. Преподаватель создаёт очередь и остаётся в секретной панели.</span><span>2. Студенты открывают QR и видят одну общую очередь.</span></div>
          <div className="feature-strip">
            <div><CalendarDays /><strong>Точные слоты</strong><span>Время видно всем</span></div>
            <div><UsersRound /><strong>Live-очередь</strong><span>Текущий и следующий</span></div>
            <div><Clock3 /><strong>Автосдвиг</strong><span>После отмены</span></div>
          </div>
        </div>
        <form className="panel create-form" onSubmit={submit}>
          <div className="form-header"><div><span>Новое окно сдачи</span><h2>Настройте расписание</h2></div><span className="step-pill">1 минута</span></div>
          <div className="form-grid">
            <label className="field field-wide"><span>Название очереди</span><input value={form.title} maxLength={120} onChange={(e) => setField('title', e.target.value)} required /></label>
            <label className="field field-wide"><span>Предмет</span><input value={form.subject} maxLength={120} onChange={(e) => setField('subject', e.target.value)} required /></label>
            <label className="field"><span>Дата</span><input type="date" value={form.session_date} onChange={(e) => setField('session_date', e.target.value)} required /></label>
            <label className="field"><span>Начало</span><input type="time" value={form.start_time} onChange={(e) => setField('start_time', e.target.value)} required /></label>
            <label className="field"><span>Окончание</span><input type="time" value={form.end_time ?? ''} onChange={(e) => setField('end_time', e.target.value)} /></label>
            <label className="field"><span>Аудитория</span><input value={form.room} maxLength={80} onChange={(e) => setField('room', e.target.value)} required /></label>
            <label className="field"><span>Слот, минут</span><input type="number" min="1" max="180" value={form.slot_duration_minutes} onChange={(e) => setField('slot_duration_minutes', Number(e.target.value))} required /></label>
            <label className="field"><span>Буфер, минут</span><input type="number" min="0" max="60" value={form.buffer_minutes} onChange={(e) => setField('buffer_minutes', Number(e.target.value))} required /></label>
            <label className="field field-wide"><span>Максимум студентов</span><input type="number" min="1" max="200" value={form.max_students} onChange={(e) => setField('max_students', Number(e.target.value))} required /></label>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button className="button button-primary button-large" disabled={loading}>{loading ? <span className="spinner" /> : <Sparkles size={18} />}{loading ? 'Создаём…' : 'Создать очередь'}<ArrowRight size={18} /></button>
          <p className="form-foot"><ShieldCheck size={14} /> Без регистрации. Секретная ссылка управления создаётся автоматически.</p>
        </form>
      </section>
    </Layout>
  )
}
