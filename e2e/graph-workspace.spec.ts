import { test, expect } from '@playwright/test'

function mockGraphQL(page: import('@playwright/test').Page) {
  const atoms = [
    {
      labels: ['Project'],
      bonds: [{ uuid: 'atom-2', name: 'DEPENDS_ON', direction: 'from' }],
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
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { change: ['new-uuid'] } }),
      })
    }

    if (query.includes('destroy')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { destroy: true } }),
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

test.describe('Graph workspace', () => {
  test('shows blank graph after sign-in with recommended labels visible in search bar', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
    await expect(page.getByLabel(/search labels/i)).toBeVisible()
    // Graph is blank — no atom nodes
    await expect(page.getByText('Alpha')).not.toBeVisible()
    await expect(page.getByText('Beta', { exact: true })).not.toBeVisible()
    // Recommended labels from listLabels are visible as search affordances
    await expect(page.getByRole('button', { name: 'Project' })).toBeVisible()
  })

  test('shows the beta notice and lets the user dismiss it', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const banner = page.getByRole('status').filter({ hasText: /beta version/i })
    await expect(banner).toBeVisible()

    await banner.getByRole('button', { name: /dismiss beta notice/i }).click()
    await expect(banner).not.toBeVisible()
  })

  test('atoms appear in graph only after explicit search', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await expect(page.getByText('Alpha')).not.toBeVisible()
    await expect(page.getByText('Beta', { exact: true })).not.toBeVisible()

    await submitSearch(page)

    await expect(page.getByText('Alpha')).toBeVisible()
    await expect(page.getByText('Beta', { exact: true })).toBeVisible()
  })

  test('opens detail panel when clicking an atom node', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByText('Alpha').click()
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await expect(detailPanel).toBeVisible()
    await expect(detailPanel.getByLabel(/title/i)).toHaveValue('Alpha')
    // No labels field in the Details tab anymore — Classify owns labels (ADR-260063).
    await expect(detailPanel.getByLabel(/labels/i)).toHaveCount(0)
    await expect(detailPanel.getByLabel(/description/i)).toHaveValue('First')
  })

  test('closes detail panel', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByText('Alpha').click()
    await expect(page.getByRole('complementary', { name: /atom details/i })).toBeVisible()

    await page.getByRole('button', { name: /close panel/i }).click()
    await expect(page.getByRole('complementary', { name: /atom details/i })).not.toBeVisible()
  })

  test('switches detail panel between atoms', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByText('Alpha').click()
    await expect(page.getByLabel(/title/i)).toHaveValue('Alpha')

    await page.getByText('Beta', { exact: true }).click()
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await expect(detailPanel.getByLabel(/title/i)).toHaveValue('Beta')
  })

  test('edits atom properties via detail panel save', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByText('Alpha').click()
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await expect(detailPanel).toBeVisible()

    // Edit the title field
    await detailPanel.getByLabel(/title/i).fill('AlphaUpdated')

    // Submit the form
    const saveResponse = page.waitForResponse((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
    )
    await detailPanel.getByRole('button', { name: /save/i }).click()
    await saveResponse

    // Workspace remains functional after save
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
  })

  test('shows delete confirmation dialog and cancellation preserves atom', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByText('Alpha').click()
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await expect(detailPanel).toBeVisible()

    // Click delete in detail panel
    await detailPanel.getByRole('button', { name: /delete/i }).click()

    // Confirm dialog appears
    const dialog = page.getByRole('dialog', { name: /confirm deletion/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Alpha')).toBeVisible()

    // Cancel preserves the atom
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Alpha')).toBeVisible()
  })

  test('delete confirmation dispatches destroy mutation', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await page.getByText('Alpha').click()
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await detailPanel.getByRole('button', { name: /delete/i }).click()

    const dialog = page.getByRole('dialog', { name: /confirm deletion/i })
    await expect(dialog).toBeVisible()

    // Confirm deletion
    const destroyResponse = page.waitForResponse((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('destroy') === true,
    )
    await dialog.getByRole('button', { name: /^delete$/i }).click()
    await destroyResponse

    // Workspace remains functional after deletion
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
  })

  test('shows Network view as default after sign-in', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await expect(page.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'false')
  })

  test('can switch to Flow view by clicking the Flow tab', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await page.getByRole('tab', { name: 'Flow' }).click()
    await expect(page.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'false')
  })

  test('can switch views with ArrowRight keyboard navigation on tablist', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await page.getByRole('tablist').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'true')
  })

  test('workspace remains functional after mutation error', async ({ page }) => {
    // Override mock to fail on mutations
    await page.route('**/{api,graphql}', (route) => {
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
          body: JSON.stringify({
            data: {
              retrieve: [
                {
                  labels: ['Project'],
                  bonds: [],
                  ownerUuid: 'owner-1',
                  accessLevel: 'OWNER',
                  categories: [],
                  properties: {
                    shellies: { uuid: 'atom-1' },
                    nuclearies: { title: 'Alpha', description: '', content: '', operation: '', constants: {} },
                  },
                },
              ],
            },
          }),
        })
      }
      // All mutations fail
      if (query.includes('change') || query.includes('destroy')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, errors: [{ message: 'Server error' }] }),
        })
      }
      return route.continue()
    })

    await signIn(page)
    await submitSearch(page)
    await expect(page.getByText('Alpha')).toBeVisible()

    // Attempt to edit — mutation fails but the workspace must not crash
    await page.getByText('Alpha').click()
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await detailPanel.getByLabel(/title/i).fill('AlphaEdited')
    await detailPanel.getByRole('button', { name: /save/i }).click()

    // Workspace still shows existing data and navigation
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
  })
})
