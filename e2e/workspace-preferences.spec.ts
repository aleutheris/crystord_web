import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Account menu, Preferences, and Workspaces surfaces (ADR-260066 / EPIC-260070): the emphasis
 * preference persists across loads, workspace management fires the schema-9.2.0 mutations, and
 * the menu follows the WAI-ARIA menu keyboard pattern.
 */
function mockGraphQL(page: Page) {
  const members = [
    { userUuid: 'u-1', username: 'demo.user', email: 'demo@crystord.test', role: 'ADMIN', joinedAt: '2026-07-01T00:00:00Z' },
    { userUuid: 'u-2', username: 'ada', email: 'ada@crystord.test', role: 'VIEWER', joinedAt: '2026-07-02T00:00:00Z' },
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

    // Workspace operations FIRST — their names must never be swallowed by a broader branch.
    if (query.includes('listMyWorkspaces')) {
      return ok({
        listMyWorkspaces: [{
          uuid: 'ws-1', key: 'team-a', name: 'Team A', description: null,
          createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', memberCount: 2,
        }],
      })
    }
    if (query.includes('listWorkspaceMembers')) return ok({ listWorkspaceMembers: members })
    if (query.includes('addWorkspaceMember')) return ok({ addWorkspaceMember: { userUuid: 'u-3', username: 'grace', email: 'grace@crystord.test', role: 'EDITOR', joinedAt: '2026-07-18T00:00:00Z' } })
    if (query.includes('dissolveWorkspace')) return ok({ dissolveWorkspace: true })

    if (query.includes('listLabels')) return ok({ listLabels: ['Project', 'Task'] })
    if (query.includes('query Me')) {
      return ok({ me: { username: 'demo.user', email: 'demo@crystord.test', emailVerified: true, authMethods: ['password'] } })
    }
    return route.continue()
  })
}

async function signIn(page: Page) {
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  const signedIn = page.waitForResponse(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('signin') === true,
  )
  await page.getByRole('button', { name: /try a demo/i }).click()
  await signedIn
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
}

test.describe('Preferences and workspace management (ADR-260066)', () => {
  test('switching home emphasis in Preferences lands on Network on the next load', async ({ page }) => {
    await mockGraphQL(page)
    await page.goto('/')
    await signIn(page)

    // Compute default (ADR-260065): Flow is the landing view.
    await expect(page.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: /preferences/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Preferences' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('radio', { name: 'Relationships (Network first)' }).check()
    await dialog.getByRole('button', { name: 'Close preferences' }).click()

    // The demo session is not persisted, so a reload lands on sign-in; the preference is
    // localStorage-backed and must survive into the next session's landing view.
    await page.reload()
    await signIn(page)
    await expect(page.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'false')
  })

  test('workspace panel lists workspaces, adds a member, and dissolves after two-step confirm', async ({ page }) => {
    await mockGraphQL(page)
    await page.goto('/')
    await signIn(page)

    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: /workspaces/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Workspaces' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: /Team A/ }).click()
    await expect(dialog.getByText('ada@crystord.test')).toBeVisible()

    // Add a member by username (the caller is ADMIN in the mocked member list).
    await dialog.getByLabel('Add member by username').fill('grace')
    await dialog.getByLabel('New member role').selectOption('EDITOR')
    const addRequest = page.waitForRequest((r) => r.postData()?.includes('addWorkspaceMember') === true)
    await dialog.getByRole('button', { name: 'Add member' }).click()
    const added = await addRequest
    expect(added.postData()).toContain('"username":"grace"')
    expect(added.postData()).toContain('"role":"EDITOR"')
    expect(added.postData()).toContain('"workspaceUuid":"ws-1"')

    // Dissolve requires the explicit two-step confirm.
    await dialog.getByRole('button', { name: 'Dissolve workspace…' }).click()
    const dissolveRequest = page.waitForRequest((r) => r.postData()?.includes('dissolveWorkspace') === true)
    await dialog.getByRole('button', { name: 'Yes, dissolve workspace' }).click()
    const dissolved = await dissolveRequest
    expect(dissolved.postData()).toContain('"uuid":"ws-1"')
  })

  test('menu keyboard: Enter opens onto the first item, ArrowDown reaches Sign Out, Escape closes', async ({ page }) => {
    await mockGraphQL(page)
    await page.goto('/')
    await signIn(page)

    await page.getByRole('button', { name: 'Account menu' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu', { name: 'Account menu' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /^theme:/i })).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Sign Out' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeFocused()
  })
})
