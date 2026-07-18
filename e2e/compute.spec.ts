import { test, expect } from '@playwright/test'

// EPIC-260069 / ADR-260065: Compute tab — formula display with resolved titles, JSON-free
// authoring through the builder, "Explain this value", Flow status badges, convert-to-manual.

const OPERATIONS = [
  { name: 'SUM', description: 'Add the inputs together.' },
  { name: 'MINUS', description: 'Subtract the second input from the first.' },
  { name: 'PRODUCT', description: 'Multiply the inputs.' },
  { name: 'DIVIDE', description: 'Divide the first input by the second.' },
  { name: 'COLLECT', description: 'Collect atoms via a registered query.' },
]

interface EvalOverrides {
  evaluationStatus?: string | null
  errorCode?: string | null
  causes?: string[]
}

function atom(
  uuid: string,
  title: string,
  content: string,
  operation: string,
  bonds: { uuid: string; name: string; direction: string }[],
  evalOverrides: EvalOverrides = {},
) {
  return {
    labels: ['Num'],
    bonds,
    ownerUuid: 'owner-1',
    accessLevel: 'OWNER',
    categories: [],
    evaluationStatus: 'success',
    errorCode: null,
    causes: [],
    cycleNodes: [],
    cycleEdges: null,
    originNodeUuid: uuid,
    affectedNodeUuid: uuid,
    ...evalOverrides,
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: '', content, operation, constants: {} },
    },
  }
}

// OP_DEPENDENCY bonds are backend-managed and drive the Flow projection — the computed
// atoms carry them so they (and their inputs) render in the focused Flow view.
const opDep = (target: string) => ({ uuid: target, name: 'OP_DEPENDENCY', direction: 'from' })

function makeAtoms() {
  return [
    atom('atom-1', 'Alpha', '5', '', []),
    atom('atom-2', 'Beta', '7', '', []),
    atom('atom-3', 'Total', '12', '{"name":"SUM","args":["atom-1","atom-2"]}', [opDep('atom-1'), opDep('atom-2')]),
    atom('atom-4', 'Ratio', '', '{"name":"DIVIDE","args":["atom-1","atom-2"]}', [opDep('atom-1'), opDep('atom-2')], {
      evaluationStatus: 'failed-origin',
      errorCode: 'OP-DIVISION-BY-ZERO',
    }),
  ]
}

function mockGraphQL(page: import('@playwright/test').Page) {
  const atoms = makeAtoms()
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
    if (query.includes('listLabels')) return ok({ listLabels: ['Num'] })
    if (query.includes('discoverOperations')) return ok({ discoverOperations: OPERATIONS })
    if (query.includes('retrieve')) return ok({ retrieve: atoms })
    if (query.includes('change')) return ok({ change: [body.variables?.selector?.uuid ?? 'atom-1'] })
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

async function openComputeTab(page: import('@playwright/test').Page, atomTitle: string) {
  await page.getByText(atomTitle, { exact: true }).click()
  await page.getByRole('tab', { name: 'Compute' }).click()
  await expect(page.getByRole('tab', { name: 'Compute' })).toHaveAttribute('aria-selected', 'true')
}

function waitForChange(page: import('@playwright/test').Page) {
  return page.waitForResponse((r) =>
    /\/(api|graphql)\b/.test(r.url()) && r.request().postData()?.includes('change') === true,
  )
}

test.describe('Compute tab', () => {
  test('a computed atom shows its formula with resolved titles and an Up to date explanation', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openComputeTab(page, 'Total')

    // The payload JSON never surfaces — args resolve to atom titles.
    await expect(page.getByText('SUM(Alpha, Beta)')).toBeVisible()
    await expect(page.getByText('Up to date — computed from 2 inputs.')).toBeVisible()
  })

  test('authoring a SUM through the builder sends the canonical payload without JSON typing', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openComputeTab(page, 'Alpha')

    await expect(page.getByText('This atom is manual — its content is entered by hand.')).toBeVisible()
    await page.getByRole('button', { name: 'Add computation' }).click()

    // SUM (1+ args) is the default — add a second slot and fill both via the title picker.
    await expect(page.getByLabel('Operation')).toHaveValue('SUM')
    await page.getByRole('button', { name: 'Add argument' }).click()
    await page.getByLabel('Find atom for argument 1').fill('Bet')
    await page.getByRole('option', { name: 'Beta' }).click()
    await page.getByLabel('Find atom for argument 2').fill('Tot')
    await page.getByRole('option', { name: 'Total' }).click()

    const changePromise = waitForChange(page)
    await page.getByRole('button', { name: 'Save formula' }).click()
    const changeResponse = await changePromise

    const sent = JSON.parse(changeResponse.request().postData()!)
    const nuclearies = sent.variables.inputs[0].properties.nuclearies
    expect(nuclearies.operation).toContain('"name":"SUM"')
    expect(nuclearies.operation).toContain('atom-2')
    expect(nuclearies.operation).toContain('atom-3')
    expect(nuclearies.constants).toEqual({})
  })

  test('a failed atom shows the error badge in Flow and the failure explanation in the tab', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)

    // Flow is the compute-emphasis landing view; badges render on every computed atom
    // (computeBadges default 'always') — glyph + text with the summary as the label.
    await expect(page.getByRole('img', { name: 'Division by zero' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Up to date' })).toBeVisible()

    await openComputeTab(page, 'Ratio')
    await expect(page.getByText('This value could not be computed: a division by zero occurred.')).toBeVisible()
  })

  test('convert to manual clears the operation after the two-step confirm', async ({ page }) => {
    await mockGraphQL(page)
    await signIn(page)
    await submitSearch(page)
    await openComputeTab(page, 'Total')

    await page.getByRole('button', { name: 'Convert to manual' }).click()
    await expect(page.getByText('Remove the formula and enter content by hand?')).toBeVisible()

    const changePromise = waitForChange(page)
    await page.getByRole('button', { name: 'Convert', exact: true }).click()
    const changeResponse = await changePromise

    const sent = JSON.parse(changeResponse.request().postData()!)
    const nuclearies = sent.variables.inputs[0].properties.nuclearies
    expect(nuclearies.operation).toBe('')
    expect(nuclearies.constants).toEqual({})
    // The system-managed OP_DEPENDENCY bonds are never submitted by the client.
    expect(sent.variables.inputs[0].bonds).toEqual([])
  })
})
