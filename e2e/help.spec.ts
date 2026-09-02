import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'
import type { Page } from '@playwright/test'

/**
 * In-app help (EPIC-260080 / ADR-260085), end to end.
 *
 * Two checks, against the real shell rather than a mounted component: help is one click from the
 * workspace and reads as a modal dialog, and closing it leaves the workspace where it was. That
 * second one is the epic's load-bearing metric — the panel satisfies it by construction because
 * it mounts as a sibling of the workspace tree, and "by construction" is exactly the claim that
 * stops being true the day someone reaches for a route.
 *
 * Nothing here asserts on help *prose*: that is a human read, not coverage (ADR-260085).
 */

function atom(uuid: string, title: string) {
  return {
    labels: ['Project'],
    bonds: [],
    ownerUuid: 'owner-1',
    accessLevel: 'OWNER',
    categories: [],
    evaluationStatus: 'success',
    errorCode: null,
    causes: [],
    cycleNodes: [],
    cycleEdges: null,
    originNodeUuid: uuid,
    affectedNodeUuid: uuid,
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: '', content: '', operation: '', constants: {} },
    },
  }
}

function mockGraphQL(page: Page) {
  const atoms = [atom('atom-1', 'Alpha'), atom('atom-2', 'Beta')]

  void page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.fallback()
    const body = JSON.parse(postData)
    const query: string = body.query ?? ''
    const ok = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })

    if (query.includes('signin')) return ok({ signin: 'mock-token' })
    if (query.includes('listLabels')) return ok({ listLabels: ['Project'] })
    if (query.includes('retrieve')) return ok({ retrieve: atoms })
    return unmockedOperation(page, route, query)
  })
}

async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  const signedIn = page.waitForResponse(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('signin') === true,
  )
  await page.getByRole('button', { name: /try a demo/i }).click()
  await signedIn
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
}

test.describe('In-app help', () => {
  test.beforeEach(async ({ page }) => {
    mockGraphQL(page)
    await signIn(page)
  })

  test('opens in one click from the header and closes again', async ({ page }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Help' }).click()

    const dialog = page.getByRole('dialog', { name: 'Help' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('navigation', { name: 'Help contents' })).toBeVisible()

    await page.getByRole('button', { name: 'Close help' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('leaves the workspace exactly as it was', async ({ page }) => {
    // Build state the user would hate to lose: a working set, and a center view that is not the
    // default. A route would empty both — the working set only repopulates on an explicit search.
    await page.getByRole('button', { name: 'Run search query' }).click()
    await page.getByRole('tab', { name: 'Table' }).click()
    await expect(page.getByRole('row', { name: /Alpha/ })).toBeVisible()

    await page.getByRole('banner').getByRole('button', { name: 'Help' }).click()
    await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Help' })).toHaveCount(0)

    await expect(page.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('row', { name: /Alpha/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Beta/ })).toBeVisible()
  })
})
