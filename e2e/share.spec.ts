import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'

// EPIC-260074 / ADR-260069: Share inspector tab — owner-only grants list, the grant flow
// (principal/type/level payload + refetch), the two-step revoke, and the non-owner gate.

interface MockGrant {
  principalUuid: string
  principalType: 'USER' | 'WORKSPACE'
  principalName: string
  level: 'EDITOR' | 'VIEWER'
  grantedAt: string
  grantedBy: string
}

function makeGrant(name: string, overrides?: Partial<MockGrant>): MockGrant {
  return {
    principalUuid: `uuid-${name}`,
    principalType: 'USER',
    principalName: name,
    level: 'EDITOR',
    grantedAt: '2026-07-01T10:00:00Z',
    grantedBy: 'owner-1',
    ...overrides,
  }
}

// Evaluation-reporting fields selected by RETRIEVE_QUERY since ADR-260065 — mocked on every
// atom so Apollo logs no missing-field warnings.
function evaluationFields(uuid: string) {
  return {
    evaluationStatus: 'success',
    errorCode: null,
    causes: [],
    cycleNodes: [],
    cycleEdges: null,
    originNodeUuid: uuid,
    affectedNodeUuid: uuid,
  }
}

// `grants` is the mutable grant store for atom-1: the shareAtom branch echoes the new grant
// in, revokeAtomAccess removes it — so the refetch-after-mutation shows the server's truth.
function mockGraphQL(page: import('@playwright/test').Page, grants: MockGrant[]) {
  const atoms = [
    {
      labels: ['Project'],
      bonds: [],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      categories: [],
      ...evaluationFields('atom-1'),
      properties: {
        shellies: { uuid: 'atom-1' },
        nuclearies: { title: 'Alpha', description: 'First', content: 'Alpha body', operation: '', constants: {} },
      },
    },
    {
      labels: ['Task'],
      bonds: [],
      ownerUuid: 'owner-2',
      accessLevel: 'VIEWER',
      categories: [],
      ...evaluationFields('atom-2'),
      properties: {
        shellies: { uuid: 'atom-2' },
        nuclearies: { title: 'Beta', description: 'Shared read-only', content: 'Beta body', operation: '', constants: {} },
      },
    },
  ]

  return page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.fallback()

    const body = JSON.parse(postData)
    const query: string = body.query ?? ''

    if (query.includes('signin')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { signin: 'mock-token' } }),
      })
    }

    if (query.includes('listLabels')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { listLabels: ['Project', 'Task'] } }),
      })
    }

    // Sharing branches ride before the generic retrieve/change branches (the history.spec.ts
    // ordering rule) even though none of their operation names collide today.
    if (query.includes('listAtomGrants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { listAtomGrants: grants } }),
      })
    }

    if (query.includes('shareAtom')) {
      const { principal, principalType, level } = body.variables as {
        principal: string
        principalType: 'USER' | 'WORKSPACE'
        level: 'EDITOR' | 'VIEWER'
      }
      grants.push(makeGrant(principal, { principalType, level, grantedAt: '2026-07-18T09:00:00Z' }))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { shareAtom: true } }),
      })
    }

    if (query.includes('revokeAtomAccess')) {
      const { principal, principalType } = body.variables as { principal: string; principalType: string }
      const idx = grants.findIndex((g) => g.principalName === principal && g.principalType === principalType)
      if (idx >= 0) grants.splice(idx, 1)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { revokeAtomAccess: true } }),
      })
    }

    if (query.includes('retrieve')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieve: atoms } }),
      })
    }

    return unmockedOperation(page, route, query)
  })
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  const responsePromise = page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('signin') === true,
  )
  await page.getByRole('button', { name: /try a demo/i }).click()
  await responsePromise
}

async function submitSearch(page: import('@playwright/test').Page) {
  const retrieveResponse = page.waitForResponse(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
  )
  await page.getByLabel(/search labels/i).click()
  await page.keyboard.press('Enter')
  await retrieveResponse
}

// Table-row selection (the history.spec.ts approach — robust under the Flow default view).
// Rows sort by title: 0 = Alpha (OWNER), 1 = Beta (VIEWER). The OWNER row is clicked on its
// plain Computed cell — its other cells are edit affordances that would swallow the click.
async function selectAtomViaTable(page: import('@playwright/test').Page, rowIndex: number) {
  await page.getByRole('tab', { name: 'Table' }).click()
  const row = page.locator('table[aria-label="Atoms table"] tbody tr').nth(rowIndex)
  await row.locator('td').last().click()
  await expect(page.getByRole('complementary', { name: /atom details/i })).toBeVisible()
}

function waitForGrants(page: import('@playwright/test').Page) {
  return page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('listAtomGrants') === true,
  )
}

