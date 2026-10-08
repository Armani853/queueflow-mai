import { useEffect, useRef } from 'react'

/** Adds focus management to the lightweight dialogs already used by the app. */
export function useDialogKeyboard(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    if (!dialog) return

    const heading = dialog.querySelector<HTMLElement>('h2')
    if (heading) {
      heading.id ||= 'queueflow-dialog-title'
      dialog.setAttribute('aria-labelledby', heading.id)
    }
    const closeButton = dialog.querySelector<HTMLButtonElement>('.modal-close')
    closeButton?.setAttribute('aria-label', 'Закрыть окно')
    ;(closeButton ?? dialog.querySelector<HTMLElement>('button, a'))?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)'))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [open])
}
