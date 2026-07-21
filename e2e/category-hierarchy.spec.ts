import { test, expect } from './fixtures'
import { unmockedOperation } from './graphql-mock'

// EPIC-260076 / ADR-260071: hierarchical category dimensions — nest on create, re-parent an
// existing dimension, detach back to a root, and refuse the shapes the server rejects.
//
// The dimension tree is assembled client-side from retrieveCategoryDimensions +
// parentDimensionKeys; retrieveCategoryBrowse returns a dimension's root VALUES, never its child
// dimensions, so these fixtures drive the hierarchy purely through parentDimensionKeys.

interface MockDimension {
  key: string
  displayName: string
  description: string
  parentDimensionKeys: string[]
  accessLevel: string
  ownerUsername: string
}

function dimension(key: string, displayName: string, parents: string[] = []): MockDimension {
  return { key, displayName, description: '', parentDimensionKeys: parents, accessLevel: 'OWNER', ownerUsername: 'demo' }
}

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

const ATOMS = [
  {
    labels: ['Project'],
    bonds: [],
    ownerUuid: 'owner-1',
    accessLevel: 'OWNER',
    categories: [],
    ...evaluationFields('atom-1'),
    properties: {
      shellies: { uuid: 'atom-1' },
      nuclearies: { title: 'Alpha', description: '', content: '', operation: '', constants: {} },
    },
  },
]

interface MockOptions {
  /** Fail the connect half only — models the server refusing the new parent mid-move. */
  failConnectWith?: string
}

function mockGraphQL(
  page: import('@playwright/test').Page,
  initialDimensions: MockDimension[],
  options: MockOptions = {},
) {
  // Mutable so the rail re-reads the new hierarchy after each authoring call, exactly as it would
  // against a real backend.
  let dimensions = initialDimensions.map((d) => ({ ...d, parentDimensionKeys: [...d.parentDimensionKeys] }))

  return page.route('**/{api,graphql}', (route) => {
    const postData = route.request().postData()
    if (!postData) return route.fallback()

    const body = JSON.parse(postData)
    const query: string = body.query ?? ''
    const vars = body.variables ?? {}
    const ok = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })
    const fail = (message: string) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null, errors: [{ message }] }) })

    if (query.includes('signin')) return ok({ signin: 'mock-token' })
    if (query.includes('listLabels')) return ok({ listLabels: ['Project'] })

    if (query.includes('createCategoryDimension')) {
      dimensions = [...dimensions, dimension(vars.key, vars.displayName, vars.parentDimensionKeys ?? [])]
      return ok({ createCategoryDimension: { key: vars.key } })
    }

    // ORDER MATTERS: "disconnectCategoryDimensions" CONTAINS "connectCategoryDimensions", so the
    // disconnect branch must be matched first or every detach would be read as an attach.
    if (query.includes('disconnectCategoryDimensions')) {
      dimensions = dimensions.map((d) =>
        d.key === vars.dimensionKey ? { ...d, parentDimensionKeys: [] } : d,
      )
      return ok({ disconnectCategoryDimensions: { key: vars.dimensionKey } })
    }

    if (query.includes('connectCategoryDimensions')) {
      if (options.failConnectWith) return fail(options.failConnectWith)
      dimensions = dimensions.map((d) =>
        d.key === vars.dimensionKey ? { ...d, parentDimensionKeys: [...(vars.parentDimensionKeys ?? [])] } : d,
      )
      return ok({ connectCategoryDimensions: { key: vars.dimensionKey } })
    }

    // ORDER MATTERS: 'retrieve' is a substring of the taxonomy queries (existing spec's note).
    if (query.includes('retrieveCategoryDimensions')) return ok({ retrieveCategoryDimensions: dimensions })
    if (query.includes('retrieveCategoryBrowse')) return ok({ retrieveCategoryBrowse: { value: null, children: [] } })
    if (query.includes('retrieve')) return ok({ retrieve: ATOMS })

    return unmockedOperation(page, route, query)
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

