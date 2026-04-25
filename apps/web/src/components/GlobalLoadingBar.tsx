import { useIsFetching, useIsMutating } from '@tanstack/react-query'

/**
 * Thin fixed bar at the top of the viewport that is visible whenever any
 * React Query fetch or mutation is in-flight. Gives users immediate feedback
 * that an async action is running even before the UI content updates.
 */
export function GlobalLoadingBar() {
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const active = fetching + mutating > 0

  return (
    <div
      aria-hidden={!active}
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none overflow-hidden"
      style={{ opacity: active ? 1 : 0, transition: 'opacity 150ms ease-out' }}
    >
      <div className="h-full w-full bg-atlas-gold/80 animate-pulse" />
    </div>
  )
}
