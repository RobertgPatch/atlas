import { sessionStore } from './sessionStore'

export function reportAuthenticationResponse(status: number) {
  const session = sessionStore.getSnapshot()

  if (status === 401) {
    if (session.status === 'authenticated') {
      sessionStore.setUnauthenticated()
    }
    return
  }

  if (session.status === 'authenticated') {
    sessionStore.recordActivity()
  }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init)
  reportAuthenticationResponse(response.status)
  return response
}
