import { test, expect } from '@playwright/test'

// EPIC-260068 / ADR-260064: Categories navigator — lazy browse tree with count badges, facet
// scoping into the shell (chips + retrieve categories filter), and inline taxonomy authoring.

const DIMENSIONS = [
  { key: 'region', displayName: 'Region', description: '', parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'period', displayName: 'Period', description: '', parentDimensionKeys: [], accessLevel: 'VIEWER', ownerUsername: 'alice' },
]

const REGION_CHILDREN = [
  {
    value: { key: 'europe', displayName: 'Europe', dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER' },
    atomCount: 3,
  },
  {
    value: { key: 'asia', displayName: 'Asia', dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER' },
    atomCount: 1,
  },
]

function mockGraphQL(page: import('@playwright/test').Page) {
  const atoms = [
    {
      labels: ['Project'],
      bonds: [],
      ownerUuid: 'owner-1',
      accessLevel: 'OWNER',
      categories: [{ dimensionKey: 'region', valueKey: 'europe' }],
      properties: {
        shellies: { uuid: 'atom-1' },
        nuclearies: { title: 'Alpha', description: 'First', content: 'Alpha body', operation: '', constants: {} },
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
        body: JSON.stringify({ data: { listLabels: ['Project'] } }),
      })
    }

    if (query.includes('createCategoryValue')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { createCategoryValue: { key: body.variables?.key ?? 'new' } } }),
      })
    }

    // ORDER MATTERS: 'retrieve' is a substring of the taxonomy queries, so they must be
    // matched BEFORE the generic retrieve branch.
    if (query.includes('retrieveCategoryDimensions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieveCategoryDimensions: DIMENSIONS } }),
      })
    }

    if (query.includes('retrieveCategoryBrowse')) {
      const dimensionKey: string | undefined = body.variables?.dimensionKey
      const children = dimensionKey === 'region' ? REGION_CHILDREN : []
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieveCategoryBrowse: { value: null, children } } }),
      })
    }

    if (query.includes('retrieve')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { retrieve: atoms } }),
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

async function openCategoriesLens(page: import('@playwright/test').Page) {
  const dimensionsResponse = page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieveCategoryDimensions') === true,
  )
  await page.getByRole('tab', { name: 'Categories' }).click()
  await dimensionsResponse
  await expect(page.getByRole('tree', { name: 'Categories' })).toBeVisible()
}

async function expandRegion(page: import('@playwright/test').Page) {
  const browseResponse = page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('retrieveCategoryBrowse') === true,
  )
  await page.getByRole('button', { name: 'Expand Region' }).click()
  return browseResponse
}

function waitForRetrieveAtoms(page: import('@playwright/test').Page) {
  return page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('RetrieveAtoms') === true,
  )
}

test.describe('Categories navigator', () => {
  test('expanding a dimension browses it and shows child values with count badges', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await openCategoriesLens(page)

    const browseResponse = await expandRegion(page)
    const sent = JSON.parse(browseResponse.request().postData()!)
    expect(sent.variables.dimensionKey).toBe('region')

    const tree = page.getByRole('tree', { name: 'Categories' })
    await expect(tree).toContainText('Europe')
    await expect(tree).toContainText('3')
    await expect(tree).toContainText('Asia')
    await expect(tree).toContainText('1')
  })

  test('selecting a value pushes a header chip and re-fetches with the categories filter', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await openCategoriesLens(page)
    await expandRegion(page)

    const retrievePromise = waitForRetrieveAtoms(page)
    await page.getByRole('button', { name: /^Europe/ }).click()
    const retrieveResponse = await retrievePromise

    // The retrieve request carries the facet filter (AND across entries, OR within valueKeys).
    const sent = JSON.parse(retrieveResponse.request().postData()!)
    expect(sent.variables.categories).toEqual([
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true },
    ])

    // Chip in the shell header (Dimension ▸ Value grammar) + extended query summary.
    await expect(page.getByRole('button', { name: 'Remove filter region ▸ europe' })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Active query summary' })).toContainText('region ▸ europe')
  })

  test('removing the chip clears the facet and re-fetches without categories', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await openCategoriesLens(page)
    await expandRegion(page)

    const firstRetrieve = waitForRetrieveAtoms(page)
    await page.getByRole('button', { name: /^Europe/ }).click()
    await firstRetrieve

    const secondRetrieve = waitForRetrieveAtoms(page)
    await page.getByRole('button', { name: 'Remove filter region ▸ europe' }).click()
    const retrieveResponse = await secondRetrieve

    const sent = JSON.parse(retrieveResponse.request().postData()!)
    expect(sent.variables?.categories).toBeUndefined()
    await expect(page.getByRole('button', { name: 'Remove filter region ▸ europe' })).toHaveCount(0)
  })

  test('inline authoring: adding a value under an owned dimension fires createCategoryValue', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await openCategoriesLens(page)

    // Q2 gating on the real accessLevel: OWNER dimension is editable, VIEWER is not.
    await expect(page.getByRole('button', { name: 'Edit Region' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit Period' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Edit Region' }).click()
    await page.getByLabel('New value key').fill('africa')
    await page.getByLabel('New value name').fill('Africa')

    const createPromise = page.waitForResponse((r) =>
      /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('createCategoryValue') === true,
    )
    await page.getByRole('button', { name: 'Add value' }).click()
    const createResponse = await createPromise

    const sent = JSON.parse(createResponse.request().postData()!)
    expect(sent.variables).toMatchObject({ key: 'africa', displayName: 'Africa', dimensionKey: 'region' })
    expect(sent.variables.parentValueKeys).toBeUndefined()
  })
})
