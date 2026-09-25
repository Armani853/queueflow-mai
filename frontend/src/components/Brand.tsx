import { Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="QueueFlow — на главную">
      <span className="brand-mark"><Layers3 size={20} /></span>
      <span>Queue<span>Flow</span></span>
      <small>MAI</small>
    </Link>
  )
}

