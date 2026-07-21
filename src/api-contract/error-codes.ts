/**
 * Central GraphQL error-code mapper for the schema-8.1.0 auth/authz surface (BI-260054 / REQ-CR-260025).
 *
 * Under 8.1.0 the error code is carried in the GraphQL `errors[].message` string (NOT in
 * `extensions.code`, and there is no error body on data fields). This module is the single place that
 * turns a raw message into a typed, user-facing outcome. Features MUST consume this module rather than
 * parse raw messages themselves.
 */

/**
 * Every error code the front end maps to a user-facing message. Predominantly the auth/authz
 * table; ADR-260071 added the two taxonomy-shape codes the dimension-hierarchy controls can
 * produce. Anything absent here falls through to `UNKNOWN_OUTCOME` and is surfaced generically.
 */
export const AUTH_ERROR_CODES = [
  'AUTHZ-AUTHENTICATION-REQUIRED',
  'AUTH-RATE-LIMITED',
  'SIGNUP-INVALID-OR-EXPIRED-CODE',
  'SIGNUP-ACCOUNT-ALREADY-EXISTS',
  'USER-INVALID-USERNAME',
  'PASSWORD-TOO-SHORT',
  'PASSWORD-TOO-LONG',
  'PASSWORD-TOO-COMMON',
  'AUTH-GOOGLE-NOT-LINKED',
  'AUTH-GOOGLE-EMAIL-MISMATCH',
  'AUTH-CANNOT-REMOVE-LAST-METHOD',
  'EMAIL-ALREADY-IN-USE',
  'RESET-INVALID-OR-EXPIRED-TOKEN',
  'EMAIL-CHANGE-INVALID-OR-EXPIRED-CODE',
  'CR-15-OWNED-ATOMS-EXIST',
  'CR-15-WORKSPACE-ADMIN-EXISTS',
  'CR-16-PRINCIPAL-UNKNOWN',
  'AU-UNAUTHORIZED',
  // Taxonomy shape errors reachable by ordinary action from the dimension-hierarchy controls
  // (ADR-260071). Other CAT-* codes stay on the generic path, surfaced verbatim per ADR-260064.
  'CAT-MULTIPLE-PARENTS-UNSUPPORTED',
  'CAT-DIMENSION-CYCLE',
] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

/**
 * How a feature should react to the error:
 * - `reauth`     → session is gone; route to sign-in.
 * - `rate-limit` → throttled; show generic back-off message.
 * - `field`      → inline error on the named form field.
 * - `form`       → form-level (non-field) error message.
 * - `access`     → caller lacks access to the targeted resource.
 * - `unknown`    → unrecognized; show the generic fallback.
 */
export type AuthErrorKind = 'reauth' | 'rate-limit' | 'field' | 'form' | 'access' | 'unknown'

/** The form field an error should attach to, when `kind` is `field` (or a form code tied to a field). */
export type AuthErrorField = 'username' | 'password' | 'email' | 'code' | 'token'

export interface AuthErrorOutcome {
  /** The recognized code, or `null` when the message matched no known code. */
  code: AuthErrorCode | null
  kind: AuthErrorKind
  /** The field this error relates to, when applicable; otherwise `null`. */
  field: AuthErrorField | null
  /** A user-facing, branding-aligned, non-enumerating message. */
  message: string
}

interface OutcomeSpec {
  kind: AuthErrorKind
  field: AuthErrorField | null
  message: string
}

