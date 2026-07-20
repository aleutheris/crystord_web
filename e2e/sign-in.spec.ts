import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'

function mockGraphQL(page: import('@playwright/test').Page) {
  return page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.fallback()

    const body = JSON.parse(postData)
    const query: string = body.query ?? ''

    if (query.includes('signin')) {
      const { email, password } = body.variables ?? {}
      if (email === 'demo@demo.invalid' && password === 'crystord-demo') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { signin: 'mock-bearer-token' } }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { signin: null }, errors: [{ message: 'Invalid credentials' }] }),
      })
    }

    if (query.includes('logout')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { logout: true } }),
      })
    }

    // Workspace bootstrap (recommended labels). Mocked so the post-sign-in shell
    // reaches a stable state instead of churning on a failed live request.
    if (query.includes('listLabels')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { listLabels: ['Project', 'Task'] } }),
      })
    }

    return unmockedOperation(page, route, query)
  })
}

test.describe('Sign-in flow', () => {
  test('redirects unauthenticated user to sign-in page', async ({ page }) => {
    await mockGraphQL(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/username or email/i)).toHaveValue('')
    await expect(page.getByLabel(/password/i)).toHaveValue('')
    await expect(page.getByRole('button', { name: /try a demo/i })).toBeVisible()
  })

  test('signs in with demo credentials and reaches workspace', async ({ page }) => {
    await mockGraphQL(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

    const responsePromise = page.waitForResponse((resp) =>
      /\/(api|graphql)\b/.test(resp.url()) && resp.request().postData()?.includes('signin') === true
    )
    await page.getByRole('button', { name: /try a demo/i }).click()
    await responsePromise

    // The authenticated sentinel is the account-menu trigger (ADR-260066).
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
  })

  test('sign out returns to sign-in page', async ({ page }) => {
    await mockGraphQL(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

    const responsePromise = page.waitForResponse((resp) =>
      /\/(api|graphql)\b/.test(resp.url()) && resp.request().postData()?.includes('signin') === true
    )
    await page.getByRole('button', { name: /try a demo/i }).click()
    await responsePromise

    // Sign Out lives inside the account menu, pinned last (ADR-260066).
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })
})
