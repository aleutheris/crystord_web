import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Read-side access-level affordance gating (BI-260061 / REQ-FR-260069): the detail panel offers
 * edit/delete only where the caller's `AtomOutput.accessLevel` allows it — VIEWER is read-only,
 * EDITOR may edit but not delete (destroy is owner-only), OWNER may do both.
 */
function atom(uuid: string, title: string, accessLevel: 'OWNER' | 'EDITOR' | 'VIEWER') {
  return {
    labels: ['Doc'],
    bonds: [],
    ownerUuid: 'owner-x',
    accessLevel,
    categories: [],
    // Evaluation-reporting fields (ADR-260065) — selected by RETRIEVE_QUERY since EPIC-260069.
    evaluationStatus: 'success',
    errorCode: null,
    causes: [],
    cycleNodes: [],
    cycleEdges: null,
    originNodeUuid: uuid,
    affectedNodeUuid: uuid,
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: 'D', content: 'C', operation: '', constants: {} },
    },
  }
}

function mockGraphQL(page: Page) {
  const atoms = [
    atom('a-own', 'Owned', 'OWNER'),
    atom('a-edit', 'Shared', 'EDITOR'),
    atom('a-view', 'ReadOnly', 'VIEWER'),
  ]
  return page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.continue()
    const body = JSON.parse(postData)
    const query: string = body.query ?? ''
    const ok = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })

    if (query.includes('schemaInfo')) {
      return ok({
        schemaInfo: {
          schemaVersion: '9.2.0',
          schemaHash: '6e1c4572d4a6d485702dc8a3c46491d51b8fc1fb34c032474f4e54e8a4ba01b8',
          releasedAt: '2026-05-27T00:00:00Z',
        },
      })
    }
    if (query.includes('signin')) return ok({ signin: 'mock-token' })
    if (query.includes('listLabels')) return ok({ listLabels: ['Doc'] })
    if (query.includes('retrieve')) return ok({ retrieve: atoms })
    return route.continue()
  })
}

async function signInAndSearch(page: Page) {
  // These scenarios select atoms on the Network canvas; the compute default now lands on
  // Flow (ADR-260065), so prime the relationship emphasis before navigation.
  await page.addInitScript(() => localStorage.setItem('crystord-home-emphasis', 'relationship'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  const signedIn = page.waitForResponse(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('signin') === true,
  )
  await page.getByRole('button', { name: /try a demo/i }).click()
  await signedIn

  await page.getByLabel(/search labels/i).click()
  await page.keyboard.type('Doc')
  const retrieved = page.waitForResponse(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieve') === true,
  )
  await page.keyboard.press('Enter')
  await retrieved
}

async function openDetail(page: Page, title: string) {
  // Select the atom from the graph (the left-rail result list was retired in EPIC-260066 T5;
  // the list representation returns with the Table view, EPIC-260071).
  await page.getByText(title, { exact: true }).click()
  const detail = page.getByRole('complementary', { name: /atom details/i })
  await expect(detail).toBeVisible()
  await expect(detail.getByLabel(/title/i)).toHaveValue(title)
  return detail
}

test.describe('Read-side access-level gating', () => {
  test('VIEWER atom is read-only — no edit save or delete', async ({ page }) => {
    await mockGraphQL(page)
    await signInAndSearch(page)
    const detail = await openDetail(page, 'ReadOnly')

    await expect(detail.getByText(/view-only access/i)).toBeVisible()
    await expect(detail.getByLabel(/title/i)).toHaveAttribute('readonly', '')
    await expect(detail.getByRole('button', { name: /^save$/i })).toHaveCount(0)
    await expect(detail.getByRole('button', { name: /delete/i })).toHaveCount(0)
  })

  test('EDITOR atom can be edited but not deleted', async ({ page }) => {
    await mockGraphQL(page)
    await signInAndSearch(page)
    const detail = await openDetail(page, 'Shared')

    await expect(detail.getByLabel(/title/i)).not.toHaveAttribute('readonly', '')
    await expect(detail.getByRole('button', { name: /^save$/i })).toBeVisible()
    await expect(detail.getByRole('button', { name: /delete/i })).toHaveCount(0)
  })

  test('OWNER atom can be edited and deleted', async ({ page }) => {
    await mockGraphQL(page)
    await signInAndSearch(page)
    const detail = await openDetail(page, 'Owned')

    await expect(detail.getByRole('button', { name: /^save$/i })).toBeVisible()
    await expect(detail.getByRole('button', { name: /delete/i })).toBeVisible()
  })
})
