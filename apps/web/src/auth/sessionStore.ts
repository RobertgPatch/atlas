import { useSyncExternalStore } from 'react'
import type { SessionResponse } from './authClient'

interface SessionState {
  status: 'unknown' | 'authenticated' | 'unauthenticated'
  session: SessionResponse | null
}

let state: SessionState = {
  status: 'unknown',
  session: null,
}

const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

export const sessionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getSnapshot() {
    return state
  },

  setAuthenticated(session: SessionResponse) {
    state = {
      status: 'authenticated',
      session,
    }
    emit()
  },

  setUnauthenticated() {
    state = {
      status: 'unauthenticated',
      session: null,
    }
    emit()
  },
}

export const useSession = () =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot)
