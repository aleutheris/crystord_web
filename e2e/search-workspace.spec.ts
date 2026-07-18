import { test, expect } from '@playwright/test'

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
      bonds: [{ uuid: 'atom-2', name: 'DEPENDS_ON', direction: 'from' }],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      categories: [],
      ...evaluationFields('atom-1'),
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
      ...evaluationFields('atom-2'),
      properties: {
        shellies: { uuid: 'atom-2' },
        nuclearies: { title: 'Beta', description: 'Second', content: 'Pending', operation: '', constants: {} },
      },
    },
    {
      labels: ['Project', 'Active'],
      bonds: [],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      categories: [],
      ...evaluationFields('atom-3'),
      properties: {
        shellies: { uuid: 'atom-3' },
        nuclearies: { title: 'Gamma', description: 'Third', content: 'Done', operation: '', constants: {} },
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
        body: JSON.stringify({ data: { listLabels: ['Active', 'Project', 'Task'] } }),
      })
    }

    if (query.includes('retrieve')) {
      const vars = body.variables as Record<string, unknown> | undefined
      const filterLabels = vars?.['labels'] as string[] | undefined
      const result = filterLabels && filterLabels.length > 0
        ? atoms.filter((a) => a.labels.some((l) => filterLabels.includes(l)))
        : atoms
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieve: result } }),
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
  // These scenarios assert atom visibility on the Network canvas; the compute default now
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
  await page.getByRole('button', { name: /search/i }).click()
  await retrieveResponse
}