const OUTCOMES: Record<AuthErrorCode, OutcomeSpec> = {
  'AUTHZ-AUTHENTICATION-REQUIRED': {
    kind: 'reauth',
    field: null,
    message: 'Your session has expired. Please sign in again.',
  },
  'AUTH-RATE-LIMITED': {
    kind: 'rate-limit',
    field: null,
    message: 'Too many attempts. Please wait a moment and try again.',
  },
  'SIGNUP-INVALID-OR-EXPIRED-CODE': {
    kind: 'form',
    field: 'code',
    message: 'That code is invalid or has expired. Request a new one.',
  },
  'SIGNUP-ACCOUNT-ALREADY-EXISTS': {
    kind: 'form',
    field: null,
    message: 'An account already exists for this email. Try signing in instead.',
  },
  'USER-INVALID-USERNAME': {
    kind: 'field',
    field: 'username',
    message: 'Choose 3–30 characters: letters, digits, . _ or -, starting with a letter.',
  },
  'PASSWORD-TOO-SHORT': {
    kind: 'field',
    field: 'password',
    message: 'Password must be at least 12 characters.',
  },
  'PASSWORD-TOO-LONG': {
    kind: 'field',
    field: 'password',
    message: 'Password is too long.',
  },
  'PASSWORD-TOO-COMMON': {
    kind: 'field',
    field: 'password',
    message: 'That password is too common. Choose something less predictable.',
  },
  'AUTH-GOOGLE-NOT-LINKED': {
    kind: 'form',
    field: null,
    message: 'This email already has an account. Sign in with your password, then link Google in settings.',
  },
  'AUTH-GOOGLE-EMAIL-MISMATCH': {
    kind: 'form',
    field: null,
    message: "That Google account's email doesn't match this account.",
  },
  'AUTH-CANNOT-REMOVE-LAST-METHOD': {
    kind: 'form',
    field: null,
    message: "You can't remove your only sign-in method.",
  },
  'EMAIL-ALREADY-IN-USE': {
    kind: 'field',
    field: 'email',
    message: 'That email is already in use.',
  },
  'RESET-INVALID-OR-EXPIRED-TOKEN': {
    kind: 'form',
    field: null,
    message: 'This reset link is invalid or has expired. Start the reset again.',
  },
  'EMAIL-CHANGE-INVALID-OR-EXPIRED-CODE': {
    kind: 'form',
    field: 'code',
    message: 'That code is invalid or has expired. Request a new one.',
  },
  'CR-15-OWNED-ATOMS-EXIST': {
    kind: 'form',
    field: null,
    message: 'You still own atoms. Delete them first, then you can delete your account.',
  },
  'CR-15-WORKSPACE-ADMIN-EXISTS': {
    kind: 'form',
    field: null,
    message: "You're the sole admin of a workspace. Assign another admin or remove the workspace first.",
  },
  'CR-16-PRINCIPAL-UNKNOWN': {
    kind: 'form',
    field: null,
    message: 'No matching user or workspace was found.',
  },
  'AU-UNAUTHORIZED': {
    kind: 'access',
    field: null,
    message: "You don't have access to do that.",
  },
  'CAT-MULTIPLE-PARENTS-UNSUPPORTED': {
    kind: 'form',
    field: null,
    message: 'A dimension can have only one parent. Detach it first, then attach it elsewhere.',
  },
  'CAT-DIMENSION-CYCLE': {
    kind: 'form',
    field: null,
    message: "That would place a dimension inside itself. Choose a parent that isn't one of its own descendants.",
  },
}

const UNKNOWN_OUTCOME: AuthErrorOutcome = {
  code: null,
  kind: 'unknown',
  field: null,
  message: 'Something went wrong. Please try again.',
}

/**
 * Find a known auth error code inside a raw GraphQL error message. No two codes are substrings of one
 * another, so a simple substring scan is order-independent. Returns `null` when nothing matches.
 */
export function extractAuthErrorCode(message: string | null | undefined): AuthErrorCode | null {
  if (!message) return null
  for (const code of AUTH_ERROR_CODES) {
    if (message.includes(code)) return code
  }
  return null
}

/** Map a raw GraphQL error message to a typed, user-facing outcome (with a safe unknown fallback). */
export function mapAuthError(message: string | null | undefined): AuthErrorOutcome {
  const code = extractAuthErrorCode(message)
  if (code === null) return { ...UNKNOWN_OUTCOME }
  const spec = OUTCOMES[code]
  return { code, kind: spec.kind, field: spec.field, message: spec.message }
}

/** True when a message signals that re-authentication is required (drives auto sign-out). */
export function isReauthMessage(message: string | null | undefined): boolean {
  return mapAuthError(message).kind === 'reauth'
}
