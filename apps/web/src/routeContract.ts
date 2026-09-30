export const PUBLIC_ROUTE_PATTERNS = ['/', '/password/change', '/mfa/setup', '/mfa'] as const

export const CURRENT_PROTECTED_ROUTE_PATTERNS = [
  '/dashboard',
  '/investment-tracker',
  '/liquidity',
  '/liquidity/statements',
  '/entities',
  '/entities/:id',
  '/estate-maps',
  '/tic-registry',
  '/reports',
  '/k1',
  '/k1/:id/review',
  '/admin',
] as const

export type CurrentProtectedRoutePattern = typeof CURRENT_PROTECTED_ROUTE_PATTERNS[number]

export const BROWSER_ROUTE_PATTERNS = [
  ...PUBLIC_ROUTE_PATTERNS,
  ...CURRENT_PROTECTED_ROUTE_PATTERNS,
  '*',
] as const