async function openShareTab(page: import('@playwright/test').Page) {
  const grantsResponse = waitForGrants(page)
  await page.getByRole('tab', { name: 'Share' }).click()
  await expect(page.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true')
  await grantsResponse
}

test.describe('Share inspector tab', () => {
  test('the owner sees the Share tab and the mocked grants render', async ({ page }) => {
    await mockGraphQL(page, [
      makeGrant('bob'),
      makeGrant('team-a', { principalType: 'WORKSPACE', level: 'VIEWER' }),
    ])
    await signIn(page)
    await submitSearch(page)
    await selectAtomViaTable(page, 0)
    await openShareTab(page)

    await expect(page.getByText('You own this atom.')).toBeVisible()
    const table = page.locator('table[aria-label="Access grants"]')
    await expect(table.locator('tbody tr')).toHaveCount(2)
    await expect(table).toContainText('bob')
    await expect(table).toContainText('EDITOR')
    await expect(table).toContainText('team-a')
    await expect(table).toContainText('WORKSPACE')
    await expect(table).toContainText('VIEWER')
    // Localized grant timestamp (locale-independent assertion: the year always renders).
    await expect(table).toContainText('2026')
  })

  test('granting access sends principal/type/level and the refetched list shows the new grant', async ({ page }) => {
    await mockGraphQL(page, [])
    await signIn(page)
    await submitSearch(page)
    await selectAtomViaTable(page, 0)
    await openShareTab(page)

    await expect(page.getByText('Not shared with anyone yet.')).toBeVisible()

    await page.getByLabel('Username').fill('carol')
    await page.getByLabel('Access level').selectOption('VIEWER')

    const shareRequest = page.waitForRequest((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.postData()?.includes('shareAtom') === true,
    )
    const refetch = waitForGrants(page)
    await page.getByRole('button', { name: 'Share' }).click()

    const vars = JSON.parse((await shareRequest).postData()!).variables
    expect(vars).toEqual({ atomUuid: 'atom-1', principal: 'carol', principalType: 'USER', level: 'VIEWER' })

    // The stateful mock echoed the grant — the refetched list shows it.
    await refetch
    const table = page.locator('table[aria-label="Access grants"]')
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table).toContainText('carol')
    await expect(table).toContainText('VIEWER')
    // Scoped to the Share section — the app shell's beta banner is also a status region.
    await expect(page.getByRole('region', { name: 'Share' }).getByRole('status')).toContainText('Shared with carol.')
  })

  test('the workspace principal label follows the type select', async ({ page }) => {
    await mockGraphQL(page, [])
    await signIn(page)
    await submitSearch(page)
    await selectAtomViaTable(page, 0)
    await openShareTab(page)

    await page.getByLabel('Principal type').selectOption('WORKSPACE')
    await expect(page.getByLabel('Workspace key')).toBeVisible()

    await page.getByLabel('Workspace key').fill('team-a')
    const shareRequest = page.waitForRequest((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.postData()?.includes('shareAtom') === true,
    )
    await page.getByRole('button', { name: 'Share' }).click()

    const vars = JSON.parse((await shareRequest).postData()!).variables
    expect(vars).toEqual({ atomUuid: 'atom-1', principal: 'team-a', principalType: 'WORKSPACE', level: 'VIEWER' })
  })

  test('revoking runs the two-step confirm and sends the revoke payload', async ({ page }) => {
    await mockGraphQL(page, [makeGrant('bob')])
    await signIn(page)
    await submitSearch(page)
    await selectAtomViaTable(page, 0)
    await openShareTab(page)

    // Step one arms the confirm — nothing is sent yet.
    await page.getByRole('button', { name: 'Revoke access for bob' }).click()
    await expect(page.getByRole('group', { name: 'Confirm revoke for bob' })).toBeVisible()

    const revokeRequest = page.waitForRequest((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.postData()?.includes('revokeAtomAccess') === true,
    )
    const refetch = waitForGrants(page)
    await page.getByRole('button', { name: 'Confirm revoke' }).click()

    const vars = JSON.parse((await revokeRequest).postData()!).variables
    expect(vars).toEqual({ atomUuid: 'atom-1', principal: 'bob', principalType: 'USER' })

    await refetch
    await expect(page.getByText('Not shared with anyone yet.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Share' }).getByRole('status')).toContainText('Revoked access for bob.')
  })

  test('a non-owner atom shows no Share tab in the inspector strip', async ({ page }) => {
    await mockGraphQL(page, [])
    await signIn(page)
    await submitSearch(page)
    // Row 1 = Beta, the VIEWER atom (no edit affordances — a plain row click selects it).
    await selectAtomViaTable(page, 1)

    // The strip renders (History proves it) but the owner-gated Share tab is absent.
    await expect(page.getByRole('tab', { name: 'History' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Share' })).toHaveCount(0)
  })
})
