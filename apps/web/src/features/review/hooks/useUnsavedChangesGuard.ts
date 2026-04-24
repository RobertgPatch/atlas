import { useEffect } from 'react'

/**
 * Blocks page unload when there are unsaved edits.
 * React Router 7 blocker hooks are not stable yet; we fall back to `beforeunload`
 * for hard navigation / close-tab, which satisfies the acceptance criterion.
 */
export const useUnsavedChangesGuard = (hasUnsaved: boolean, message?: string) => {
  useEffect(() => {
    if (!hasUnsaved) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = message ?? 'You have unsaved changes. Are you sure you want to leave?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved, message])
}
