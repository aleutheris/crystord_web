import { describe, it, expect } from 'vitest'
import {
  AUTH_ERROR_CODES,
  extractAuthErrorCode,
  mapAuthError,
  isReauthMessage,
} from './error-codes'
import type { AuthErrorCode, AuthErrorKind, AuthErrorField } from './error-codes'

// Expectations declared independently of the source so the test verifies the contract, not the table.
const EXPECTED: Record<AuthErrorCode, { kind: AuthErrorKind; field: AuthErrorField | null }> = {
  'AUTHZ-AUTHENTICATION-REQUIRED': { kind: 'reauth', field: null },
  'AUTH-RATE-LIMITED': { kind: 'rate-limit', field: null },
  'SIGNUP-INVALID-OR-EXPIRED-CODE': { kind: 'form', field: 'code' },
  'SIGNUP-ACCOUNT-ALREADY-EXISTS': { kind: 'form', field: null },
  'USER-INVALID-USERNAME': { kind: 'field', field: 'username' },
  'PASSWORD-TOO-SHORT': { kind: 'field', field: 'password' },
  'PASSWORD-TOO-LONG': { kind: 'field', field: 'password' },
  'PASSWORD-TOO-COMMON': { kind: 'field', field: 'password' },
  'AUTH-GOOGLE-NOT-LINKED': { kind: 'form', field: null },
  'AUTH-GOOGLE-EMAIL-MISMATCH': { kind: 'form', field: null },
  'AUTH-CANNOT-REMOVE-LAST-METHOD': { kind: 'form', field: null },
  'EMAIL-ALREADY-IN-USE': { kind: 'field', field: 'email' },
  'RESET-INVALID-OR-EXPIRED-TOKEN': { kind: 'form', field: null },
  'EMAIL-CHANGE-INVALID-OR-EXPIRED-CODE': { kind: 'form', field: 'code' },
  'CR-15-OWNED-ATOMS-EXIST': { kind: 'form', field: null },
  'CR-15-WORKSPACE-ADMIN-EXISTS': { kind: 'form', field: null },
  'CR-16-PRINCIPAL-UNKNOWN': { kind: 'form', field: null },
  'AU-UNAUTHORIZED': { kind: 'access', field: null },
  'CAT-MULTIPLE-PARENTS-UNSUPPORTED': { kind: 'form', field: null },
  'CAT-DIMENSION-CYCLE': { kind: 'form', field: null },
}

describe('AUTH_ERROR_CODES', () => {
  it('covers exactly the mapped error table (18 auth/authz + 2 taxonomy shape codes)', () => {
    expect(AUTH_ERROR_CODES).toHaveLength(20)
    expect(new Set(AUTH_ERROR_CODES).size).toBe(20)
    expect(Object.keys(EXPECTED).sort()).toEqual([...AUTH_ERROR_CODES].sort())
  })

  it('no code is a substring of another (keeps substring matching unambiguous)', () => {
    for (const a of AUTH_ERROR_CODES) {
      for (const b of AUTH_ERROR_CODES) {
        if (a !== b) expect(b.includes(a)).toBe(false)
      }
    }
  })
})

describe('extractAuthErrorCode', () => {
  it.each(AUTH_ERROR_CODES)('finds %s embedded in a GraphQL message', (code) => {
    expect(extractAuthErrorCode(`GraphQL error: ${code} (request abc123)`)).toBe(code)
  })

  it('returns the exact code when the message is just the code', () => {
    expect(extractAuthErrorCode('AU-UNAUTHORIZED')).toBe('AU-UNAUTHORIZED')
  })

  it('returns null for an unrecognized message', () => {
    expect(extractAuthErrorCode('Some unexpected server failure')).toBeNull()
  })

  it('returns null for empty, null, and undefined input', () => {
    expect(extractAuthErrorCode('')).toBeNull()
    expect(extractAuthErrorCode(null)).toBeNull()
    expect(extractAuthErrorCode(undefined)).toBeNull()
  })
})

describe('mapAuthError', () => {
  it.each(AUTH_ERROR_CODES)('maps %s to the expected kind/field with a non-empty message', (code) => {
    const outcome = mapAuthError(`GraphQL error: ${code}`)
    expect(outcome.code).toBe(code)
    expect(outcome.kind).toBe(EXPECTED[code].kind)
    expect(outcome.field).toBe(EXPECTED[code].field)
    expect(outcome.message.length).toBeGreaterThan(0)
  })

  it('returns the safe unknown fallback for an unrecognized message', () => {
    const outcome = mapAuthError('boom')
    expect(outcome.code).toBeNull()
    expect(outcome.kind).toBe('unknown')
    expect(outcome.field).toBeNull()
    expect(outcome.message).toBe('Something went wrong. Please try again.')
  })

  it('returns the fallback for null/undefined message', () => {
    expect(mapAuthError(null).kind).toBe('unknown')
    expect(mapAuthError(undefined).kind).toBe('unknown')
  })

  it('does not leak account existence for the rate-limit code', () => {
    const outcome = mapAuthError('AUTH-RATE-LIMITED')
    expect(outcome.message.toLowerCase()).not.toContain('exist')
    expect(outcome.message.toLowerCase()).not.toContain('account')
  })
})

describe('isReauthMessage', () => {
  it('is true only for AUTHZ-AUTHENTICATION-REQUIRED', () => {
    expect(isReauthMessage('AUTHZ-AUTHENTICATION-REQUIRED')).toBe(true)
  })

  it.each(AUTH_ERROR_CODES.filter((c) => c !== 'AUTHZ-AUTHENTICATION-REQUIRED'))(
    'is false for %s',
    (code) => {
      expect(isReauthMessage(code)).toBe(false)
    },
  )

  it('is false for unknown and empty messages', () => {
    expect(isReauthMessage('nope')).toBe(false)
    expect(isReauthMessage('')).toBe(false)
    expect(isReauthMessage(null)).toBe(false)
  })
})
