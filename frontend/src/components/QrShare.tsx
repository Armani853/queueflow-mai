import { useMemo, useState } from 'react'
import { AlertTriangle, Wifi } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { CopyButton } from './CopyButton'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function validHttpOrigin(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

export function QrShare({ publicPath, size = 166 }: { publicPath: string; size?: number }) {
  const pageOrigin = window.location.origin
  const isLoopback = LOOPBACK_HOSTS.has(window.location.hostname)
  const storedOrigin = isLoopback ? localStorage.getItem('queueflow:qr-origin') : null
  const [qrOrigin, setQrOrigin] = useState(storedOrigin ?? pageOrigin)
  const normalizedOrigin = validHttpOrigin(qrOrigin)
  const qrUrl = useMemo(
    () => `${normalizedOrigin ?? pageOrigin}${publicPath}`,
    [normalizedOrigin, pageOrigin, publicPath],
  )

  function updateOrigin(value: string) {
    setQrOrigin(value)
    const valid = validHttpOrigin(value)
    if (valid) localStorage.setItem('queueflow:qr-origin', valid)
  }

  return (
    <div className="qr-share">
      <div className="qr-wrap" data-qr-url={qrUrl}>
        <QRCodeSVG value={qrUrl} size={size} bgColor="#ffffff" fgColor="#07111f" level="M" />
      </div>
      <div className="qr-target">QR ведёт на: <strong>{qrUrl}</strong></div>
      {isLoopback && (
        <div className="qr-local-warning">
          <div><AlertTriangle size={16} /><span><strong>Телефон не откроет localhost.</strong> Запустите backend с <code>--host 0.0.0.0</code> и укажите сетевой адрес компьютера.</span></div>
          <label className="field">
            <span><Wifi size={13} /> Адрес компьютера для QR</span>
            <input
              aria-label="Адрес компьютера для QR"
              value={qrOrigin}
              onChange={(event) => updateOrigin(event.target.value)}
              placeholder="http://192.168.1.42:8000"
              inputMode="url"
            />
          </label>
          {!normalizedOrigin && <span className="qr-input-error">Введите адрес вида http://192.168.1.42:8000</span>}
        </div>
      )}
      <CopyButton value={qrUrl} label="Копировать QR-ссылку" />
    </div>
  )
}
