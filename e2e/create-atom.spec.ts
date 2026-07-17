import { test, expect } from '@playwright/test'

const BASE_ATOMS = [
  {
    labels: ['Project'],
    bonds: [],
    ownerUuid: 'owner-1',
    accessLevel: 'OWNER',
    categories: [],
    properties: {
      shellies: { uuid: 'atom-1' },
      nuclearies: { title: 'Alpha', description: 'First', content: 'Active', operation: '', constants: {} },
    },
  },
  {
    labels: ['Task'],
    bonds: [],
    ownerUuid: 'owner-1',
    accessLevel: 'OWNER',
    categories: [],
    properties: {
      shellies: { uuid: 'atom-2' },
      nuclearies: { title: 'Beta', description: 'Second', content: 'Pending', operation: '', constants: {} },
    },
  },
]

const NEW_ATOM = {
  labels: ['Project'],
  bonds: [],
  ownerUuid: 'owner-1',
  accessLevel: 'OWNER',
  categories: [],
  properties: {
    shellies: { uuid: 'new-uuid' },
    nuclearies: { title: 'Gamma', description: 'New atom', content: '', operation: '', constants: {} },
  },
}

function mockGraphQL(
  page: import('@playwright/test').Page,
  atomsAfterCreate?: typeof BASE_ATOMS,
) {
  let retrieveAtoms = BASE_ATOMS
  return page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.continue()
    const body = JSON.parse(postData)
    const query: string = body.query ?? ''

    if (query.includes('schemaInfo')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            schemaInfo: {
              schemaVersion: '9.2.0',
              schemaHash: '6e1c4572d4a6d485702dc8a3c46491d51b8fc1fb34c032474f4e54e8a4ba01b8',
              releasedAt: '2026-05-27T00:00:00Z',
            },
          },
        }),
      })
    }
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
    if (query.includes('retrieve')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieve: retrieveAtoms } }),
      })
    }
    if (query.includes('change') && !body.variables?.selector) {
      if (atomsAfterCreate) retrieveAtoms = atomsAfterCreate
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { change: ['new-uuid'] } }),
      })
    }
    return route.continue()
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

test.describe('Explicit atom creation', () => {
  test('Create Atom button is visible on the network canvas', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await expect(page.getByRole('button', { name: /create atom/i })).toBeVisible()
  })

  test('Create Atom button is visible on the flow canvas', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await page.getByRole('tab', { name: 'Flow' }).click()
    await submitSearch(page)

    await expect(page.getByRole('button', { name: /create atom/i })).toBeVisible()
  })

  test('clicking Create Atom opens the creation sidebar panel', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()

    const creationPanel = page.getByRole('complementary', { name: /create atom/i })
    await expect(creationPanel).toBeVisible()
    await expect(creationPanel.getByRole('heading', { name: /create new atom/i })).toBeVisible()
  })

  test('creation panel has empty form fields', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()

    const panel = page.getByRole('complementary', { name: /create atom/i })
    await expect(panel.getByLabel(/title/i)).toHaveValue('')
    // Labels use the shared chip editor (ADR-260063): empty input, no chips yet.
    await expect(panel.getByLabel('Add label')).toHaveValue('')
    await expect(panel.getByRole('button', { name: /^remove /i })).toHaveCount(0)
    await expect(panel.getByLabel(/description/i)).toHaveValue('')
    await expect(panel.getByLabel(/content/i)).toHaveValue('')
  })

  test('creation panel shows Create button, not Save', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()

    const panel = page.getByRole('complementary', { name: /create atom/i })
    await expect(panel.getByRole('button', { name: /^create$/i })).toBeVisible()
    await expect(panel.getByRole('button', { name: /^save$/i })).not.toBeVisible()
  })

  test('creation panel has no Delete button', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()

    const panel = page.getByRole('complementary', { name: /create atom/i })
    await expect(panel.getByRole('button', { name: /delete/i })).not.toBeVisible()
  })

  test('filling form and clicking Create dispatches mutation and shows success notification', async ({ page }) => {
    await mockGraphQL(page, [...BASE_ATOMS, NEW_ATOM])
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()

    const panel = page.getByRole('complementary', { name: /create atom/i })
    await panel.getByLabel(/title/i).fill('Gamma')
    await panel.getByLabel('Add label').fill('Project')
    await panel.getByLabel('Add label').press('Enter')
    await panel.getByLabel(/description/i).fill('New atom')

    const createResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
    )
    await panel.getByRole('button', { name: /^create$/i }).click()
    await createResponse

    await expect(page.getByRole('status', { name: /atom created/i })).toBeVisible()
  })

  test('creation panel closes after successful creation', async ({ page }) => {
    await mockGraphQL(page, [...BASE_ATOMS, NEW_ATOM])
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()

    const panel = page.getByRole('complementary', { name: /create atom/i })
    await panel.getByLabel(/title/i).fill('Gamma')

    const createResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
    )
    await panel.getByRole('button', { name: /^create$/i }).click()
    await createResponse

    await expect(page.getByRole('complementary', { name: /create atom/i })).not.toBeVisible()
  })

  test('newly created atom appears on canvas when it matches the current search', async ({ page }) => {
    await mockGraphQL(page, [...BASE_ATOMS, NEW_ATOM])
    await signIn(page)
    await submitSearch(page)

    await expect(page.getByText('Gamma')).not.toBeVisible()

    await page.getByRole('button', { name: /create atom/i }).click()
    const panel = page.getByRole('complementary', { name: /create atom/i })
    await panel.getByLabel(/title/i).fill('Gamma')
    await panel.getByLabel('Add label').fill('Project')
    await panel.getByLabel('Add label').press('Enter')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await panel.getByRole('button', { name: /^create$/i }).click()
    await retrieveResponse

    await expect(page.getByText('Gamma')).toBeVisible()
  })

  test('newly created atom does not appear on canvas when it does not match the current search', async ({ page }) => {
    // After create the retrieve response still returns only BASE_ATOMS (non-matching)
    await mockGraphQL(page, BASE_ATOMS)
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()
    const panel = page.getByRole('complementary', { name: /create atom/i })
    await panel.getByLabel(/title/i).fill('Gamma')
    await panel.getByLabel('Add label').fill('Other')
    await panel.getByLabel('Add label').press('Enter')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await panel.getByRole('button', { name: /^create$/i }).click()
    await retrieveResponse

    // Success notification still appears even though the new atom is not on the canvas
    await expect(page.getByRole('status', { name: /atom created/i })).toBeVisible()
    // "Gamma" must not appear as a canvas node (the notification contains the title too, so scope to nodes)
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Gamma' })).not.toBeVisible()
  })

  test('clicking Cancel closes the creation panel without creating an atom', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('button', { name: /create atom/i }).click()

    const panel = page.getByRole('complementary', { name: /create atom/i })
    await expect(panel).toBeVisible()
    await panel.getByLabel(/title/i).fill('ShouldNotExist')

    await panel.getByRole('button', { name: /close panel/i }).click()

    await expect(page.getByRole('complementary', { name: /create atom/i })).not.toBeVisible()
    await expect(page.getByText('ShouldNotExist')).not.toBeVisible()
  })

  test('double-clicking the canvas pane no longer creates an atom', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByRole('tab', { name: 'Flow' }).click()

    const atomsBefore = await page.locator('.react-flow__node').count()
    const canvas = page.locator('.react-flow__pane')
    await canvas.dblclick({ position: { x: 50, y: 50 } })

    const atomsAfter = await page.locator('.react-flow__node').count()
    expect(atomsAfter).toBe(atomsBefore)
  })
})