async function openCategoriesLens(page: import('@playwright/test').Page) {
  const dimensionsResponse = page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieveCategoryDimensions') === true,
  )
  await page.getByRole('tab', { name: 'Categories' }).click()
  await dimensionsResponse
  await expect(page.getByRole('tree', { name: 'Categories' })).toBeVisible()
}

function waitForPost(page: import('@playwright/test').Page, needle: string) {
  return page.waitForRequest(
    (r) => /\/(api|graphql)\b/.test(r.url()) && r.postData()?.includes(needle) === true,
  )
}

/**
 * Waits for the *attach* call specifically. A plain substring match cannot be used here:
 * "disconnectCategoryDimensions" contains "connectCategoryDimensions", so the detach request
 * would satisfy it first.
 */
function waitForConnect(page: import('@playwright/test').Page) {
  return page.waitForRequest((r) => {
    if (!/\/(api|graphql)\b/.test(r.url())) return false
    const body = r.postData() ?? ''
    return body.includes('connectCategoryDimensions') && !body.includes('disconnectCategoryDimensions')
  })
}

test.describe('Category dimension hierarchy', () => {
  test('a child dimension renders nested under its parent, not at the top level', async ({ page }) => {
    await mockGraphQL(page, [dimension('region', 'Region'), dimension('country', 'Country', ['region'])])
    await signIn(page)
    await openCategoriesLens(page)

    const tree = page.getByRole('tree', { name: 'Categories' })
    await expect(tree).toContainText('Region')
    // Region is the only ROOT dimension — Country hangs beneath it rather than beside it.
    await expect(tree.locator('> li')).toHaveCount(1)
    await expect(tree).not.toContainText('Country')

    await tree.getByRole('button', { name: 'Expand Region' }).click()
    await expect(tree).toContainText('Country')
  })

  test('creating a dimension under a parent sends parentDimensionKeys atomically', async ({ page }) => {
    await mockGraphQL(page, [dimension('region', 'Region')])
    await signIn(page)
    await openCategoriesLens(page)

    await page.getByRole('button', { name: '+ Add dimension' }).click()
    await page.getByLabel('New dimension key').fill('country')
    await page.getByLabel('New dimension name').fill('Country')
    await page.getByLabel('Parent dimension').selectOption('region')

    const createRequest = waitForPost(page, 'createCategoryDimension')
    await page.getByRole('button', { name: 'Create dimension' }).click()

    const sent = JSON.parse((await createRequest).postData()!)
    expect(sent.variables.parentDimensionKeys).toEqual(['region'])
    // One call, no follow-up connect — creation wires the parent atomically.
    await expect(page.getByRole('tree', { name: 'Categories' }).getByRole('button', { name: 'Expand Region' })).toBeVisible()
  })

  test('creating a dimension with no parent selected omits parentDimensionKeys', async ({ page }) => {
    await mockGraphQL(page, [dimension('region', 'Region')])
    await signIn(page)
    await openCategoriesLens(page)

    await page.getByRole('button', { name: '+ Add dimension' }).click()
    await page.getByLabel('New dimension key').fill('period')
    await page.getByLabel('New dimension name').fill('Period')

    const createRequest = waitForPost(page, 'createCategoryDimension')
    await page.getByRole('button', { name: 'Create dimension' }).click()

    const sent = JSON.parse((await createRequest).postData()!)
    expect(sent.variables.parentDimensionKeys).toBeUndefined()
  })

  test('moving an already-parented dimension issues disconnect then connect, in that order', async ({ page }) => {
    await mockGraphQL(page, [
      dimension('region', 'Region'),
      dimension('geography', 'Geography'),
      dimension('country', 'Country', ['region']),
    ])
    await signIn(page)
    await openCategoriesLens(page)

    const tree = page.getByRole('tree', { name: 'Categories' })
    await tree.getByRole('button', { name: 'Expand Region' }).click()
    await tree.getByRole('button', { name: 'Edit Country' }).click()

    const editor = page.getByRole('region', { name: 'Edit Country' })
    await editor.getByLabel('Parent dimension').selectOption('geography')

    const calls: string[] = []
    page.on('request', (r) => {
      const body = r.postData()
      if (!body || !/\/(api|graphql)\b/.test(r.url())) return
      // Check disconnect first — its name contains the connect mutation's name.
      if (body.includes('disconnectCategoryDimensions')) calls.push('disconnect')
      else if (body.includes('connectCategoryDimensions')) calls.push('connect')
    })

    // Wait on the attach call itself. Waiting on a rendered expand affordance would prove nothing:
    // every unbrowsed dimension already shows one for its "Loading…" value placeholder.
    const connectRequest = waitForConnect(page)
    await editor.getByRole('button', { name: 'Set parent' }).click()
    await connectRequest

    expect(calls).toEqual(['disconnect', 'connect'])

    const sent = JSON.parse((await connectRequest).postData()!)
    expect(sent.variables.dimensionKey).toBe('country')
    expect(sent.variables.parentDimensionKeys).toEqual(['geography'])
  })

  test('detaching to root issues only a disconnect', async ({ page }) => {
    await mockGraphQL(page, [dimension('region', 'Region'), dimension('country', 'Country', ['region'])])
    await signIn(page)
    await openCategoriesLens(page)

    const tree = page.getByRole('tree', { name: 'Categories' })
    await tree.getByRole('button', { name: 'Expand Region' }).click()
    await tree.getByRole('button', { name: 'Edit Country' }).click()

    const editor = page.getByRole('region', { name: 'Edit Country' })
    await editor.getByLabel('Parent dimension').selectOption('')

    let connects = 0
    page.on('request', (r) => {
      const body = r.postData()
      if (!body || !/\/(api|graphql)\b/.test(r.url())) return
      if (!body.includes('disconnectCategoryDimensions') && body.includes('connectCategoryDimensions')) connects += 1
    })

    const disconnectRequest = waitForPost(page, 'disconnectCategoryDimensions')
    await editor.getByRole('button', { name: 'Set parent' }).click()
    await disconnectRequest

    // Country is now a sibling root, asserted structurally on the tree's own shape: root dimensions
    // are the direct <li> children of ul[role=tree], nested ones live in a descendant
    // ul[role=group]. Region alone before the detach, Region + Country after.
    // (Asserting on the expand affordance would prove nothing — every unbrowsed dimension shows one
    // for its "Loading…" value placeholder, and an expanded node's button reads "Collapse".)
    await expect(tree.locator('> li')).toHaveCount(2)

    expect(connects).toBe(0)
  })

  test('a refused move reports that the dimension was left at the top level', async ({ page }) => {
    // The detach half succeeds and the attach half is refused — the state the two-call move can
    // land in, and the one a plain "failed" message would misrepresent.
    await mockGraphQL(
      page,
      [dimension('region', 'Region'), dimension('geography', 'Geography'), dimension('country', 'Country', ['region'])],
      { failConnectWith: 'CAT-DIMENSION-CYCLE' },
    )
    await signIn(page)
    await openCategoriesLens(page)

    const tree = page.getByRole('tree', { name: 'Categories' })
    await tree.getByRole('button', { name: 'Expand Region' }).click()
    await tree.getByRole('button', { name: 'Edit Country' }).click()

    const editor = page.getByRole('region', { name: 'Edit Country' })
    await editor.getByLabel('Parent dimension').selectOption('geography')
    await editor.getByRole('button', { name: 'Set parent' }).click()

    const alert = page.getByRole('alert')
    // The mapped message for the code, plus the honest statement of where the dimension ended up.
    await expect(alert).toContainText(/dimension inside itself/i)
    await expect(alert).toContainText(/top-level/i)
  })
})
