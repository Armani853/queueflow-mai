import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export function CopyButton({ value, label = 'Копировать' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return <button className="button button-secondary" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Скопировано' : label}</button>
}

