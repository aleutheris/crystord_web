import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'
import type { Page } from '@playwright/test'

/**
 * Left-rail drag resize (ADR-260073 / EPIC-260077): pointer drag and keyboard both move the
 * WAI-ARIA `separator` handle, the width persists across a reload via localStorage (the same
 * mechanism as the home-emphasis preference in workspace-preferences.spec.ts), and double-click
 * resets to the default.
 */
function mockGraphQL(page: Page) {
  return page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.fallback()

    const body = JSON.parse(postData)
    const query: string = body.query ?? ''
    const ok = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })

    if (query.includes('signin')) return ok({ signin: 'mock-token' })
    if (query.includes('listLabels')) return ok({ listLabels: ['Project', 'Task'] })
    return unmockedOperation(page, route, query)
  })
}

async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  const signedIn = page.waitForResponse(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('signin') === true,
  )
  await page.getByRole('button', { name: /try a demo/i }).click()
  await signedIn
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
}

test.describe('Left rail resize (ADR-260073 / EPIC-260077)', () => {
  test('dragging the handle widens the rail, and the width survives a reload', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const explorer = page.getByRole('complementary', { name: 'Explorer' })
    const handle = page.getByRole('separator', { name: /resize explorer panel/i })

    const before = await explorer.boundingBox()
    const handleBox = await handle.boundingBox()
    if (!before || !handleBox) throw new Error('expected bounding boxes to be available')

    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 80, startY, { steps: 5 })
    await page.mouse.up()

    const after = await explorer.boundingBox()
    expect(after!.width).toBeGreaterThan(before.width + 60)
    expect(after!.width).toBeLessThan(before.width + 100)

    // Demo sessions don't persist, but the width preference is localStorage-backed — reload
    // lands back on sign-in, and the resized width must still be there once signed back in.
    await page.reload()
    await signIn(page)
    const afterReload = await page.getByRole('complementary', { name: 'Explorer' }).boundingBox()
    expect(afterReload!.width).toBeGreaterThan(before.width + 60)
  })

  test('keyboard resize steps the width, and double-click resets to default', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const explorer = page.getByRole('complementary', { name: 'Explorer' })
    const handle = page.getByRole('separator', { name: /resize explorer panel/i })

    const before = await explorer.boundingBox()
    if (!before) throw new Error('expected a bounding box')

    await handle.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const afterSteps = await explorer.boundingBox()
    // 3 steps * 16px — generous tolerance for the box-model border pixel, not the step math.
    expect(afterSteps!.width).toBeGreaterThan(before.width + 40)
    expect(afterSteps!.width).toBeLessThan(before.width + 56)

    await handle.dblclick()
    const afterReset = await explorer.boundingBox()
    expect(afterReset!.width).toBeGreaterThan(before.width - 4)
    expect(afterReset!.width).toBeLessThan(before.width + 4)
  })

  test('Home jumps to the minimum width', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)

    const handle = page.getByRole('separator', { name: /resize explorer panel/i })
    await handle.focus()
    await page.keyboard.press('Home')
    await expect(handle).toHaveAttribute('aria-valuenow', '200')
  })
})
