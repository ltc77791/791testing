/**
 * Session state shared between router, http interceptor, and auth store.
 * Extracted to a separate module to avoid circular dependencies.
 */
let sessionVerified = false

export function isSessionVerified() {
  return sessionVerified
}

export function markSessionVerified() {
  sessionVerified = true
}

export function resetSessionVerified() {
  sessionVerified = false
}