test.describe('Search and discoverability', () => {
  test('recommended label chips are visible in blank workspace before search', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await expect(page.getByLabel(/search labels/i)).toBeVisible()
    await expect(page.getByText('Alpha')).not.toBeVisible()
    // Recommended labels from listLabels are visible before any search
    await expect(page.getByRole('button', { name: 'Active' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Project' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Task' })).toBeVisible()
  })

  test('label chips remain available after search loads atoms', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    await expect(page.getByRole('button', { name: 'Project' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Task' })).toBeVisible()
  })

  test('typing alone does not trigger search', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    await page.getByLabel(/search labels/i).fill('proj')

    // Typing alone must not run a query — no active query summary, no atoms in the graph
    await expect(page.getByRole('status', { name: /active query/i })).not.toBeVisible()
    await expect(page.getByText('Alpha', { exact: true })).not.toBeVisible()
  })

  test('committing label chip and submitting shows backend-filtered results', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Project')
    await page.keyboard.press(' ')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await page.keyboard.press('Enter')
    await retrieveResponse

    // Backend-filtered atoms (Alpha and Gamma have the Project label) appear in the graph and the
    // query summary becomes active. (The result list returns with the Table view, EPIC-260071.)
    await expect(page.getByRole('status', { name: /active query/i })).toBeVisible()
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible()
    await expect(page.getByText('Gamma', { exact: true })).toBeVisible()
  })

  test('label chip filter scopes results via backend query', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    // Click Task label chip to add it to selectedLabels, then submit
    await page.getByRole('button', { name: 'Task' }).click()

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await page.getByLabel(/search labels/i).click()
    await page.keyboard.press('Enter')
    await retrieveResponse

    await expect(page.getByText('1 result')).toBeVisible()
    await expect(page.getByText('Beta', { exact: true })).toBeVisible()
  })

  test('clicking a search result selects the atom', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    // Commit 'Task' chip and submit
    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Task')
    await page.keyboard.press(' ')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await page.keyboard.press('Enter')
    await retrieveResponse

    await page.getByText('Beta', { exact: true }).click()

    // Detail panel opens for the clicked atom
    const detailPanel = page.getByRole('complementary', { name: /atom details/i })
    await expect(detailPanel).toBeVisible()
    await expect(detailPanel.getByLabel(/title/i)).toHaveValue('Beta')
  })

  test('clear button removes the active search query', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    // Commit 'Task' chip and submit
    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Task')
    await page.keyboard.press(' ')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await page.keyboard.press('Enter')
    await retrieveResponse

    await expect(page.getByText('Beta', { exact: true })).toBeVisible()
    await expect(page.getByRole('status', { name: /active query/i })).toBeVisible()

    await page.getByLabel(/clear search/i).click()

    // Clear removes the active query summary; the graph retains the last results until the next
    // search (the result-list representation returns with the Table view, EPIC-260071).
    await expect(page.getByRole('status', { name: /active query/i })).not.toBeVisible()
  })

  test('typing a label and pressing Space creates a chip and clears the input', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Project')
    await page.keyboard.press(' ')

    await expect(page.getByRole('button', { name: /remove project/i })).toBeVisible()
    await expect(searchInput).toHaveValue('')
  })

  test('multiple chips can be added in sequence', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Alpha')
    await page.keyboard.press(' ')
    await page.keyboard.type('Beta')
    await page.keyboard.press(':')

    await expect(page.getByRole('button', { name: /remove alpha/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /remove beta/i })).toBeVisible()
    await expect(searchInput).toHaveValue('')
  })

  test('submitted search with label chip passes labels to backend query', async ({ page }) => {
    const taskAtom = {
      labels: ['Task'],
      bonds: [],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      categories: [],
      ...evaluationFields('atom-2'),
      properties: {
        shellies: { uuid: 'atom-2' },
        nuclearies: { title: 'Beta', description: 'Second', content: 'Pending', operation: '', constants: {} },
      },
    }

    await page.route('**/{api,graphql}', (route) => {
      const postData = route.request().postData()
      if (!postData) return route.continue()
      const body = JSON.parse(postData)
      const query: string = body.query ?? ''
      const vars: Record<string, unknown> = body.variables ?? {}

      if (query.includes('schemaInfo')) {
        return route.fulfill({
          status: 200, contentType: 'application/json',
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
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: { signin: 'mock-token' } }),
        })
      }
      if (query.includes('listLabels')) {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: { listLabels: ['Active', 'Project', 'Task'] } }),
        })
      }
      if (query.includes('retrieve')) {
        const labels = vars['labels'] as string[] | undefined
        const result = labels?.includes('Task') ? [taskAtom] : []
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: { retrieve: result } }),
        })
      }
      return route.continue()
    })

    await signIn(page)

    // Commit 'Task' chip then submit
    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Task')
    await page.keyboard.press(' ')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await page.keyboard.press('Enter')
    await retrieveResponse

    // Backend-filtered result: only Beta visible, not Alpha
    await expect(page.getByText('Beta', { exact: true })).toBeVisible()
  })

  test('typing a label and pressing Enter auto-chips text and executes search', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Project')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await page.keyboard.press('Enter')
    await retrieveResponse

    // Text was auto-chipped before submit
    await expect(page.getByRole('button', { name: /remove project/i })).toBeVisible()
    await expect(searchInput).toHaveValue('')
    // Backend results shown (Project atoms appear in the graph)
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible()
  })

  test('committed chips plus typed label on Enter submits all labels', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Project')
    await page.keyboard.press(' ')
    await page.keyboard.type('Task')

    const retrieveResponse = page.waitForResponse(
      (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
    )
    await page.keyboard.press('Enter')
    await retrieveResponse

    await expect(page.getByRole('button', { name: /remove project/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /remove task/i })).toBeVisible()
    await expect(searchInput).toHaveValue('')
  })

  test('repeated search with same labels triggers fresh backend query each time', async ({ page }) => {
    let retrieveCallCount = 0
    await page.route('**/{api,graphql}', (route) => {
      const postData = route.request().postData()
      if (!postData) return route.continue()
      const body = JSON.parse(postData)
      const query: string = body.query ?? ''

      if (query.includes('retrieve')) {
        retrieveCallCount++
      }
      if (query.includes('schemaInfo')) {
        return route.fulfill({
          status: 200, contentType: 'application/json',
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
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: { signin: 'mock-token' } }),
        })
      }
      if (query.includes('listLabels')) {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: { listLabels: ['Active', 'Project', 'Task'] } }),
        })
      }
      if (query.includes('retrieve')) {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: { retrieve: [] } }),
        })
      }
      return route.continue()
    })

    await signIn(page)

    const searchInput = page.getByLabel(/search labels/i)

    // First search
    await searchInput.click()
    await page.keyboard.type('Project')
    const first = page.waitForResponse((r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true)
    await page.keyboard.press('Enter')
    await first

    // Second search with same label
    await page.keyboard.type('Project')
    const second = page.waitForResponse((r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true)
    await page.keyboard.press('Enter')
    await second

    expect(retrieveCallCount).toBe(2)
  })

  test('Backspace removes the last chip when input is empty', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const searchInput = page.getByLabel(/search labels/i)
    await searchInput.click()
    await page.keyboard.type('Alpha')
    await page.keyboard.press(' ')
    await page.keyboard.type('Beta')
    await page.keyboard.press(' ')

    await expect(page.getByRole('button', { name: /remove beta/i })).toBeVisible()

    await page.keyboard.press('Backspace')

    await expect(page.getByRole('button', { name: /remove beta/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /remove alpha/i })).toBeVisible()
  })
})
