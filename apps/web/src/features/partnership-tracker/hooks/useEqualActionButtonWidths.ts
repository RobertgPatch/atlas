import { useLayoutEffect, useRef } from 'react'

// Size page actions together, leaving dialog footers and compact controls local.
export function useEqualActionButtonWidths() {
  const rootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const originalStyles = new Map<HTMLButtonElement, { width: string; minWidth: string; flexShrink: string }>()
    const restore = (button: HTMLButtonElement) => {
      const original = originalStyles.get(button)
      if (original) Object.assign(button.style, original)
    }
    const measure = () => {
      // Restore each button's own sizing before measuring, so an earlier shared
      // width never becomes the baseline for the next calculation.
      originalStyles.forEach((_, button) => restore(button))
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-ui-button]'))
        .filter((button) => button.textContent?.trim() && !button.closest('[role="dialog"]') && button.getClientRects().length)
      const width = Math.max(0, ...buttons.map((button) => button.getBoundingClientRect().width))
      if (!width) return
      for (const button of buttons) {
        if (!originalStyles.has(button)) {
          originalStyles.set(button, { width: button.style.width, minWidth: button.style.minWidth, flexShrink: button.style.flexShrink })
        }
        Object.assign(button.style, { width: `${width}px`, minWidth: `${width}px`, flexShrink: '0' })
      }
      for (const button of originalStyles.keys()) {
        if (!root.contains(button)) originalStyles.delete(button)
      }
    }
    let frame = 0
    let active = true
    const scheduleMeasure = () => {
      if (!active) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const observer = new MutationObserver(scheduleMeasure)
    observer.observe(root, { childList: true, characterData: true, subtree: true })
    window.addEventListener('resize', scheduleMeasure)
    document.fonts?.addEventListener('loadingdone', scheduleMeasure)
    void document.fonts?.ready.then(scheduleMeasure)
    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      document.fonts?.removeEventListener('loadingdone', scheduleMeasure)
      originalStyles.forEach((_, button) => restore(button))
    }
  }, [])

  return rootRef
}
