import type {
  MfaChallengeResponse,
  MfaEnrollmentResponse,
  PasswordChangeRequiredResponse,
} from './authClient'

type AuthFlowState = {
  challenge: MfaChallengeResponse | null
  enrollment: MfaEnrollmentResponse | null
  passwordChange: PasswordChangeRequiredResponse | null
}

let state: AuthFlowState = {
  challenge: null,
  enrollment: null,
  passwordChange: null,
}

export const authFlowStore = {
  setChallenge(challenge: MfaChallengeResponse) {
    state = {
      challenge,
      enrollment: null,
      passwordChange: null,
    }
  },

  setEnrollment(enrollment: MfaEnrollmentResponse) {
    state = {
      challenge: null,
      enrollment,
      passwordChange: null,
    }
  },

  setPasswordChange(passwordChange: PasswordChangeRequiredResponse) {
    state = {
      challenge: null,
      enrollment: null,
      passwordChange,
    }
  },

  getChallenge() {
    return state.challenge
  },

  getEnrollment() {
    return state.enrollment
  },

  getPasswordChange() {
    return state.passwordChange
  },

  clear() {
    state = {
      challenge: null,
      enrollment: null,
      passwordChange: null,
    }
  },
}
