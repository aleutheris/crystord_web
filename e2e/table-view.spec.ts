import { test, expect } from '@playwright/test'

// EPIC-260071 / ADR-260062: Table center view — tri-view registration, sorted rows with a
// computed indicator, shared selection, inline edit via the change mutation, VIEWER gating.
function mockGraphQL(page: import('@playwright/test').Page) {
  const atoms = [
    {
      labels: ['Project'],
      bonds: [],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      categories: [],
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
      properties: {
        shellies: { uuid: 'atom-2' },
        nuclearies: { title: 'Gamma', description: 'Computed', content: '42', operation: '{"name":"SUM","args":[]}', constants: {} },
      },
    },
    {
      labels: ['Task'],
      bonds: [],
      ownerUuid: 'owner-2',
      accessLevel: 'VIEWER',
      categories: [],
      properties: {
        shellies: { uuid: 'atom-3' },
        nuclearies: { title: 'Beta', description: 'Shared read-only', content: 'Beta body', operation: '', constants: {} },
      },
    },
  ]

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

async function openTableView(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: 'Table' }).click()
  await expect(page.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true')
}

test.describe('Table view', () => {
  test('shows rows sorted by title with the ƒ indicator on the computed atom', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openTableView(page)

    const rows = page.locator('table[aria-label="Atoms table"] tbody tr')
    await expect(rows).toHaveCount(3)
    // Title A–Z: Alpha, Beta, Gamma — not the retrieve order (Alpha, Gamma, Beta).
    await expect(rows.nth(0)).toContainText('Alpha')
    await expect(rows.nth(1)).toContainText('Beta')
    await expect(rows.nth(2)).toContainText('Gamma')

    // Exactly one computed atom, marked ƒ, on the Gamma row.
    await expect(page.getByLabel('Computed atom')).toHaveCount(1)
    await expect(rows.nth(2).getByLabel('Computed atom')).toHaveText('ƒ')
  })

  test('row click selects the atom and opens the shared inspector', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openTableView(page)

    const betaRow = page.locator('table[aria-label="Atoms table"] tbody tr').nth(1)
    await betaRow.click()

    await expect(betaRow).toHaveAttribute('aria-current', 'true')
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await expect(detailPanel).toBeVisible()
    await expect(detailPanel.getByLabel(/title/i)).toHaveValue('Beta')
  })

  test('editing a title cell dispatches the change mutation', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openTableView(page)

    await page.getByRole('button', { name: 'Edit title of Alpha' }).click()
    const input = page.getByLabel('Edit title of Alpha')
    await input.fill('AlphaEdited')

    const changeResponse = page.waitForResponse((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
    )
    await input.press('Enter')
    await changeResponse

    // The post-save refetch echoes the update — the cell reflects it without a manual refresh.
    await expect(page.getByRole('button', { name: 'Edit title of AlphaEdited' })).toBeVisible()

    // Cross-view mutation reflection (ADR-260062): the same atom carries the new title in the
    // Network view with no extra wiring — all views render the one GraphData.
    await page.getByRole('tab', { name: 'Network' }).click()
    await expect(page.getByRole('region', { name: 'Network view graph canvas' })).toContainText('AlphaEdited')
  })

  test('a VIEWER row exposes no edit affordances', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openTableView(page)

    const rows = page.locator('table[aria-label="Atoms table"] tbody tr')
    // Editable OWNER row proves the affordance exists…
    await expect(rows.nth(0).getByRole('button', { name: 'Edit title of Alpha' })).toBeVisible()
    // …while the VIEWER row (Beta) renders no buttons and no label editor at all.
    await expect(rows.nth(1).getByRole('button')).toHaveCount(0)
    await expect(rows.nth(1).getByLabel('Add label')).toHaveCount(0)
  })
})
