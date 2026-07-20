import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'

// EPIC-260075 / ADR-260070: Board center view — dimension picker, root-value columns with
// client-side rollup (a belgium-assigned atom lands under Europe), recategorize via the
// accessible "Move to…" menu (replace-one-dimension payload), VIEWER gating, shared selection.

const DIMENSIONS = [
  { key: 'region', displayName: 'Region', description: '', parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]

const VALUES = [
  { key: 'europe', displayName: 'Europe', description: '', dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'belgium', displayName: 'Belgium', description: '', dimensionKey: 'region', parentValueKeys: ['europe'], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'asia', displayName: 'Asia', description: '', dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]

// The change input carries only valueKeys (replace-all); the echo needs the dimension back.
const VALUE_DIMENSIONS: Record<string, string> = { europe: 'region', belgium: 'region', asia: 'region', q1: 'period' }

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

function mockGraphQL(page: import('@playwright/test').Page) {
  const atoms = [
    {
      labels: ['Project'],
      bonds: [],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      // Assigned to a DESCENDANT (belgium) → must roll up under the Europe column; the
      // second-dimension assignment (period/q1) must survive every board move untouched.
      categories: [
        { dimensionKey: 'region', valueKey: 'belgium' },
        { dimensionKey: 'period', valueKey: 'q1' },
      ],
      ...evaluationFields('atom-1'),
      properties: {
        shellies: { uuid: 'atom-1' },
        nuclearies: { title: 'Alpha', description: 'First', content: 'Alpha body', operation: '', constants: {} },
      },
    },
    {
      labels: ['Task'],
      bonds: [],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      categories: [],
      ...evaluationFields('atom-2'),
      properties: {
        shellies: { uuid: 'atom-2' },
        nuclearies: { title: 'Beta', description: 'Second', content: 'Beta body', operation: '', constants: {} },
      },
    },
    {
      labels: ['Task'],
      bonds: [],
      ownerUuid: 'owner-2',
      accessLevel: 'VIEWER',
      categories: [{ dimensionKey: 'region', valueKey: 'asia' }],
      ...evaluationFields('atom-3'),
      properties: {
        shellies: { uuid: 'atom-3' },
        nuclearies: { title: 'Gamma', description: 'Shared read-only', content: 'Gamma body', operation: '', constants: {} },
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

    // ORDER MATTERS: 'retrieve' is a substring of both taxonomy queries, so they must be
    // matched BEFORE the generic retrieve branch.
    if (query.includes('retrieveCategoryDimensions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieveCategoryDimensions: DIMENSIONS } }),
      })
    }

    if (query.includes('retrieveCategoryValues')) {
      const dimensionKey: string | undefined = body.variables?.selector?.dimensionKey
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { retrieveCategoryValues: VALUES.filter((v) => v.dimensionKey === dimensionKey) },
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
      // Echo the update into the mock store so the post-save refetch returns it —
      // otherwise a lost or malformed update payload would be invisible to the tests.
      const uuid: string | undefined = body.variables?.selector?.uuid
      const input = body.variables?.inputs?.[0]
      const target = atoms.find((a) => a.properties.shellies.uuid === uuid)
      if (target && input) {
        target.labels = input.labels ?? target.labels
        if (input.categories) {
          target.categories = input.categories.map((c: { valueKey: string }) => ({
            dimensionKey: VALUE_DIMENSIONS[c.valueKey] ?? 'region',
            valueKey: c.valueKey,
          }))
        }
        if (input.properties?.nuclearies) {
          Object.assign(target.properties.nuclearies, input.properties.nuclearies)
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

// The default view is Flow (compute emphasis) — the board is reached via its tab.
async function openBoard(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: 'Board' }).click()
  await expect(page.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true')
}

async function chooseRegion(page: import('@playwright/test').Page) {
  await expect(page.getByText('Choose a dimension to lay out the board.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Board dimension' }).selectOption('region')
}

function boardColumn(page: import('@playwright/test').Page, name: string) {
  return page.getByRole('region', { name: `${name} column` })
}

function waitForChange(page: import('@playwright/test').Page) {
  return page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
  )
}

test.describe('Board view', () => {
  test('choosing a dimension lays out Unassigned + root columns with rolled-up placement', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openBoard(page)
    await chooseRegion(page)

    // Columns: leading Unassigned, then the dimension's ROOTS only (Belgium is no column).
    await expect(boardColumn(page, 'Unassigned')).toBeVisible()
    await expect(boardColumn(page, 'Europe')).toBeVisible()
    await expect(boardColumn(page, 'Asia')).toBeVisible()
    await expect(boardColumn(page, 'Belgium')).toHaveCount(0)

    // Rollup: the belgium-assigned Alpha sits under Europe; Beta has no region → Unassigned.
    await expect(boardColumn(page, 'Europe').getByRole('article', { name: 'Alpha' })).toBeVisible()
    await expect(boardColumn(page, 'Unassigned').getByRole('article', { name: 'Beta' })).toBeVisible()
    await expect(boardColumn(page, 'Asia').getByRole('article', { name: 'Gamma' })).toBeVisible()
  })

  test('moving an unassigned card via the Move-to menu assigns the root and relocates the card', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openBoard(page)
    await chooseRegion(page)

    const changePromise = waitForChange(page)
    await page.getByRole('combobox', { name: 'Move Beta to' }).selectOption('asia')
    const changeResponse = await changePromise

    // Replace-one-dimension payload: exactly the new root, nothing else (Beta held no categories).
    const sent = JSON.parse(changeResponse.request().postData()!)
    expect(sent.variables.inputs[0].categories).toEqual([{ valueKey: 'asia' }])

    // The stateful echo relocates the card on the post-save refetch.
    await expect(boardColumn(page, 'Asia').getByRole('article', { name: 'Beta' })).toBeVisible()
    await expect(boardColumn(page, 'Unassigned').getByRole('article', { name: 'Beta' })).toHaveCount(0)
  })

  test('moving to Unassigned clears only the board dimension — other dimensions survive', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openBoard(page)
    await chooseRegion(page)

    const changePromise = waitForChange(page)
    await page.getByRole('combobox', { name: 'Move Alpha to' }).selectOption('__unassigned__')
    const changeResponse = await changePromise

    // The region assignment (belgium) is cleared; the period assignment (q1) SURVIVES.
    const sent = JSON.parse(changeResponse.request().postData()!)
    expect(sent.variables.inputs[0].categories).toEqual([{ valueKey: 'q1' }])

    await expect(boardColumn(page, 'Unassigned').getByRole('article', { name: 'Alpha' })).toBeVisible()
    await expect(boardColumn(page, 'Europe').getByRole('article', { name: 'Alpha' })).toHaveCount(0)
  })

  test('a VIEWER card is not draggable and exposes no move menu', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openBoard(page)
    await chooseRegion(page)

    // The OWNER card proves the affordance exists…
    await expect(page.getByRole('combobox', { name: 'Move Alpha to' })).toBeVisible()
    // …while the VIEWER card (Gamma) renders read-only.
    const gamma = boardColumn(page, 'Asia').getByRole('article', { name: 'Gamma' })
    await expect(gamma).toHaveAttribute('draggable', 'false')
    await expect(page.getByRole('combobox', { name: 'Move Gamma to' })).toHaveCount(0)
  })

  test('card click selects the atom and opens the shared inspector', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openBoard(page)
    await chooseRegion(page)

    const alpha = boardColumn(page, 'Europe').getByRole('article', { name: 'Alpha' })
    await alpha.click()

    await expect(alpha).toHaveAttribute('aria-current', 'true')
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await expect(detailPanel).toBeVisible()
    await expect(detailPanel.getByLabel(/title/i)).toHaveValue('Alpha')
  })
})
