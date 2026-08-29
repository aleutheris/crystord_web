/**
 * Hermetic e2e fixtures.
 *
 * Every spec must import `test`/`expect` from here rather than from `@playwright/test`.
 * The fixture makes a test run independent of the machine it runs on:
 *
 *  1. Runtime config is stubbed, so tests no longer read `public/config.json` (and therefore no
 *     longer depend on `deploy_config.json`'s active profile, nor dirty a tracked file).
 *  2. Every cross-origin request is aborted and recorded, so nothing can silently reach a real
 *     server. A run used to be green only because the configured backend was *unreachable*;
 *     pointing it at a live engine turned 82 passing tests into 21.
 *  3. Recorded escapes fail the test at teardown, naming what escaped, so an unmocked operation
 *     reads as the test-authoring bug it is instead of a mystery timeout.
 */
import { test as base, expect, type Page } from '@playwright/test'

/** Same-origin endpoint handed to the app, so any real GraphQL traffic is cross-origin by design. */
export const E2E_GRAPHQL_ENDPOINT = '/graphql'

const E2E_RUNTIME_CONFIG = {
  graphqlEndpoint: E2E_GRAPHQL_ENDPOINT,
  backendSchemaRange: '~9.3.0',
  googleClientId: 'e2e-google-client-id.apps.googleusercontent.com',
}

/** Per-page log of everything that tried to leave the hermetic sandbox. */
const escapes = new WeakMap<Page, string[]>()

export function escapeLog(page: Page): string[] {
  let log = escapes.get(page)
  if (!log) {
    log = []
    escapes.set(page, log)
  }
  return log
}

function isLocal(url: string, baseURL: string | undefined): boolean {
  if (!baseURL) return false
  try {
    return new URL(url).origin === new URL(baseURL).origin
  } catch {
    return false
  }
}

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const log = escapeLog(page)

    // Catch-all guard, registered first so later routes (config stub, per-spec GraphQL mocks)
    // take precedence — Playwright matches routes in reverse registration order.
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (isLocal(url, baseURL) || url.startsWith('data:') || url.startsWith('blob:')) {
        return route.continue()
      }
      log.push(`cross-origin request to ${url}`)
      return route.abort()
    })

    await page.route('**/config.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(E2E_RUNTIME_CONFIG),
      }),
    )

    // Third-party assets the app loads by URL. Stubbed rather than allow-listed: a test run must
    // not need the internet. Both are safe to serve empty — the font is presentational, and
    // GoogleCredentialButton's initGIS() early-returns when `window.google` is undefined.
    await page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    )
    await page.route('https://accounts.google.com/gsi/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
    )

    await use(page)

    // Teardown assertion: report the cause, not a downstream symptom. Deduplicated because a
    // retrying app can emit the same escape many times.
    const unique = [...new Set(log)]
    expect(
      unique,
      `Test escaped the hermetic sandbox. Mock these in the spec:\n  - ${unique.join('\n  - ')}\n`,
    ).toEqual([])
  },
})

export { expect }
