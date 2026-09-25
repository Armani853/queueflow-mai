import type { ReactNode } from 'react'
import { Brand } from './Brand'

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="app-shell">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <header className="topbar">
        <Brand />
        <div className="live-pill"><span /> Система работает</div>
      </header>
      <main className={wide ? 'container container-wide' : 'container'}>{children}</main>
      <footer>QueueFlow MAI · Прозрачная запись на лабораторные</footer>
    </div>
  )
}

