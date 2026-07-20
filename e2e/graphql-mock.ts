/**
 * Shared GraphQL mocking helpers for e2e specs.
 *
 * Specs keep their own fixture data (it is scenario-specific), but the two things that were
 * duplicated 14 times and got them into trouble now live here:
 *
 *  - `SCHEMA_INFO` — the handshake response, previously copy-pasted with a hardcoded hash.
 *  - `unmockedOperation` — the fallthrough. Every mock used to end in `route.continue()`, which
 *    sends the request to the *real* configured backend. That is how a green suite came to depend
 *    on the backend being unreachable. The fallthrough now fails the test and names the operation.
 */
import type { Page, Route } from '@playwright/test'
import { escapeLog } from './fixtures'

/** Matches the schema range the app validates against (`~9.2.0`). */
export const SCHEMA_INFO = {
  schemaVersion: '9.2.0',
  schemaHash: '6e1c4572d4a6d485702dc8a3c46491d51b8fc1fb34c032474f4e54e8a4ba01b8',
  releasedAt: '2026-05-27T00:00:00Z',
}

/** Fulfill a GraphQL route with a `data` payload. */
export function graphqlData(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  })
}

/** Fulfill a GraphQL route with an error message (the 8.1.0 surface carries codes in `message`). */
export function graphqlError(route: Route, message: string, data: unknown = null) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data, errors: [{ message }] }),
  })
}

/** Best-effort operation name for a failure message, falling back to the leading query text. */
export function operationNameOf(query: string): string {
  const named = /(?:query|mutation)\s+(\w+)/.exec(query)
  if (named) return named[1]!
  const field = /\{\s*(\w+)/.exec(query)
  return field ? field[1]! : query.slice(0, 60).replace(/\s+/g, ' ').trim() || '<empty query>'
}

/**
 * App-shell bootstrap operations, issued by every authenticated page regardless of what a spec is
 * testing. Served centrally so specs mock only what their own scenario is about — a spec that
 * cares about the account surface still mocks `me` itself, and its handler wins by running first.
 */
const SHELL_BOOTSTRAP: Record<string, unknown> = {
  StartupSchemaInfo: { schemaInfo: SCHEMA_INFO },
  Me: {
    me: {
      username: 'demo.user',
      email: 'demo@crystord.test',
      emailVerified: true,
      authMethods: ['password'],
    },
  },
}

/**
 * Terminal handler for a GraphQL operation the spec does not mock.
 *
 * Anything outside the shell-bootstrap set is recorded (the fixture fails the test at teardown,
 * naming it) and answered with an error, so the app settles into a visible failure state instead
 * of hanging until timeout. This replaced `route.continue()`, which sent unmocked operations to
 * the real configured backend.
 */
export function unmockedOperation(page: Page, route: Route, query: string) {
  const operation = operationNameOf(query)
  const bootstrap = SHELL_BOOTSTRAP[operation]
  if (bootstrap) return graphqlData(route, bootstrap)

  escapeLog(page).push(`unmocked GraphQL operation: ${operation}`)
  return graphqlError(route, `E2E-UNMOCKED-OPERATION: ${operation}`)
}
