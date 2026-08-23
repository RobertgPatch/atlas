import { useSyncExternalStore } from 'react'
import type { SessionResponse } from './authClient'

interface SessionState {
  status: 'unknown' | 'authenticated' | 'unauthenticated'
  session: SessionResponse | null
  idleExpiresAt: number | null
}

let state: SessionState = {
  status: 'unknown',
  session: null,
  idleExpiresAt: null,
}

const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

const idleExpiryFor = (session: SessionResponse) => {
  const issuedAt = Date.parse(session.session.issuedAt)
  const absoluteExpiry = Number.isFinite(issuedAt)
    ? issuedAt + session.session.absoluteTimeoutSeconds * 1000
    : Number.POSITIVE_INFINITY
  return Math.min(
    Date.now() + session.session.idleTimeoutSeconds * 1000,
    absoluteExpiry,
  )
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
      idleExpiresAt: idleExpiryFor(session),
    }
    emit()
  },

  recordActivity() {
    if (state.status !== 'authenticated' || !state.session) return
    state = {
      ...state,
      idleExpiresAt: idleExpiryFor(state.session),
    }
    emit()
  },

  setUnauthenticated() {
    state = {
      status: 'unauthenticated',
      session: null,
      idleExpiresAt: null,
    }
    emit()
  },
}

export const useSession = () =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot)
