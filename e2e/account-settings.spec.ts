import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'
import type { Page } from '@playwright/test'

/**
 * Account-settings management flows (BI-260060): email change (happy path) and account deletion
 * blocked by a server policy reason. The GraphQL mock is stateful for the email so the identity
 * overview reflects the confirmed change.
 */
function mockGraphQL(page: Page, opts: { deleteError?: string } = {}) {
  let currentEmail = 'old@crystord.test'
  let pendingEmail = ''

  return page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.fallback()

    const body = JSON.parse(postData)
    const query: string = body.query ?? ''
    const ok = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })
    const fail = (message: string, field: string) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: null }, errors: [{ message }] }),
      })

    if (query.includes('signin')) return ok({ signin: 'mock-token' })
    if (query.includes('listLabels')) return ok({ listLabels: ['Project', 'Task'] })

    if (query.includes('RequestEmailChange')) {
      pendingEmail = body.variables?.newEmail ?? ''
      return ok({ requestEmailChange: true })
    }
    if (query.includes('ConfirmEmailChange')) {
      currentEmail = pendingEmail
      return ok({ confirmEmailChange: true })
    }
    if (query.includes('DeleteMyAccount')) {
      if (opts.deleteError) return fail(opts.deleteError, 'deleteMyAccount')
      return ok({ deleteMyAccount: true })
    }
    if (query.includes('query Me')) {
      return ok({ me: { username: 'demo.user', email: currentEmail, emailVerified: true, authMethods: ['password', 'google'] } })
    }

    return unmockedOperation(page, route, query)
  })
}

async function signInAndOpenSettings(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  const signedIn = page.waitForResponse(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('signin') === true,
  )
  await page.getByRole('button', { name: /try a demo/i }).click()
  await signedIn
  // The panel opens from the account menu (ADR-260066).
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: /account settings/i }).click()
  await expect(page.getByRole('dialog', { name: /account settings/i })).toBeVisible()
}

test.describe('Account settings — management flows', () => {
  test('changes email via the new-address code and reflects it in the overview', async ({ page }) => {
    await mockGraphQL(page)
    await signInAndOpenSettings(page)
    await expect(page.getByText('old@crystord.test')).toBeVisible()

    await page.getByLabel(/new email address/i).fill('new@crystord.test')
    const requested = page.waitForResponse(
      (r) => r.request().postData()?.includes('RequestEmailChange') === true,
    )
    await page.getByRole('button', { name: /send code/i }).click()
    await requested

    await page.getByLabel(/enter the code sent to/i).fill('123456')
    const confirmed = page.waitForResponse(
      (r) => r.request().postData()?.includes('ConfirmEmailChange') === true,
    )
    await page.getByRole('button', { name: /confirm change/i }).click()
    await confirmed

    const dialog = page.getByRole('dialog', { name: /account settings/i })
    await expect(dialog.getByRole('status')).toHaveText(/email updated/i)
    await expect(dialog.getByText('new@crystord.test')).toBeVisible()
  })

  test('blocks deletion with a clear reason when the account still owns atoms', async ({ page }) => {
    await mockGraphQL(page, { deleteError: 'CR-15-OWNED-ATOMS-EXIST' })
    await signInAndOpenSettings(page)

    await page.getByRole('button', { name: /^delete account$/i }).click()
    const deleted = page.waitForResponse(
      (r) => r.request().postData()?.includes('DeleteMyAccount') === true,
    )
    await page.getByRole('button', { name: /yes, delete my account/i }).click()
    await deleted

    await expect(page.getByRole('dialog', { name: /account settings/i }).getByRole('alert')).toHaveText(/still own atoms/i)
    // The session is intact — the user stays in the workspace rather than being routed to sign-in.
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
  })
})
