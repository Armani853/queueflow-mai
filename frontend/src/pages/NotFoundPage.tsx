import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'

export function NotFoundPage() {
  return <Layout><div className="not-found"><SearchX size={48} /><span className="eyebrow">Ошибка 404</span><h1>Страница не найдена</h1><p>Ссылка устарела или содержит ошибку.</p><Link className="button button-primary" to="/"><ArrowLeft size={17} /> На главную</Link></div></Layout>
}

