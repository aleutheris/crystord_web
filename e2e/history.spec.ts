import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'

// EPIC-260073 / ADR-260068: History inspector tab — per-atom change events (timestamp, type
// chip, remark, field transitions), the edit-then-view audit flow, refresh, and page-size-probe
// pagination via Show more.

interface MockChangeEvent {
  timestamp: string
  eventType: string
  userId: string
  remark: string | null
  propertyChanges: {
    field: string
    oldValue: unknown
    newValue: unknown
    metrics: { removedCount: number; addedCount: number; totalMembersAfter: number } | null
  }[]
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

// `events` is the mutable newest-first history store for atom-1: the change-mutation branch
// unshifts an echoed event, and tests may unshift directly to simulate another author.
function mockGraphQL(page: import('@playwright/test').Page, events: MockChangeEvent[]) {
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
        body: JSON.stringify({ data: { listLabels: ['Project'] } }),
      })
    }

    // ORDER MATTERS: the history document is the SAME 'retrieve' operation (and 'changes'
    // contains 'change'), so this branch must precede both the generic retrieve branch and
    // the change-mutation branch (the classify.spec.ts taxonomy rule).
    if (query.includes('changes')) {
      const uuid: string = body.variables?.uuid ?? ''
      const limit: number = body.variables?.limit ?? 5
      const offset: number = body.variables?.offset ?? 0
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            retrieve: [
              { properties: { shellies: { uuid, changes: events.slice(offset, offset + limit) } } },
            ],
          },
        }),
      })
    }

    if (query.includes('retrieve')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieve: atoms } }),
      })
    }

    if (query.includes('change')) {
      // Echo the update into the mock stores: the atom for the post-save refetch, and a new
      // newest-first history event so viewing History after an edit shows the audit trail.
      const uuid: string | undefined = body.variables?.selector?.uuid
      const input = body.variables?.inputs?.[0]
      const target = atoms.find((a) => a.properties.shellies.uuid === uuid)
      if (target && input?.properties?.nuclearies) {
        const oldTitle = target.properties.nuclearies.title
        Object.assign(target.properties.nuclearies, input.properties.nuclearies)
        const newTitle = target.properties.nuclearies.title
        if (newTitle !== oldTitle) {
          events.unshift({
            timestamp: '2026-07-18T12:00:00Z',
            eventType: 'UPDATE',
            userId: 'demo-user-0001',
            remark: null,
            propertyChanges: [{ field: 'title', oldValue: oldTitle, newValue: newTitle, metrics: null }],
          })
        }
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { change: [uuid ?? 'atom-1'] } }),
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

// Table-row selection (the table-view.spec.ts approach — robust under the Flow default view).
// The click targets the plain Computed cell: the OWNER row's other cells are edit affordances
// that would swallow the click instead of selecting the row.
async function selectAtomViaTable(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: 'Table' }).click()
  const row = page.locator('table[aria-label="Atoms table"] tbody tr').first()
  await row.locator('td').last().click()
  await expect(page.getByRole('complementary', { name: /atom details/i })).toBeVisible()
}

function waitForChanges(page: import('@playwright/test').Page) {
  return page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('changes') === true,
  )
}

async function openHistoryTab(page: import('@playwright/test').Page) {
  const changesResponse = waitForChanges(page)
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
  await changesResponse
}

function makeEvent(n: number, overrides?: Partial<MockChangeEvent>): MockChangeEvent {
  return {
    timestamp: `2026-06-${String(30 - n).padStart(2, '0')}T10:00:00Z`,
    eventType: 'UPDATE',
    userId: `author-uuid-${n}`,
    remark: `event ${n}`,
    propertyChanges: [],
    ...overrides,
  }
}

test.describe('History inspector tab', () => {
  test('lists the mocked change events: timestamp, type chip, remark, field transition, metrics', async ({ page }) => {
    const events: MockChangeEvent[] = [
      makeEvent(0, {
        eventType: 'UPDATE',
        remark: 'corrected the name',
        propertyChanges: [
          { field: 'title', oldValue: 'Alpha v1', newValue: 'Alpha', metrics: null },
          {
            field: 'labels',
            oldValue: ['Draft'],
            newValue: ['Project'],
            metrics: { removedCount: 1, addedCount: 1, totalMembersAfter: 1 },
          },
        ],
      }),
      makeEvent(1, { eventType: 'CREATE', remark: null }),
    ]
    await mockGraphQL(page, events)
    await signIn(page)
    await submitSearch(page)
    await selectAtomViaTable(page)
    await openHistoryTab(page)

    const list = page.getByRole('list', { name: 'Change events' })
    await expect(list.locator('> li')).toHaveCount(2)
    // Localized timestamp (locale-independent assertion: the year always renders).
    await expect(list.locator('> li').first()).toContainText('2026')
    await expect(list).toContainText('CREATE')
    await expect(list).toContainText('corrected the name')
    // Field transition `field: old → new` plus the membership metrics line.
    await expect(list).toContainText('title')
    await expect(list).toContainText('Alpha v1')
    await expect(list).toContainText('removed 1 · added 1 · 1 total')
    // Honest identity: shortened id, full id carried on the element.
    await expect(page.getByLabel('Author id author-uuid-0')).toHaveAttribute('title', 'author-uuid-0')
  })

  test('editing the atom title then viewing History shows the echoed event; refresh picks up later ones', async ({ page }) => {
    const events: MockChangeEvent[] = [makeEvent(1, { eventType: 'CREATE', remark: null })]
    await mockGraphQL(page, events)
    await signIn(page)
    await submitSearch(page)
    await selectAtomViaTable(page)

    // Edit through the inspector Details form (the epic's validation flow: edit, then audit).
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await detailPanel.getByLabel(/title/i).fill('AlphaEdited')
    const changeResponse = page.waitForResponse((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
    )
    await detailPanel.getByRole('button', { name: 'Save' }).click()
    await changeResponse

    await openHistoryTab(page)
    const list = page.getByRole('list', { name: 'Change events' })
    await expect(list.locator('> li')).toHaveCount(2)
    await expect(list).toContainText('title')
    await expect(list).toContainText('AlphaEdited')

    // Another author records an event meanwhile (test-side store push) — refresh re-fetches
    // page 0 and surfaces it without re-selecting the atom.
    events.unshift(makeEvent(9, { remark: 'recorded elsewhere' }))
    const refreshResponse = waitForChanges(page)
    await page.getByRole('button', { name: 'Refresh history' }).click()
    await refreshResponse
    await expect(list.locator('> li')).toHaveCount(3)
    await expect(list).toContainText('recorded elsewhere')
  })

  test('Show more appends the next page and disappears once a short page arrives', async ({ page }) => {
    const events: MockChangeEvent[] = Array.from({ length: 12 }, (_, n) => makeEvent(n))
    await mockGraphQL(page, events)
    await signIn(page)
    await submitSearch(page)
    await selectAtomViaTable(page)
    await openHistoryTab(page)

    const list = page.getByRole('list', { name: 'Change events' })
    await expect(list.locator('> li')).toHaveCount(10)
    await expect(list).toContainText('event 0')
    await expect(list).not.toContainText('event 11')

    const nextPage = waitForChanges(page)
    await page.getByRole('button', { name: 'Show more' }).click()
    await nextPage

    // The short page (2 < PAGE_SIZE) proves the end — the button hides (ADR-260068).
    await expect(list.locator('> li')).toHaveCount(12)
    await expect(list).toContainText('event 11')
    await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0)
  })
})
