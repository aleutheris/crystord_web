import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'

// EPIC-260067 / ADR-260063: Classify inspector tab — colored label chips, category facet chips
// grouped by dimension, pick-mode assignment, and per-chip clear, all through the change mutation.

const DIMENSIONS = [
  { key: 'region', displayName: 'Region', description: '', parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'period', displayName: 'Period', description: '', parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]

const VALUES = [
  { key: 'europe', displayName: 'Europe', description: '', dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'belgium', displayName: 'Belgium', description: '', dimensionKey: 'region', parentValueKeys: ['europe'], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'germany', displayName: 'Germany', description: '', dimensionKey: 'region', parentValueKeys: ['europe'], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'q1', displayName: 'Q1 2026', description: '', dimensionKey: 'period', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]

// The change input carries only valueKeys (replace-all); the echo needs the dimension back.
const VALUE_DIMENSIONS: Record<string, string> = { europe: 'region', belgium: 'region', germany: 'region', q1: 'period' }

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
      categories: [{ dimensionKey: 'region', valueKey: 'belgium' }],
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
        body: JSON.stringify({ data: { listLabels: ['Project', 'Task', 'Urgent'] } }),
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
  // Atoms are selected by clicking them on the Network canvas; the compute default now
  // lands on Flow (ADR-260065), so prime the relationship emphasis before navigation.
  await page.addInitScript(() => localStorage.setItem('crystord-home-emphasis', 'relationship'))
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

async function openClassifyTab(page: import('@playwright/test').Page, atomTitle: string) {
  // exact: true — 'Beta' would otherwise also match the "Beta version." banner text.
  await page.getByText(atomTitle, { exact: true }).click()
  await page.getByRole('tab', { name: 'Classify' }).click()
  await expect(page.getByRole('tab', { name: 'Classify' })).toHaveAttribute('aria-selected', 'true')
}

function waitForChange(page: import('@playwright/test').Page) {
  return page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
  )
}

test.describe('Classify inspector tab', () => {
  test('shows palette-colored label chips and the dimension-grouped category chip', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openClassifyTab(page, 'Alpha')

    // Label pill tinted from the deterministic palette (text always rendered alongside).
    const labelChip = page.getByRole('group', { name: 'Labels' }).locator('span', { hasText: 'Project' })
    await expect(labelChip).toBeVisible()
    await expect(labelChip).toHaveAttribute('style', /var\(--label-chip-/)

    // Category chip grouped under its dimension, with the ancestor path in the tooltip.
    const regionGroup = page.getByRole('group', { name: 'Category dimension Region' })
    await expect(regionGroup).toContainText('Region ▸')
    await expect(regionGroup).toContainText('Belgium')
    await expect(page.getByTitle('Region ▸ Europe ▸ Belgium')).toBeVisible()
  })

  test('adding a label fires the change mutation and the echoed chip appears', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openClassifyTab(page, 'Alpha')

    const changePromise = waitForChange(page)
    await page.getByLabel('Add label').fill('Urgent')
    await page.getByLabel('Add label').press('Enter')
    const changeResponse = await changePromise

    const sent = JSON.parse(changeResponse.request().postData()!)
    expect(sent.variables.inputs[0].labels).toEqual(['Project', 'Urgent'])
    // Replace-all correctness: the untouched assignment rides along.
    expect(sent.variables.inputs[0].categories).toEqual([{ valueKey: 'belgium' }])

    // The post-save refetch echoes the update into a rendered chip.
    await expect(page.getByRole('group', { name: 'Labels' })).toContainText('Urgent')
  })

  test('assigning a category via the picker appends to the replace-all array', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openClassifyTab(page, 'Alpha')

    await page.getByRole('button', { name: 'Assign category' }).click()
    // Role query — a bare getByLabel('Dimension') would also match the "Category dimension …" group.
    await page.getByRole('combobox', { name: 'Dimension' }).selectOption('region')
    await page.getByRole('button', { name: 'Expand Europe' }).click()

    const changePromise = waitForChange(page)
    await page.getByRole('button', { name: 'Germany' }).click()
    const changeResponse = await changePromise

    const sent = JSON.parse(changeResponse.request().postData()!)
    expect(sent.variables.inputs[0].categories).toEqual([{ valueKey: 'belgium' }, { valueKey: 'germany' }])

    // Echoed back and grouped under Region; the picker closed after assigning.
    await expect(page.getByTitle('Region ▸ Europe ▸ Germany')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Dimension' })).toHaveCount(0)
  })

  test('clearing the category chip sends the remaining (empty) replace-all array', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openClassifyTab(page, 'Alpha')

    const changePromise = waitForChange(page)
    await page.getByRole('button', { name: 'Remove category Belgium' }).click()
    const changeResponse = await changePromise

    const sent = JSON.parse(changeResponse.request().postData()!)
    expect(sent.variables.inputs[0].categories).toEqual([])

    await expect(page.getByText('No categories assigned.')).toBeVisible()
  })

  test('a VIEWER atom renders Classify fully read-only', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openClassifyTab(page, 'Beta')

    await expect(page.getByText('You have view-only access to this atom.')).toBeVisible()
    await expect(page.getByLabel('Add label')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Assign category' })).toHaveCount(0)
  })
})
