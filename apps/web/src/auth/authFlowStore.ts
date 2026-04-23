import type {
  MfaChallengeResponse,
  MfaEnrollmentResponse,
} from './authClient'

type AuthFlowState = {
  challenge: MfaChallengeResponse | null
  enrollment: MfaEnrollmentResponse | null
}

let state: AuthFlowState = {
  challenge: null,
  enrollment: null,
}

export const authFlowStore = {
  setChallenge(challenge: MfaChallengeResponse) {
    state = {
      challenge,
      enrollment: null,
    }
  },

  setEnrollment(enrollment: MfaEnrollmentResponse) {
    state = {
      challenge: null,
      enrollment,
    }
  },

  getChallenge() {
    return state.challenge
  },

  getEnrollment() {
    return state.enrollment
  },

  clear() {
    state = {
      challenge: null,
      enrollment: null,
    }
  },
}