/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTH_ERROR_CODES } from './api-contract'

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = THIS_DIR
const ROOT = path.resolve(SRC, '..')
const FEATURES = path.join(SRC, 'features')

function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      results.push(full)
    }
  }
  return results
}

function extractImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const matches = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)]
  return matches.map(m => m[1]!)
}

const FEATURE_MODULES = ['auth-entry', 'workspace-graph', 'workspace-search', 'workspace-details', 'workspace-table', 'workspace-classify', 'workspace-categories', 'workspace-compute', 'account-settings', 'workspace-admin']

describe('Architecture boundary checks', () => {
  describe('dependency direction — no cross-feature imports', () => {
    for (const mod of FEATURE_MODULES) {
      const modDir = path.join(FEATURES, mod)
      if (!fs.existsSync(modDir)) continue

      const files = collectTsFiles(modDir)
      for (const file of files) {
        const rel = path.relative(SRC, file)
        it(`${rel} does not import from other feature modules`, () => {
          const imports = extractImports(file)
          const otherFeatures = FEATURE_MODULES.filter(f => f !== mod)

          for (const imp of imports) {
            for (const other of otherFeatures) {
              expect(imp).not.toContain(`features/${other}`)
              expect(imp).not.toMatch(new RegExp(`\\.\\./\\.\\./features/${other}`))
              // Relative sibling imports like ../workspace-graph are also cross-feature
              expect(imp).not.toMatch(new RegExp(`\\.\\./${other}`))
            }
          }
        })
      }
    }
  })

  describe('ui-shell does not absorb feature domain logic', () => {
    const shellDir = path.join(SRC, 'ui-shell')
    const shellFiles = collectTsFiles(shellDir)

    for (const file of shellFiles) {
      const rel = path.relative(SRC, file)
      it(`${rel} does not import feature internals directly`, () => {
        const imports = extractImports(file)
        for (const imp of imports) {
          // ui-shell may import from feature barrel (index) but not from internal modules
          if (imp.includes('features/')) {
            const afterFeatures = imp.split('features/')[1]!
            const segments = afterFeatures.split('/')
            // Allowed: ../features/workspace-graph or ../features/workspace-graph/index
            // Forbidden: ../features/workspace-graph/use-graph-data
            if (segments.length > 1) {
              expect(segments[1]).toBe('index')
            }
          }
        }
      })
    }
  })

  describe('api-contract is the only GraphQL boundary', () => {
    it('feature modules only import GraphQL types/operations from api-contract', () => {
      for (const mod of FEATURE_MODULES) {
        const modDir = path.join(FEATURES, mod)
        if (!fs.existsSync(modDir)) continue

        const files = collectTsFiles(modDir)
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8')
          const imports = extractImports(file)

          // No direct graphql or @apollo imports for operations
          for (const imp of imports) {
            if (imp === 'graphql' || imp.startsWith('graphql/')) {
              throw new Error(`${path.relative(SRC, file)} imports graphql directly — use api-contract`)
            }
          }

          // No inline gql`` template literals
          const hasInlineGql = /\bgql\s*`/.test(content) && !file.includes('api-contract')
          expect(hasInlineGql).toBe(false)
        }
      }
    })
  })
})

describe('Auth boundary checks', () => {
  it('App.tsx uses state-based auth rendering — SignInPage shown when unauthenticated', async () => {
    const appPath = path.join(SRC, 'App.tsx')
    const content = fs.readFileSync(appPath, 'utf-8')

    // AppContent reads isAuthenticated and conditionally renders SignInPage or WorkspaceShell
    expect(content).toContain('isAuthenticated')
    expect(content).toContain('SignInPage')
    expect(content).toContain('WorkspaceShell')
    // AuthProvider still wraps all app content
    expect(content).toContain('AuthProvider')
  })
})

describe('Content ownership invariant checks', () => {
  it('Atom type defines primary entity structure with nuclearies and bonds', () => {
    const graphQueries = path.join(SRC, 'api-contract', 'graph-queries.ts')
    const content = fs.readFileSync(graphQueries, 'utf-8')

    // Atoms are primary entities
    expect(content).toMatch(/export interface Atom/)
    // Bonds model relationships between atoms
    expect(content).toMatch(/bonds:\s*AtomBond\[\]/)
    // Nuclearies belong to atoms (nested under properties)
    expect(content).toMatch(/nuclearies:\s*AtomNuclearies/)
    // Labels are referenced metadata (simple string array, not entity)
    expect(content).toMatch(/labels:\s*string\[\]/)
  })

  it('workspace-search does not own graph mutation state', () => {
    const searchDir = path.join(FEATURES, 'workspace-search')
    const files = collectTsFiles(searchDir)

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8')

      // No mutation operations
      expect(content).not.toContain('MUTATION')
      expect(content).not.toContain('useMutation')
      expect(content).not.toContain('createAtom')
      expect(content).not.toContain('deleteAtom')
      expect(content).not.toContain('updateAtom')
    }
  })
})

// --- BI-260015: Frontend architecture baseline (G1-G5) ---

describe('State partition checks (G2)', () => {
  it('server state is accessed through api-contract query adapters only', () => {
    // Features that talk to the server must go through api-contract
    for (const mod of FEATURE_MODULES) {
      const modDir = path.join(FEATURES, mod)
      if (!fs.existsSync(modDir)) continue

      const files = collectTsFiles(modDir)
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8')
        // No raw fetch/XMLHttpRequest for data
        expect(content).not.toMatch(/\bfetch\s*\(/)
        expect(content).not.toContain('XMLHttpRequest')
        // No direct ApolloClient construction inside features
        expect(content).not.toContain('new ApolloClient')
        expect(content).not.toContain('createApolloClient')
      }
    }
  })

  it('workspace shell owns shared workspace state composition', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')

    // Shell composes feature hooks and passes data down
    expect(shell).toContain('useGraphData')
    expect(shell).toContain('useSearch')
    expect(shell).toContain('selectedAtomId')
  })

  it('feature-local state stays inside feature boundaries', () => {
    // useSearch holds its own filter state (labelQuery, selectedLabels)
    const useSearchFile = fs.readFileSync(
      path.join(FEATURES, 'workspace-search', 'use-search.ts'), 'utf-8',
    )
    expect(useSearchFile).toContain('useState')
    expect(useSearchFile).toContain('labelQuery')
    expect(useSearchFile).toContain('selectedLabels')

    // useGraphData holds its own atoms/loading/error state
    const useGraphFile = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-graph-data.ts'), 'utf-8',
    )
    expect(useGraphFile).toContain('useState<Atom[]>')
    expect(useGraphFile).toContain('useState(false)')
    expect(useGraphFile).toContain('useState<string | null>')
  })
})

describe('Contract stability — barrel export checks (G5)', () => {
  const EXPECTED_BARRELS: Record<string, string[]> = {
    'auth-entry': ['AuthProvider', 'useAuth', 'SignInPage', 'GoogleSignInButton'],
    'workspace-graph': ['GraphCanvas', 'useGraphData', 'GraphData'],
    'workspace-search': ['SearchBar', 'QuerySummary', 'SearchResultPanel', 'useSearch', 'SearchState', 'SearchFilters'],
    'workspace-details': ['DetailPanel'],
    'workspace-table': ['TableView'],
    'workspace-classify': ['ClassifyTab'],
    'workspace-categories': ['CategoriesNavigator'],
    'workspace-compute': ['ComputeTab'],
    'account-settings': ['AccountSettingsPanel'],
    'workspace-admin': ['WorkspacePanel'],
  }

  for (const [mod, expectedExports] of Object.entries(EXPECTED_BARRELS)) {
    it(`${mod}/index.ts exports the approved public API`, () => {
      const barrel = fs.readFileSync(path.join(FEATURES, mod, 'index.ts'), 'utf-8')

      for (const name of expectedExports) {
        expect(barrel).toContain(name)
      }
    })
  }

  it('api-contract/index.ts exports the approved public API', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'api-contract', 'index.ts'), 'utf-8')

    const expectedExports = [
      'createApolloClient', 'getAuthToken', 'setAuthToken',
      'SCHEMA_INFO_QUERY', 'SchemaInfo', 'SchemaInfoResponse',
      'SIGN_IN_QUERY', 'SignInResponse',
      'checkSchemaCompatibility', 'CompatibilityResult',
      'LIST_LABELS_QUERY', 'RETRIEVE_QUERY',
      'CREATE_ATOMS_MUTATION', 'UPDATE_ATOM_MUTATION', 'DESTROY_ATOMS_MUTATION',
      'Atom', 'AtomBond', 'AtomNuclearies', 'RetrieveResponse', 'ListLabelsResponse',
    ]

    for (const name of expectedExports) {
      expect(barrel).toContain(name)
    }
  })
})

describe('CSR-first runtime lock (G3)', () => {
  it('no SSR framework dependencies in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as Record<string, Record<string, string>>
    const allDeps = { ...pkg['dependencies'], ...pkg['devDependencies'] }

    const ssrPackages = ['next', 'nuxt', 'remix', '@remix-run/node', 'gatsby', 'astro']
    for (const ssr of ssrPackages) {
      expect(allDeps).not.toHaveProperty(ssr)
    }
  })

  it('no SSR-specific patterns in source code', () => {
    const allFiles = collectTsFiles(SRC)
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toContain('getServerSideProps')
      expect(content).not.toContain('getStaticProps')
      expect(content).not.toContain('renderToString')
      expect(content).not.toContain('renderToPipeableStream')
    }
  })
})

describe('Single-app constraint — no micro-frontend split (G1/CR)', () => {
  it('vite config has no module federation plugin', () => {
    const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf-8')
    expect(viteConfig).not.toContain('federation')
    expect(viteConfig).not.toContain('ModuleFederation')
  })

  it('package.json has no module federation dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as Record<string, Record<string, string>>
    const allDeps = { ...pkg['dependencies'], ...pkg['devDependencies'] }

    const mfPackages = ['@module-federation/vite', '@originjs/vite-plugin-federation', 'webpack']
    for (const mf of mfPackages) {
      expect(allDeps).not.toHaveProperty(mf)
    }
  })

  it('single entry point in main.tsx', () => {
    const main = fs.readFileSync(path.join(SRC, 'main.tsx'), 'utf-8')
    expect(main).toContain('createRoot')
    expect(main).toContain('<App')
  })
})

// --- BI-260016: Stack selection criteria and concrete MVP stack (H1-H9) ---

describe('MVP stack baseline conformance (H9)', () => {
  let deps: Record<string, string>
  let devDeps: Record<string, string>

  beforeAll(() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as Record<string, Record<string, string>>
    deps = pkg['dependencies'] ?? {}
    devDeps = pkg['devDependencies'] ?? {}
  })

  it('includes React + TypeScript runtime', () => {
    expect(deps).toHaveProperty('react')
    expect(deps).toHaveProperty('react-dom')
    expect(devDeps).toHaveProperty('typescript')
  })

  it('includes React Router', () => {
    expect(deps).toHaveProperty('react-router')
  })

  it('includes Apollo Client for GraphQL', () => {
    expect(deps).toHaveProperty('@apollo/client')
    expect(deps).toHaveProperty('graphql')
  })

  it('includes editor-grade graph library (React Flow)', () => {
    expect(deps).toHaveProperty('@xyflow/react')
  })

  it('includes Vitest + Testing Library + Playwright testing stack', () => {
    expect(devDeps).toHaveProperty('vitest')
    expect(devDeps).toHaveProperty('@testing-library/react')
    expect(devDeps).toHaveProperty('@playwright/test')
  })

  it('includes Vite + ESLint build/lint tooling', () => {
    expect(devDeps).toHaveProperty('vite')
    expect(devDeps).toHaveProperty('eslint')
  })
})

describe('CI gate scripts exist (H5)', () => {
  let scripts: Record<string, string>

  beforeAll(() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as Record<string, Record<string, string>>
    scripts = pkg['scripts'] ?? {}
  })

  it('has lint script', () => {
    expect(scripts).toHaveProperty('lint')
  })

  it('has typecheck script', () => {
    expect(scripts).toHaveProperty('typecheck')
  })

  it('has test script', () => {
    expect(scripts).toHaveProperty('test')
  })

  it('has E2E test script', () => {
    expect(scripts).toHaveProperty('test:e2e')
  })

  it('has build script that includes type checking', () => {
    expect(scripts['build']).toContain('tsc')
  })
})

describe('Environment separation (H5/H7)', () => {
  it('config.ts loads runtime config from config.json via fetch', () => {
    const config = fs.readFileSync(path.join(SRC, 'config.ts'), 'utf-8')

    // Uses runtime fetch, not build-time env vars
    expect(config).toContain('fetch')
    expect(config).toContain('config.json')
    expect(config).toContain('graphqlEndpoint')
    expect(config).toContain('backendSchemaRange')

    // No hardcoded endpoints
    expect(config).not.toMatch(/https?:\/\/[a-zA-Z]/)
    expect(config).not.toContain('localhost')
  })

  it('no hardcoded API endpoints in source files', () => {
    const allFiles = collectTsFiles(SRC)
    for (const file of allFiles) {
      // Skip config.ts which is the approved runtime-config gateway
      if (file.endsWith('config.ts')) continue
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toMatch(/https?:\/\/localhost/)
      expect(content).not.toMatch(/https?:\/\/127\.0\.0\.1/)
    }
  })
})

describe('Auth adapter seam preservation (H8)', () => {
  it('auth is context/adapter-based — replaceable without route rewrites', () => {
    const provider = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthProvider.tsx'), 'utf-8',
    )

    // Uses React Context pattern (adapter seam)
    expect(provider).toContain('createContext')
    expect(provider).toContain('useContext')
    // Token sync goes through api-contract adapter
    expect(provider).toContain('setAuthToken')
  })

  it('AuthGuard depends on useAuth interface only — not implementation details', () => {
    const guard = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthGuard.tsx'), 'utf-8',
    )

    // Uses the hook (interface), not direct token checks
    expect(guard).toContain('useAuth')
    expect(guard).toContain('isAuthenticated')
    // Does not directly access token storage
    expect(guard).not.toContain('getAuthToken')
    expect(guard).not.toContain('localStorage')
    expect(guard).not.toContain('sessionStorage')
  })

  it('App.tsx does not embed auth implementation — delegates to useAuth interface', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf-8')

    // AuthProvider wraps app content (can be swapped)
    expect(app).toContain('AuthProvider')
    // No inline auth logic
    expect(app).not.toContain('getAuthToken')
    expect(app).not.toContain('localStorage')
  })
})

describe('Graph-first workflow support (H2)', () => {
  it('workspace-graph uses React Flow for editor-grade interaction', () => {
    const graphCanvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )

    expect(graphCanvas).toContain('@xyflow/react')
    // Core graph interactions
    expect(graphCanvas).toContain('ReactFlow')
  })

  it('workspace shell composes graph/search/detail for integrated workflow', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')

    // Search is composed directly; graph views + the detail/inspector are composed through
    // the slot registries (ADR-260061 / EPIC-260066 T2).
    expect(shell).toContain('SearchBar')
    expect(shell).toContain('ReactFlowProvider')
    expect(shell).toContain("from './slots'")
    const viewReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'view-registry.ts'), 'utf-8')
    const inspectorReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'inspector-registry.ts'), 'utf-8')
    expect(viewReg).toContain('GraphCanvas')
    expect(inspectorReg).toContain('DetailPanel')
  })
})

describe('Application shell slot registries (ADR-260061 / EPIC-260066 T2)', () => {
  const SLOTS = path.join(SRC, 'ui-shell', 'slots')

  it('the three slot registries and their typed contracts exist', () => {
    for (const f of ['slot-types.ts', 'view-registry.ts', 'inspector-registry.ts', 'navigator-registry.ts', 'index.ts']) {
      expect(fs.existsSync(path.join(SLOTS, f))).toBe(true)
    }
  })

  it('slot contracts are typed (View/InspectorTab/Navigator descriptors + props)', () => {
    const types = fs.readFileSync(path.join(SLOTS, 'slot-types.ts'), 'utf-8')
    expect(types).toContain('ViewProps')
    expect(types).toContain('ViewDescriptor')
    expect(types).toContain('InspectorTabDescriptor')
    expect(types).toContain('NavigatorDescriptor')
  })

  it('views and inspector registries compose feature components via barrels', () => {
    const viewReg = fs.readFileSync(path.join(SLOTS, 'view-registry.ts'), 'utf-8')
    const inspectorReg = fs.readFileSync(path.join(SLOTS, 'inspector-registry.ts'), 'utf-8')
    expect(viewReg).toContain('GraphCanvas')
    expect(viewReg).toContain('NetworkCanvas')
    expect(viewReg).toMatch(/from '\.\.\/\.\.\/features\/workspace-graph'/)
    expect(inspectorReg).toContain('DetailPanel')
    expect(inspectorReg).toMatch(/from '\.\.\/\.\.\/features\/workspace-details'/)
  })

  it('WorkspaceShell renders the active view and inspector through the registries', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toMatch(/import \{ enabledViews, initialActiveView \} from '\.\/slots'/)
    expect(shell).toMatch(/<Inspector/)
    expect(shell).not.toMatch(/<GraphCanvas/)
    expect(shell).not.toMatch(/<NetworkCanvas/)
    // The inspector host renders the active tab from the registry.
    const inspector = fs.readFileSync(path.join(SRC, 'ui-shell', 'Inspector.tsx'), 'utf-8')
    expect(inspector).toContain('inspectorTabs')
  })
})

describe('Workspace preferences store (ADR-260061 / EPIC-260066 T4 / Q3)', () => {
  it('preferences store exposes homeEmphasis/computeBadges with compute/always defaults', () => {
    const prefs = fs.readFileSync(path.join(SRC, 'ui-shell', 'use-preferences.ts'), 'utf-8')
    expect(prefs).toContain('homeEmphasis')
    expect(prefs).toContain('computeBadges')
    // Q3 lean (compute-as-differentiator): defaults ship in the foundation, consumed by EPIC-260069.
    expect(prefs).toMatch(/DEFAULT_HOME_EMPHASIS[^\n]*'compute'/)
    expect(prefs).toMatch(/DEFAULT_COMPUTE_BADGES[^\n]*'always'/)
  })

  it('preferences are localStorage-backed (modeled on ThemeProvider)', () => {
    const prefs = fs.readFileSync(path.join(SRC, 'ui-shell', 'use-preferences.ts'), 'utf-8')
    expect(prefs).toContain('localStorage')
  })

  it('preferences are exposed on the WorkspaceContext', () => {
    const ctx = fs.readFileSync(path.join(SRC, 'ui-shell', 'workspace-context.tsx'), 'utf-8')
    expect(ctx).toContain('preferences')
    expect(ctx).toContain('WorkspacePreferences')
  })
})

describe('Left rail and navigator slot (ADR-260061 / EPIC-260066 T5)', () => {
  it('navigator registry includes the Labels navigator', () => {
    const reg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'navigator-registry.ts'), 'utf-8')
    expect(reg).toContain('LabelsNavigator')
    expect(reg).toMatch(/id:\s*'labels'/)
  })

  it('WorkspaceShell renders the collapsible LeftRail and no longer the SearchResultPanel', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toMatch(/<LeftRail/)
    expect(shell).not.toContain('SearchResultPanel')
  })

  it('LeftRail consumes the workspace context, the navigator registry, and the collapse preference', () => {
    const rail = fs.readFileSync(path.join(SRC, 'ui-shell', 'LeftRail.tsx'), 'utf-8')
    expect(rail).toContain('useWorkspace')
    expect(rail).toContain('navigators')
    expect(rail).toContain('leftRailCollapsed')
  })
})

describe('Tabbed inspector (ADR-260061 / EPIC-260066 T6)', () => {
  it('Inspector renders a tab strip from the registry plus a tabpanel', () => {
    const inspector = fs.readFileSync(path.join(SRC, 'ui-shell', 'Inspector.tsx'), 'utf-8')
    expect(inspector).toContain('inspectorTabs')
    expect(inspector).toMatch(/role="tablist"/)
    expect(inspector).toMatch(/role="tab"/)
    expect(inspector).toMatch(/role="tabpanel"/)
  })

  it('Inspector is collapsible via the rightRailCollapsed preference', () => {
    const inspector = fs.readFileSync(path.join(SRC, 'ui-shell', 'Inspector.tsx'), 'utf-8')
    expect(inspector).toContain('rightRailCollapsed')
    expect(inspector).toMatch(/aria-label="Collapse inspector"/)
    expect(inspector).toMatch(/aria-label="Expand inspector"/)
  })

  it('Inspector tablist supports arrow-key navigation (WAI-ARIA tabs, mirrors GraphViewTabs)', () => {
    const inspector = fs.readFileSync(path.join(SRC, 'ui-shell', 'Inspector.tsx'), 'utf-8')
    expect(inspector).toMatch(/onKeyDown/)
    expect(inspector).toMatch(/ArrowRight/)
    expect(inspector).toMatch(/ArrowLeft/)
  })
})

describe('Node-extension seam (ADR-260061 / EPIC-260066 T7)', () => {
  it('AtomNode exposes the stable AtomNodeData contract via the barrel', () => {
    const node = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8')
    expect(node).toMatch(/export interface AtomNodeData/)
    const barrel = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'index.ts'), 'utf-8')
    expect(barrel).toContain('AtomNodeData')
  })

  it('AtomNode is composed of named regions (badges + body) keyed on the extension points', () => {
    const node = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8')
    expect(node).toContain('NodeBadges')
    expect(node).toContain('NodeBody')
    // Badges region is gated on the compute extension point (EPIC-260069); body documents LOD (EPIC-260072).
    expect(node).toContain('computeStatus')
    expect(node).toContain('lod')
    expect(node).toMatch(/data-node-region="badges"/)
  })
})

describe('Shared filtering & taxonomy widgets (ADR-260061 / EPIC-260066 T8)', () => {
  const WIDGETS = path.join(SRC, 'ui-primitives', 'widgets')

  it('the widget kit and its contracts exist in ui-primitives', () => {
    for (const f of ['widgets.types.ts', 'LabelChipEditor.tsx', 'CategoryTree.tsx', 'FilterBuilder.tsx', 'index.ts']) {
      expect(fs.existsSync(path.join(WIDGETS, f))).toBe(true)
    }
  })

  it('defines the shared filter and category-tree contracts', () => {
    const types = fs.readFileSync(path.join(WIDGETS, 'widgets.types.ts'), 'utf-8')
    expect(types).toMatch(/interface WorkspaceFilter/)
    expect(types).toMatch(/interface CategoryFacetFilter/)
    expect(types).toMatch(/interface CategoryTreeNode/)
    // Permission seam (Q2): the tree carries an optional canEditNode predicate.
    expect(types).toMatch(/canEditNode\?/)
  })

  it('widgets are exported from the ui-primitives barrel', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'ui-primitives', 'index.ts'), 'utf-8')
    expect(barrel).toContain('FilterBuilder')
    expect(barrel).toContain('CategoryTree')
    expect(barrel).toContain('LabelChipEditor')
  })

})

describe('ui-primitives boundary — styles-only imports (ADR-260051)', () => {
  const UI_PRIMITIVES = path.join(SRC, 'ui-primitives')
  const STYLES = path.join(SRC, 'styles')
  // Primitives may import only React, the styles tokens, or other primitives — never a feature,
  // api-contract, ui-shell, or any other module. Enforced across the whole directory (not a
  // hardcoded file list), so every future primitive inherits the guard.
  const ALLOWED_BARE = new Set(['react'])

  for (const file of collectTsFiles(UI_PRIMITIVES)) {
    const rel = path.relative(SRC, file)
    it(`${rel} imports only react, styles, or within ui-primitives`, () => {
      for (const imp of extractImports(file)) {
        if (imp.startsWith('.')) {
          const resolved = path.resolve(path.dirname(file), imp)
          expect(
            resolved.startsWith(UI_PRIMITIVES) || resolved.startsWith(STYLES),
            `${rel} imports '${imp}' outside ui-primitives/styles`,
          ).toBe(true)
        } else {
          expect(ALLOWED_BARE.has(imp), `${rel} imports disallowed package '${imp}'`).toBe(true)
        }
      }
    })
  }
})

// --- BI-260017: Delivery and quality baseline (I1-I6) ---

describe('Critical E2E flow coverage (I1 / REQ-FR-260019)', () => {
  const E2E_DIR = path.join(ROOT, 'e2e')

  it('E2E spec files exist for sign-in, graph workspace, and search', () => {
    expect(fs.existsSync(path.join(E2E_DIR, 'sign-in.spec.ts'))).toBe(true)
    expect(fs.existsSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'))).toBe(true)
    expect(fs.existsSync(path.join(E2E_DIR, 'search-workspace.spec.ts'))).toBe(true)
  })

  it('sign-in flow is covered (demo sign-in entry)', () => {
    const spec = fs.readFileSync(path.join(E2E_DIR, 'sign-in.spec.ts'), 'utf-8')
    expect(spec).toContain('signin')
    expect(spec).toContain('sign in')
  })

  it('bootstrap graph load is covered', () => {
    const spec = fs.readFileSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'), 'utf-8')
    expect(spec).toContain('retrieve')
    expect(spec).toContain('listLabels')
  })

  it('atom create/edit persistence is covered', () => {
    const workspaceSpec = fs.readFileSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'), 'utf-8')
    const createSpec = fs.readFileSync(path.join(E2E_DIR, 'create-atom.spec.ts'), 'utf-8')
    // Atom create flow covered in dedicated spec (BI-260046)
    expect(createSpec).toMatch(/creates? atom|atom.*creat/i)
    // Atom edit via detail panel save
    expect(workspaceSpec).toMatch(/edit.*atom.*properties|atom.*save/i)
  })

  it('deletion safety behavior is covered', () => {
    const spec = fs.readFileSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'), 'utf-8')
    expect(spec).toMatch(/delete.*confirm|confirm.*delet/i)
    expect(spec).toContain('destroy')
  })

  it('error-path resilience is covered', () => {
    const spec = fs.readFileSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'), 'utf-8')
    expect(spec).toMatch(/error|resilien/i)
    // Workspace doesn't crash on error
    expect(spec).toMatch(/sign out/i)
  })
})

describe('Accessibility baseline (I2 / REQ-QR-260002)', () => {
  it('dialogs use role="dialog" with aria-label', () => {
    const deleteDialog = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'DeleteConfirmDialog.tsx'), 'utf-8',
    )
    expect(deleteDialog).toContain('role="dialog"')
    expect(deleteDialog).toContain('aria-label')

    const bondDialog = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'BondNameDialog.tsx'), 'utf-8',
    )
    expect(bondDialog).toContain('role="dialog"')
    expect(bondDialog).toContain('aria-label')
  })

  it('forms associate labels with inputs via htmlFor', () => {
    const detailPanel = fs.readFileSync(
      path.join(FEATURES, 'workspace-details', 'DetailPanel.tsx'), 'utf-8',
    )
    expect(detailPanel).toContain('htmlFor=')
    expect(detailPanel).toContain('<label')
    expect(detailPanel).toContain('<form')

    const signIn = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(signIn).toContain('htmlFor=')
    expect(signIn).toContain('<label')
  })

  it('search components use semantic roles and ARIA labels', () => {
    const searchBar = fs.readFileSync(
      path.join(FEATURES, 'workspace-search', 'SearchBar.tsx'), 'utf-8',
    )
    expect(searchBar).toContain('role="search"')
    expect(searchBar).toContain('aria-label')

    const querySummary = fs.readFileSync(
      path.join(FEATURES, 'workspace-search', 'QuerySummary.tsx'), 'utf-8',
    )
    expect(querySummary).toContain('role="status"')

    const resultPanel = fs.readFileSync(
      path.join(FEATURES, 'workspace-search', 'SearchResultPanel.tsx'), 'utf-8',
    )
    expect(resultPanel).toContain('aria-label')
    expect(resultPanel).toContain('<aside')
  })

  it('detail panel uses complementary landmark with aria-label', () => {
    const detailPanel = fs.readFileSync(
      path.join(FEATURES, 'workspace-details', 'DetailPanel.tsx'), 'utf-8',
    )
    expect(detailPanel).toContain('<aside')
    expect(detailPanel).toContain('aria-label')
    expect(detailPanel).toContain('Atom details')
  })

  it('error states use role="alert" for screen-reader announcement', () => {
    const signIn = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(signIn).toContain('role="alert"')

    const schemaError = fs.readFileSync(
      path.join(SRC, 'ui-shell', 'SchemaErrorScreen.tsx'), 'utf-8',
    )
    expect(schemaError).toContain('role="alert"')

    const startupError = fs.readFileSync(
      path.join(SRC, 'ui-shell', 'StartupErrorScreen.tsx'), 'utf-8',
    )
    expect(startupError).toContain('role="alert"')
  })

  it('workspace shell uses semantic header landmark', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toContain('<header')
  })

  it('keyboard interaction is supported on graph canvas', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    const interactions = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-canvas-interactions.ts'), 'utf-8',
    )
    expect(canvas).toContain('onKeyDown')
    expect(interactions).toContain("event.key === 'Delete'")
    expect(interactions).not.toContain("event.key === 'Backspace'")
  })
})

describe('Observability error-handling seams (I3 / REQ-OR-260005)', () => {
  it('mutation operations have try/catch error handling', () => {
    const interactions = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-canvas-interactions.ts'), 'utf-8',
    )
    // Multiple try/catch blocks around mutation calls
    const tryCatchCount = (interactions.match(/try\s*\{/g) ?? []).length
    expect(tryCatchCount).toBeGreaterThanOrEqual(4)

    const signIn = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(signIn).toMatch(/try\s*\{/)
  })

  it('graph data hook surfaces error state to consumers', () => {
    const useGraphData = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-graph-data.ts'), 'utf-8',
    )
    expect(useGraphData).toContain('error: string | null')
    expect(useGraphData).toContain('setError')
    expect(useGraphData).toContain('catch')
  })

  it('startup bootstrap has error handling with dedicated error screens', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf-8')
    expect(app).toMatch(/try\s*\{/)
    expect(app).toMatch(/catch/)

    // Dedicated error screens exist
    expect(fs.existsSync(path.join(SRC, 'ui-shell', 'SchemaErrorScreen.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(SRC, 'ui-shell', 'StartupErrorScreen.tsx'))).toBe(true)
  })

  it('GraphCanvas shows error state instead of crashing', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    // Error display path — shows error text, does not throw
    expect(canvas).toContain('if (error)')
    expect(canvas).toContain('{error}')
  })
})

describe('Reliability blocker policy (I4 / REQ-QR-260002)', () => {
  it('route guard prevents unauthorized workspace access', () => {
    const guard = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthGuard.tsx'), 'utf-8',
    )
    expect(guard).toContain('isAuthenticated')
    expect(guard).toContain('Navigate')
  })

  it('delete operations require explicit user confirmation', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    // Delete goes through confirmation — not direct
    expect(canvas).toContain('setConfirmDelete')
    expect(canvas).toContain('confirmDelete')
    expect(canvas).toContain('DeleteConfirmDialog')
  })

  it('mutations do not silently discard errors', () => {
    const useGraphData = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-graph-data.ts'), 'utf-8',
    )
    // Fetch errors are captured in state, not swallowed
    expect(useGraphData).toContain('setError')
    // Mutations re-throw to callers (no catch in mutation functions)
    expect(useGraphData).toContain('await client.mutate')
    expect(useGraphData).toContain('await fetchAtoms()')
  })

  it('React Flow deleteKeyCode is disabled to prevent accidental deletion', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('deleteKeyCode={null}')
  })
})

describe('Release and rollback operations (I5 / REQ-OR-260005)', () => {
  let pkg: Record<string, unknown>
  let scripts: Record<string, string>

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as Record<string, unknown>
    scripts = (pkg['scripts'] ?? {}) as Record<string, string>
  })

  it('package.json has version field for artifact versioning', () => {
    expect(pkg).toHaveProperty('version')
    expect(typeof pkg['version']).toBe('string')
  })

  it('build script produces distributable artifacts with type checking', () => {
    expect(scripts).toHaveProperty('build')
    expect(scripts['build']).toContain('tsc')
    expect(scripts['build']).toContain('vite build')
  })

  it('preflight quality gates are scriptable (lint + typecheck + test)', () => {
    expect(scripts).toHaveProperty('lint')
    expect(scripts).toHaveProperty('typecheck')
    expect(scripts).toHaveProperty('test')
    expect(scripts).toHaveProperty('test:e2e')
  })
})

describe('Placeholder and fallback trust constraints (I6 / REQ-CR-260009)', () => {
  // The admin placeholder was replaced by the real account-settings feature in BI-260058; the
  // remaining honesty-sensitive surfaces are the startup/schema fallback screens.
  it('fallback error screens provide honest messaging with a real recovery action', () => {
    for (const screen of ['StartupErrorScreen.tsx', 'SchemaErrorScreen.tsx']) {
      const src = fs.readFileSync(path.join(SRC, 'ui-shell', screen), 'utf-8')
      // Surfaces the failure to the user and offers a genuine recovery (Retry), not a fake control.
      expect(src).toMatch(/role="alert"/)
      expect(src).toMatch(/Retry|reload/i)
      expect(src).not.toContain('onSubmit')
      expect(src).not.toContain('useMutation')
    }
  })
})

// --- BI-260018: Evolution and extensibility baseline (J1-J5) ---

describe('Extension seam preservation (J1 / REQ-FR-260020)', () => {
  it('graph visualization is wrapped behind a seam (GraphCanvas + barrel)', () => {
    const barrel = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'index.ts'), 'utf-8')
    expect(barrel).toContain('GraphCanvas')
    expect(barrel).toContain('useGraphData')
    expect(barrel).toContain('GraphData')
  })

  it('search capability exposes a public seam for future saved queries/views', () => {
    const barrel = fs.readFileSync(path.join(FEATURES, 'workspace-search', 'index.ts'), 'utf-8')
    expect(barrel).toContain('useSearch')
    expect(barrel).toContain('SearchState')
    expect(barrel).toContain('SearchFilters')
  })

  it('account-settings is isolated behind its own seam for future expansion', () => {
    const barrel = fs.readFileSync(path.join(FEATURES, 'account-settings', 'index.ts'), 'utf-8')
    expect(barrel).toContain('AccountSettingsPanel')
    // account-settings feature module is self-contained — no cross-feature imports
    const dir = path.join(FEATURES, 'account-settings')
    const files = collectTsFiles(dir)
    for (const file of files) {
      const imports = extractImports(file)
      for (const imp of imports) {
        expect(imp).not.toMatch(/features\/(workspace-graph|workspace-search|workspace-details|auth-entry)/)
      }
    }
  })

  it('auth is context/adapter-based — ready for production auth replacement', () => {
    const barrel = fs.readFileSync(path.join(FEATURES, 'auth-entry', 'index.ts'), 'utf-8')
    expect(barrel).toContain('AuthProvider')
    expect(barrel).toContain('useAuth')

    const provider = fs.readFileSync(path.join(FEATURES, 'auth-entry', 'AuthProvider.tsx'), 'utf-8')
    expect(provider).toContain('createContext')
  })

  it('workspace shell composes features — seam for collaboration overlay', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    // Search composed directly; views + inspector composed via the slot registries (ADR-260061)
    expect(shell).toContain('SearchBar')
    expect(shell).toContain("from './slots'")
    const viewReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'view-registry.ts'), 'utf-8')
    expect(viewReg).toContain('GraphCanvas')
  })
})

describe('Adapter boundary — backend schema isolation (J3 / REQ-FR-260021)', () => {
  it('api-contract defines typed interfaces that mediate backend schema', () => {
    const queries = fs.readFileSync(path.join(SRC, 'api-contract', 'graph-queries.ts'), 'utf-8')
    expect(queries).toContain('export interface Atom')
    expect(queries).toContain('export interface AtomBond')
    expect(queries).toContain('export interface AtomNuclearies')
    expect(queries).toContain('export interface RetrieveResponse')
    expect(queries).toContain('export interface ListLabelsResponse')
  })

  it('graph-types adapter maps backend Atom to React Flow nodes/edges', () => {
    const graphTypes = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    // Adapter maps backend Atom[] to view-model Node[]/Edge[]
    expect(graphTypes).toContain('atomsToNodes')
    expect(graphTypes).toContain('atomsToEdges')
    expect(graphTypes).toContain('Atom')
    expect(graphTypes).toContain('Node')
    expect(graphTypes).toContain('Edge')
  })

  it('schema compatibility adapter isolates version semantics', () => {
    const compat = fs.readFileSync(
      path.join(SRC, 'api-contract', 'schema-compatibility.ts'), 'utf-8',
    )
    expect(compat).toContain('export interface CompatibilityResult')
    expect(compat).toContain('checkSchemaCompatibility')
    expect(compat).toContain('SchemaInfo')
  })

  it('auth token adapter isolates credential storage from features', () => {
    const authToken = fs.readFileSync(
      path.join(SRC, 'api-contract', 'auth-token.ts'), 'utf-8',
    )
    expect(authToken).toContain('getAuthToken')
    expect(authToken).toContain('setAuthToken')

    // Features do not access token storage directly
    for (const mod of FEATURE_MODULES) {
      const modDir = path.join(FEATURES, mod)
      if (!fs.existsSync(modDir)) continue
      const files = collectTsFiles(modDir)
      for (const file of files) {
        // AuthProvider is allowed to use setAuthToken
        if (file.includes('AuthProvider')) continue
        const content = fs.readFileSync(file, 'utf-8')
        expect(content).not.toContain('getAuthToken')
      }
    }
  })

  it('apollo client wrapper isolates GraphQL transport from features', () => {
    const client = fs.readFileSync(
      path.join(SRC, 'api-contract', 'apollo-client.ts'), 'utf-8',
    )
    expect(client).toContain('createApolloClient')
    expect(client).toContain('ApolloClient')
    expect(client).toContain('getAuthToken')
  })
})

describe('MVP growth boundary — excluded capabilities (J2 / REQ-CR-260010)', () => {
  let allDeps: Record<string, string>

  beforeAll(() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as Record<string, Record<string, string>>
    allDeps = { ...pkg['dependencies'], ...pkg['devDependencies'] }
  })

  it('no real-time collaboration engine dependencies', () => {
    const rtcPackages = ['socket.io', 'socket.io-client', 'ws', 'yjs', '@liveblocks/client', 'pusher-js', 'ably']
    for (const pkg of rtcPackages) {
      expect(allDeps).not.toHaveProperty(pkg)
    }
  })

  it('no plugin runtime system dependencies', () => {
    const pluginPackages = ['@module-federation/vite', '@originjs/vite-plugin-federation', 'webpack']
    for (const pkg of pluginPackages) {
      expect(allDeps).not.toHaveProperty(pkg)
    }
  })

  it('no multi-runtime frontend split', () => {
    const multiRuntimePackages = ['next', 'nuxt', 'remix', '@remix-run/node', 'astro', 'qwik']
    for (const pkg of multiRuntimePackages) {
      expect(allDeps).not.toHaveProperty(pkg)
    }
  })

  it('no heavy analytics surface dependencies', () => {
    const analyticsPackages = ['d3', 'chart.js', 'recharts', 'nivo', 'plotly.js', 'victory']
    for (const pkg of analyticsPackages) {
      expect(allDeps).not.toHaveProperty(pkg)
    }
  })

})

describe('Collaboration-readiness architecture (J4 / REQ-FR-260020)', () => {
  it('graph data uses persisted-vs-local state separation', () => {
    const useGraphData = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-graph-data.ts'), 'utf-8',
    )
    // Server state managed via Apollo queries (persisted)
    expect(useGraphData).toContain('client.query')
    expect(useGraphData).toContain('client.mutate')
    // Local UI state via React state (local)
    expect(useGraphData).toContain('useState')
    // Refetch ensures server truth (no stale local-only state)
    expect(useGraphData).toContain('fetchAtoms')
  })

  it('no hard single-editor assumptions in workspace shell', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    // Shell composes hooks — doesn't hardcode single-user assumptions
    expect(shell).not.toContain('currentUser')
    expect(shell).not.toContain('singleUser')
    expect(shell).not.toContain('onlyEditor')
  })
})

describe('Wrapper boundaries and contract coverage (J5 / REQ-CR-260010)', () => {
  it('api-contract barrel re-exports all public interfaces', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'api-contract', 'index.ts'), 'utf-8')
    // Graph data contract
    expect(barrel).toContain('Atom')
    expect(barrel).toContain('AtomBond')
    expect(barrel).toContain('AtomNuclearies')
    // Auth contract
    expect(barrel).toContain('getAuthToken')
    expect(barrel).toContain('setAuthToken')
    // Compatibility contract
    expect(barrel).toContain('checkSchemaCompatibility')
    expect(barrel).toContain('CompatibilityResult')
    // Client wrapper
    expect(barrel).toContain('createApolloClient')
  })

  it('feature modules import graph types from api-contract only', () => {
    for (const mod of FEATURE_MODULES) {
      const modDir = path.join(FEATURES, mod)
      if (!fs.existsSync(modDir)) continue
      const files = collectTsFiles(modDir)
      for (const file of files) {
        const imports = extractImports(file)
        for (const imp of imports) {
          // Must not import directly from @apollo/client for type construction
          if (imp === 'graphql' || imp.startsWith('graphql/')) {
            throw new Error(`${path.relative(SRC, file)} imports graphql directly`)
          }
        }
      }
    }
  })

  it('schema compatibility contract has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(SRC, 'api-contract', 'schema-compatibility.test.ts')),
    ).toBe(true)

    const testContent = fs.readFileSync(
      path.join(SRC, 'api-contract', 'schema-compatibility.test.ts'), 'utf-8',
    )
    expect(testContent).toContain('checkSchemaCompatibility')
  })

  it('graph-types mapping adapter has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'graph-types.test.ts')),
    ).toBe(true)

    const testContent = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.test.ts'), 'utf-8',
    )
    expect(testContent).toContain('atomsToNodes')
    expect(testContent).toContain('atomsToEdges')
  })

  it('all feature modules have barrel exports (public API boundary)', () => {
    for (const mod of FEATURE_MODULES) {
      const barrelPath = path.join(FEATURES, mod, 'index.ts')
      expect(fs.existsSync(barrelPath)).toBe(true)
    }
  })
})

// --- BI-260019: Branding governance operationalization ---

describe('Branding source-of-truth (ADR-260022)', () => {
  it('branding policy file exists at docs/governance/project/branding.md', () => {
    expect(
      fs.existsSync(path.join(ROOT, 'docs', 'governance', 'project', 'branding.md')),
    ).toBe(true)
  })

  it('branding ADR exists at ADR-260022.md', () => {
    expect(
      fs.existsSync(path.join(ROOT, 'docs', 'governance', 'project', 'evolution', 'adr', 'ADR-260022.md')),
    ).toBe(true)
  })

  it('branding requirement exists at REQ-CR-260011.md', () => {
    expect(
      fs.existsSync(path.join(ROOT, 'docs', 'governance', 'project', 'evolution', 'requirements', 'REQ-CR-260011.md')),
    ).toBe(true)
  })
})

describe('Project instructions include branding governance (REQ-CR-260011)', () => {
  let instructions: string

  beforeAll(() => {
    instructions = fs.readFileSync(
      path.join(ROOT, 'docs', 'governance', 'project', 'project-instructions.md'), 'utf-8',
    )
  })

  it('constraints section references branding.md', () => {
    expect(instructions).toContain('branding.md')
    expect(instructions).toMatch(/[Cc]onstraint.*brand|brand.*[Cc]onstraint/s)
  })

  it('verification/quality section includes branding checks', () => {
    expect(instructions).toMatch(/[Bb]randing.*check|[Bb]randing.*accept/i)
    expect(instructions).toContain('brand tokens')
  })

  it('loading matrix includes branding.md as always-on', () => {
    // branding.md should appear in the always-on section
    const alwaysOnMatch = instructions.match(/Always-on[^:]*:[\s\S]*?(?=Usually|$)/i)
    expect(alwaysOnMatch).not.toBeNull()
    expect(alwaysOnMatch![0]).toContain('branding.md')
  })
})

describe('Governance traceability (BI-260019 / ADR-260022 / REQ-CR-260011)', () => {
  it('ADR-260022 references REQ-CR-260011', () => {
    const adr = fs.readFileSync(
      path.join(ROOT, 'docs', 'governance', 'project', 'evolution', 'adr', 'ADR-260022.md'), 'utf-8',
    )
    expect(adr).toContain('REQ-CR-260011')
  })

  it('REQ-CR-260011 references ADR-260022 and BI-260019', () => {
    const req = fs.readFileSync(
      path.join(ROOT, 'docs', 'governance', 'project', 'evolution', 'requirements', 'REQ-CR-260011.md'), 'utf-8',
    )
    expect(req).toContain('ADR-260022')
    expect(req).toContain('BI-260019')
  })

  it('BI-260019 references ADR-260022, REQ-CR-260011, and branding.md', () => {
    const bi = fs.readFileSync(
      path.join(ROOT, 'docs', 'governance', 'project', 'evolution', 'epics', 'BI-260019.md'), 'utf-8',
    )
    expect(bi).toContain('ADR-260022')
    expect(bi).toContain('REQ-CR-260011')
    expect(bi).toContain('branding.md')
  })
})

describe('Non-deceptive status communication (branding design constraint)', () => {
  it('error states pair color with text or role="alert" — not color alone', () => {
    // SignInPage error uses role="alert" with text content
    const signIn = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(signIn).toContain('role="alert"')
    expect(signIn).toMatch(/\{error\}/)

    // GraphCanvas error shows error text, not color alone
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('{error}')

    // Startup/schema error screens show text messages
    const schemaErr = fs.readFileSync(
      path.join(SRC, 'ui-shell', 'SchemaErrorScreen.tsx'), 'utf-8',
    )
    expect(schemaErr).toContain('role="alert"')
  })

  it('delete action uses explicit text labels — not color-only danger indication', () => {
    const dialog = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'DeleteConfirmDialog.tsx'), 'utf-8',
    )
    // Has text content "Delete Atom?" heading and confirmation text
    expect(dialog).toContain('Delete Atom?')
    expect(dialog).toContain('Are you sure')
    // Button has visible text label
    expect(dialog).toMatch(/>[\s]*Delete[\s]*</)
  })

  it('undo notification uses text label alongside visual cues', () => {
    const undo = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'UndoNotification.tsx'), 'utf-8',
    )
    expect(undo).toContain('role="status"')
    expect(undo).toContain('Undo')
  })

  it('search toggle buttons use aria-pressed for state — not color alone', () => {
    const searchBar = fs.readFileSync(
      path.join(FEATURES, 'workspace-search', 'SearchBar.tsx'), 'utf-8',
    )
    expect(searchBar).toContain('aria-pressed')
  })
})

describe('Branding policy content completeness', () => {
  let branding: string

  beforeAll(() => {
    branding = fs.readFileSync(
      path.join(ROOT, 'docs', 'governance', 'project', 'branding.md'), 'utf-8',
    )
  })

  it('defines brand color tokens with hex values', () => {
    expect(branding).toContain('Trust Blue')
    expect(branding).toContain('#0066CC')
    expect(branding).toContain('Control Green')
    expect(branding).toContain('#00A676')
    expect(branding).toContain('Privacy Red')
    expect(branding).toContain('#D64545')
  })

  it('includes design constraints and forbidden patterns', () => {
    expect(branding).toMatch(/[Dd]o not/)
    expect(branding).toMatch(/neon|glow/i)
    expect(branding).toContain('color alone')
  })

  it('includes semantic meaning map', () => {
    expect(branding).toContain('Semantic Meaning Map')
    expect(branding).toContain('Transparency')
    expect(branding).toContain('User Control')
  })

  it('includes token structure for machine readability', () => {
    expect(branding).toContain('Token Structure')
    expect(branding).toContain('trustBlue')
    expect(branding).toContain('controlGreen')
    expect(branding).toContain('error')
  })
})

// --- BI-260033: Dual-view delivery and validation baseline (D1-D3 / ADR-260032) ---

describe('Feature flag rollout control (D3 / REQ-OR-260011)', () => {
  it('feature-flags module exists at src/feature-flags.ts', () => {
    expect(fs.existsSync(path.join(SRC, 'feature-flags.ts'))).toBe(true)
  })

  it('feature-flags module exports networkViewEnabled derived from VITE env var', () => {
    const flags = fs.readFileSync(path.join(SRC, 'feature-flags.ts'), 'utf-8')
    expect(flags).toContain('networkViewEnabled')
    expect(flags).toContain('VITE_NETWORK_VIEW_ENABLED')
    expect(flags).toContain('import.meta.env')
  })

  it('view registry gates the Network view behind networkViewEnabled', () => {
    const viewReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'view-registry.ts'), 'utf-8')
    expect(viewReg).toContain('networkViewEnabled')
    expect(viewReg).toMatch(/from '\.\.\/\.\.\/feature-flags'/)
    // Network is gated by the flag; Flow is unconditionally available (ADR-260061 / EPIC-260066).
    expect(viewReg).toMatch(/enabled:\s*networkViewEnabled/)
  })

  it('WorkspaceShell gates the tab bar on the registry-enabled view set', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    // The tab bar renders only when more than one view is enabled — driven by the registry's
    // enabled set, not a hardcoded flag in the shell (ADR-260061 / EPIC-260066).
    expect(shell).toMatch(/enabledViews[\s\S]{0,40}GraphViewTabs/)
  })

  it('Flow view remains always available as immediate fallback (GraphCanvas in barrel)', () => {
    const barrel = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'index.ts'), 'utf-8')
    expect(barrel).toContain('GraphCanvas')
  })

  it('default view derives from homeEmphasis via initialActiveView (ADR-260065)', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    // The landing view is the emphasis-derived one (compute → Flow, relationship → Network,
    // falling back to the first enabled view) — no longer positional enabledViews[0].
    expect(shell).toMatch(/useState<string>\(initialActiveView\(/)
    expect(shell).toContain('preferences.homeEmphasis')
    const viewReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'view-registry.ts'), 'utf-8')
    expect(viewReg).toContain('export function initialActiveView')
    const slotsIndex = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'index.ts'), 'utf-8')
    expect(slotsIndex).toContain('initialActiveView')
  })
})

describe('Shared-state dual-view architecture (D1 / REQ-FR-260034)', () => {
  it('selection is owned by WorkspaceContext, provided by the shell, shared with views (props) and hosts (context)', () => {
    const ctx = fs.readFileSync(path.join(SRC, 'ui-shell', 'workspace-context.tsx'), 'utf-8')
    expect(ctx).toContain('WorkspaceProvider')
    expect(ctx).toContain('useWorkspace')
    expect(ctx).toMatch(/selectedAtomId/)
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    // Shell owns the single selection state and provides it via the context.
    expect(shell).toContain('WorkspaceProvider')
    // Feature views still receive the shared selection via ViewProps (features cannot import ui-shell).
    expect(shell).toMatch(/selectedAtomId=\{selectedAtomId\}/)
    const slotTypes = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'slot-types.ts'), 'utf-8')
    expect(slotTypes).toMatch(/ViewProps[\s\S]*selectedAtomId/)
    // ui-shell host (Inspector) consumes selection from context, not props.
    const inspector = fs.readFileSync(path.join(SRC, 'ui-shell', 'Inspector.tsx'), 'utf-8')
    expect(inspector).toContain('useWorkspace')
  })

  it('single useGraphData call feeds the registry-rendered view-host', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    const hookCallCount = (shell.match(/useGraphData\(\)/g) ?? []).length
    expect(hookCallCount).toBe(1)
    // One render site passes the single source to whichever view is active — structurally one
    // source, not per-view fetching (the >=2 form was a proxy when both canvases were inlined).
    const dataPropCount = (shell.match(/data=\{graphData\}/g) ?? []).length
    expect(dataPropCount).toBeGreaterThanOrEqual(1)
  })

  it('mutations update shared atoms state so all views reflect changes', () => {
    const useGraphData = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-graph-data.ts'), 'utf-8',
    )
    expect(useGraphData).toContain('fetchAtoms')
    expect(useGraphData).toContain('setAtoms')
    expect(useGraphData).toContain('await fetchAtoms()')
  })

  it('NetworkCanvas uses the shared graph-types edge adapter', () => {
    const networkCanvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(networkCanvas).toContain('atomsToNetworkEdges')
    expect(networkCanvas).toContain('graph-types')
  })
})

describe('Large-graph degrade policy seam (D2 / REQ-QR-260005)', () => {
  it('degrade hook enforces full mode below 150 nodes (REDUCED_THRESHOLD)', () => {
    const degrade = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-graph-degrade.ts'), 'utf-8',
    )
    expect(degrade).toContain('REDUCED_THRESHOLD')
    expect(degrade).toContain('150')
  })

  it('degrade hook enforces blocked mode above 400 nodes (BLOCKED_THRESHOLD)', () => {
    const degrade = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-graph-degrade.ts'), 'utf-8',
    )
    expect(degrade).toContain('BLOCKED_THRESHOLD')
    expect(degrade).toContain('400')
  })

  it('GraphRenderGate blocks render and exposes confirm path when mode is blocked', () => {
    const gate = fs.readFileSync(path.join(SRC, 'ui-shell', 'GraphRenderGate.tsx'), 'utf-8')
    expect(gate).toContain('blocked')
    expect(gate).toContain('onConfirm')
  })

  it('both canvas components accept renderMode prop for reduced rendering', () => {
    const graphCanvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    const networkCanvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(graphCanvas).toContain('renderMode')
    expect(networkCanvas).toContain('renderMode')
  })

  it('reduced mode strips edge labels on both canvases', () => {
    const graphCanvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    const networkCanvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(graphCanvas).toContain('reduced')
    expect(networkCanvas).toContain('reduced')
  })

  it('degrade threshold constants are exported from the workspace-graph barrel', () => {
    const barrel = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'index.ts'), 'utf-8')
    expect(barrel).toContain('REDUCED_THRESHOLD')
    expect(barrel).toContain('BLOCKED_THRESHOLD')
  })
})

describe('Dual-view E2E coverage baseline (D1 / REQ-FR-260034)', () => {
  const E2E_DIR = path.join(ROOT, 'e2e')

  it('E2E spec covers default Network view after login', () => {
    const spec = fs.readFileSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'), 'utf-8')
    expect(spec).toMatch(/network.*view.*default|default.*network.*view/i)
  })

  it('E2E spec covers view switching between Network and Flow tabs', () => {
    const spec = fs.readFileSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'), 'utf-8')
    expect(spec).toMatch(/flow.*tab|switch.*view/i)
  })

  it('E2E spec covers keyboard-driven view switch via ArrowRight on tablist', () => {
    const spec = fs.readFileSync(path.join(E2E_DIR, 'graph-workspace.spec.ts'), 'utf-8')
    expect(spec).toMatch(/ArrowRight|keyboard.*view|view.*keyboard/i)
  })
})

// --- BI-260034: Geometric closest-point bond anchoring baseline (D1-D4 / ADR-260033) ---

describe('FloatingEdge geometry module (D1 / REQ-FR-260035)', () => {
  it('graph-geometry.ts exists with floatingEdgePath helper', () => {
    expect(fs.existsSync(path.join(FEATURES, 'workspace-graph', 'graph-geometry.ts'))).toBe(true)
    const geo = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'graph-geometry.ts'), 'utf-8')
    expect(geo).toContain('floatingEdgePath')
  })

  it('graph-geometry.ts has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'graph-geometry.test.ts')),
    ).toBe(true)
  })

  it('FloatingEdge.tsx exists and uses useInternalNode for geometry-driven anchoring', () => {
    expect(fs.existsSync(path.join(FEATURES, 'workspace-graph', 'FloatingEdge.tsx'))).toBe(true)
    const edge = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'FloatingEdge.tsx'), 'utf-8')
    expect(edge).toContain('useInternalNode')
    expect(edge).toContain('positionAbsolute')
  })

  it('FloatingEdge uses floatingEdgePath from graph-geometry (not hand-rolled inline)', () => {
    const edge = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'FloatingEdge.tsx'), 'utf-8')
    expect(edge).toContain('floatingEdgePath')
    expect(edge).toContain('graph-geometry')
  })

  it('FloatingEdge has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'FloatingEdge.test.tsx')),
    ).toBe(true)
  })
})

describe('Network view anchoring wiring (D1-D2 / REQ-FR-260035)', () => {
  it('NetworkCanvas registers FloatingEdge as a custom edge type', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('FloatingEdge')
    expect(canvas).toContain('edgeTypes')
    expect(canvas).toContain('floating')
  })

  it('NetworkCanvas uses atomsToNetworkEdges (not raw atomsToEdges) for displayed edges', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('atomsToNetworkEdges')
    expect(canvas).not.toContain('atomsToEdges')
  })

  it('atomsToNetworkEdges produces edges typed as floating', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    expect(types).toContain('atomsToNetworkEdges')
    expect(types).toContain("'floating'")
  })
})

describe('Flow view scope boundary preservation (D3 / ADR-260033)', () => {
  it('GraphCanvas.tsx does not reference FloatingEdge or floating edge type', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('FloatingEdge')
    expect(canvas).not.toContain("'floating'")
  })

  it('GraphCanvas.tsx uses atomsToFlowEdges for eligible-bond projection (BI-260044)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('atomsToFlowEdges')
  })
})

describe('Label extensibility seam (D4 / ADR-260033)', () => {
  it('atomsToEdges still sets label from bond name (seam preserved for future rendering)', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    expect(types).toContain('label: bond.name')
  })

  it('atomsToNetworkEdges strips label for default Network view (off-by-default policy)', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    expect(types).toContain('atomsToNetworkEdges')
    expect(types).toContain('label: undefined')
  })
})

// --- BI-260035: Directional arrowheads baseline for Network-view bonds (D1-D4 / ADR-260034) ---

describe('Target-end arrowhead on Network-view bonds (D1 / REQ-FR-260036)', () => {
  it('atomsToNetworkEdges sets markerEnd using MarkerType.ArrowClosed', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    expect(types).toContain('markerEnd')
    expect(types).toContain('MarkerType')
    expect(types).toContain('ArrowClosed')
  })

  it('FloatingEdge passes markerEnd to BaseEdge for rendering', () => {
    const edge = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'FloatingEdge.tsx'), 'utf-8',
    )
    expect(edge).toContain('markerEnd')
    expect(edge).toContain('BaseEdge')
  })

  it('FloatingEdge applies selected-state strokeWidth emphasis without color change (D3)', () => {
    const edge = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'FloatingEdge.tsx'), 'utf-8',
    )
    expect(edge).toContain('selected')
    expect(edge).toContain('strokeWidth')
  })
})

describe('Arrowheads in full and reduced render modes (D2 / REQ-FR-260036)', () => {
  it('markerEnd is set in atomsToNetworkEdges for all edges regardless of render mode', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    // markerEnd is set unconditionally — no renderMode branch in atomsToNetworkEdges
    expect(types).toContain('markerEnd: { type: MarkerType.ArrowClosed }')
  })
})

describe('Flow view unchanged — direction scope boundary (D4 / ADR-260034)', () => {
  it('GraphCanvas.tsx does not set markerEnd or MarkerType on edges', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('MarkerType')
    expect(canvas).not.toContain('ArrowClosed')
  })

  it('label seam still intact in atomsToEdges (bond name preserved for optional future rendering)', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    expect(types).toContain('label: bond.name')
  })
})

// --- BI-260036: Force-directed automatic layout baseline for Network view (D1-D6 / ADR-260035) ---

describe('Force-directed layout engine (D1 / REQ-FR-260037)', () => {
  it('d3-force is a listed dependency in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as Record<string, Record<string, string>>
    expect(pkg['dependencies']).toHaveProperty('d3-force')
  })

  it('use-network-layout.ts exists and exports applyForceLayout', () => {
    expect(fs.existsSync(path.join(FEATURES, 'workspace-graph', 'use-network-layout.ts'))).toBe(true)
    const layout = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'use-network-layout.ts'), 'utf-8')
    expect(layout).toContain('applyForceLayout')
    expect(layout).toContain('d3-force')
  })

  it('synchronous iteration cap FORCE_TICK_COUNT is 300 (D3)', () => {
    const layout = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'use-network-layout.ts'), 'utf-8')
    expect(layout).toContain('FORCE_TICK_COUNT')
    expect(layout).toContain('300')
  })

  it('use-network-layout.ts has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'use-network-layout.test.ts')),
    ).toBe(true)
  })
})

describe('Layout trigger and drag-position preservation (D2 / REQ-FR-260037)', () => {
  it('NetworkCanvas imports and uses applyForceLayout', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('applyForceLayout')
    expect(canvas).toContain('use-network-layout')
  })

  it('NetworkCanvas uses mergeNodePositions to preserve dragged positions', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('mergeNodePositions')
  })

  it('NetworkCanvas exposes a Re-layout action for on-demand recompute', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('Re-layout')
    expect(canvas).toContain('handleRelayout')
  })
})

describe('Grid fallback above blocked threshold (D4 / REQ-FR-260037)', () => {
  it('applyForceLayout returns nodes unchanged above BLOCKED_THRESHOLD', () => {
    const layout = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'use-network-layout.ts'), 'utf-8')
    expect(layout).toContain('BLOCKED_THRESHOLD')
    expect(layout).toContain('return nodes')
  })
})

describe('Self-loop exclusion from simulation (D5 / REQ-FR-260037)', () => {
  it('applyForceLayout filters self-loop edges before forceLink', () => {
    const layout = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'use-network-layout.ts'), 'utf-8')
    expect(layout).toContain('source !== e.target')
  })
})

describe('Flow view layout unchanged — scope boundary (ADR-260035)', () => {
  it('GraphCanvas.tsx does not import applyForceLayout or d3-force', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('applyForceLayout')
    expect(canvas).not.toContain('d3-force')
  })
})

// --- BI-260037: Outer-circumference edge initiation baseline for Network view (D1-D5 / ADR-260036) ---

describe('Ring affordance replaces connector dot (D1 / REQ-FR-260038)', () => {
  it('CircleAtomNode exports RING_THICKNESS constant', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('RING_THICKNESS')
    expect(node).toContain('export')
  })

  it('CircleAtomNode exports CLICK_DRAG_THRESHOLD constant', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('CLICK_DRAG_THRESHOLD')
    expect(node).toContain('export')
  })

  it('CircleAtomNode uses ring-handle as source Handle (no connector dot)', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('ring-handle')
    expect(node).not.toContain('connector-handle')
  })

  it('CircleAtomNode has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.test.tsx')),
    ).toBe(true)
  })
})

describe('Ring visibility and state rules (D2 / REQ-FR-260038)', () => {
  it('CircleAtomNode ring opacity is controlled by hover and selected state', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('ringVisible')
    expect(node).toContain('hovered')
    expect(node).toContain('selected')
    expect(node).toContain('opacity')
  })

  it('CircleAtomNode ring references a color token (not a hardcoded literal)', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('RING_COLOR')
    expect(node).toContain('ring-handle')
  })
})

describe('Self-connection no-op (D4 / REQ-FR-260038)', () => {
  it('useCanvasInteractions onConnect guards against source === target', () => {
    const ix = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-canvas-interactions.ts'), 'utf-8',
    )
    expect(ix).toContain('source !== connection.target')
  })
})

describe('Flow view scope boundary — ring affordance (D5 / ADR-260036)', () => {
  it('GraphCanvas.tsx does not reference ring-handle or RING_THICKNESS', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('ring-handle')
    expect(canvas).not.toContain('RING_THICKNESS')
  })

  it('GraphCanvas.tsx does not import CircleAtomNode', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('CircleAtomNode')
  })
})

// --- BI-260038: Correct Network-view target-circle drop compliance (ADR-260036 D4) ---

describe('Full-circle connection drop zone (D4 / REQ-FR-260038)', () => {
  it('NetworkCanvas sets connectionRadius covering the full node circle', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('connectionRadius')
    expect(canvas).toContain('CIRCLE_DROP_RADIUS')
  })

  it('CIRCLE_DROP_RADIUS is expressed as NODE_SIZE / 2 + RING_THICKNESS (disk-radius + ring formula — D2/D4 / ADR-260040)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    // Formula must encode disk radius (NODE_SIZE / 2) + ring thickness (RING_THICKNESS) — not a magic literal
    expect(canvas).toMatch(/CIRCLE_DROP_RADIUS\s*=\s*NODE_SIZE\s*\/\s*2\s*\+\s*RING_THICKNESS/)
  })

  it('GraphCanvas does not set connectionRadius (Flow view drop behavior unchanged)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('connectionRadius')
    expect(canvas).not.toContain('CIRCLE_DROP_RADIUS')
  })
})

// --- BI-260039: Network-view preview-line and ring-token refinements (ADR-260037 D2-D3) ---

describe('Straight-line connection drag preview (D2 / REQ-FR-260039)', () => {
  it('NetworkCanvas uses a custom connectionLineComponent for drag preview (supersedes connectionLineType.Straight)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    // Custom component replaced connectionLineType — provides straight + nearest-boundary geometry
    expect(canvas).toContain('connectionLineComponent')
    expect(canvas).toContain('NetworkConnectionLine')
  })

  it('GraphCanvas does not set connectionLineType or connectionLineComponent (Flow view preview unchanged)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('connectionLineType')
    expect(canvas).not.toContain('connectionLineComponent')
  })
})

describe('Tokenized ring and selection colors (D3 / REQ-CR-260017)', () => {
  it('network-tokens.ts exists and exports RING_COLOR and SELECTION_BORDER_COLOR', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'network-tokens.ts')),
    ).toBe(true)
    const tokens = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'network-tokens.ts'), 'utf-8',
    )
    expect(tokens).toContain('RING_COLOR')
    expect(tokens).toContain('SELECTION_BORDER_COLOR')
  })

  it('CircleAtomNode imports interaction colors from network-tokens (no local hardcoded ring/selection literals)', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('network-tokens')
    expect(node).toContain('RING_COLOR')
    expect(node).toContain('SELECTION_BORDER_COLOR')
    // Ring and selection colors must not appear as hardcoded literals in the component
    expect(node).not.toMatch(/#0066CC|#00A676|#E8F4FF|#D6DEE5/)
  })

  it('RING_COLOR and SELECTION_BORDER_COLOR are distinct values', () => {
    const tokens = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'network-tokens.ts'), 'utf-8',
    )
    const ringMatch = tokens.match(/RING_COLOR\s*=\s*'(#[0-9A-Fa-f]+)'/)
    const selectionMatch = tokens.match(/SELECTION_BORDER_COLOR\s*=\s*'(#[0-9A-Fa-f]+)'/)
    expect(ringMatch).not.toBeNull()
    expect(selectionMatch).not.toBeNull()
    expect(ringMatch![1]).not.toBe(selectionMatch![1])
  })
})

// --- BI-260040: Correct Network-view attach activation boundary and completion reliability (ADR-260038 D1/D2/D4) ---

describe('Selected-state ring visibility refinement (D1 / ADR-260038)', () => {
  it('CircleAtomNode ringVisible depends on hover only — not on selected state', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    // ringVisible must be derived from hovered alone
    expect(node).toContain('ringVisible = hovered')
    // ringVisible must not include selected
    expect(node).not.toMatch(/ringVisible\s*=\s*hovered\s*\|\|/)
  })
})

describe('Disk+ring acceptance boundary (D2/D4 / REQ-FR-260040)', () => {
  it('CircleAtomNode uses a single centered target handle (circle-body), not four cardinal handles', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('circle-body')
    expect(node).not.toContain('id="top"')
    expect(node).not.toContain('id="right"')
    expect(node).not.toContain('id="bottom"')
    expect(node).not.toContain('id="left"')
  })

  it('CIRCLE_DROP_RADIUS is expressed as node radius + RING_THICKNESS', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('RING_THICKNESS')
    expect(canvas).toContain('NODE_SIZE / 2 + RING_THICKNESS')
  })

  it('NetworkCanvas imports RING_THICKNESS from CircleAtomNode', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('RING_THICKNESS')
    expect(canvas).toContain('CircleAtomNode')
  })

  it('GraphCanvas unchanged — no circle-body handle or CIRCLE_DROP_RADIUS (D5 / ADR-260038)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('circle-body')
    expect(canvas).not.toContain('CIRCLE_DROP_RADIUS')
  })
})

// --- BI-260041: Drag-snap geometry and selected-state ring visibility refinements (ADR-260038 D1/D3) ---

describe('Nearest-boundary drag-time snap geometry (D3 / REQ-FR-260041)', () => {
  it('NetworkConnectionLine.tsx exists and exports NetworkConnectionLine and CONNECTION_LINE_NODE_RADIUS', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'NetworkConnectionLine.tsx')),
    ).toBe(true)
    const src = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkConnectionLine.tsx'), 'utf-8',
    )
    expect(src).toContain('NetworkConnectionLine')
    expect(src).toContain('CONNECTION_LINE_NODE_RADIUS')
  })

  it('NetworkConnectionLine uses toNode null-check — not a fixed-side cardinal position (no cardinal bias)', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkConnectionLine.tsx'), 'utf-8',
    )
    // Must check for toNode to trigger nearest-boundary snap
    expect(src).toContain('toNode')
    // Must NOT bias toward fixed cardinal sides
    expect(src).not.toMatch(/toX\s*[+-]\s*(NODE_SIZE|80)\b/)
    expect(src).not.toMatch(/toY\s*[+-]\s*(NODE_SIZE|80)\b/)
  })

  it('NetworkConnectionLine uses distance-normalized geometry for boundary point', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkConnectionLine.tsx'), 'utf-8',
    )
    // Nearest-boundary snap requires distance normalization (sqrt + division)
    expect(src).toContain('Math.sqrt')
    expect(src).toContain('dist')
    expect(src).toContain('CONNECTION_LINE_NODE_RADIUS')
  })

  it('NetworkCanvas wires connectionLineComponent to NetworkConnectionLine', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('connectionLineComponent={NetworkConnectionLine}')
    expect(canvas).toContain('NetworkConnectionLine')
  })

  it('GraphCanvas does not use NetworkConnectionLine (D5 scope boundary — Flow view unchanged)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('NetworkConnectionLine')
    expect(canvas).not.toContain('connectionLineComponent')
  })
})

describe('Selected-state ring suppression (D1 / REQ-FR-260042)', () => {
  it('CircleAtomNode ring is not forced visible by selected prop — ringVisible = hovered only', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8',
    )
    // Verified by BI-260040, confirmed here for BI-260041 compliance
    expect(src).toContain('ringVisible = hovered')
    expect(src).not.toMatch(/ringVisible\s*=.*selected/)
  })
})

// --- BI-260043: Align graph visual selection with detail-panel selected atom state ---

describe('Canonical selectedAtomId selection sync — Flow view (BI-260043 / REQ-FR-260032)', () => {
  it('GraphCanvas atoms effect derives node selected flag from selectedAtomId', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toMatch(/selected:\s*n\.id\s*===\s*selectedAtomId/)
  })

  it('GraphCanvas atoms effect lists laidNodes and selectedAtomId as dependencies (BI-260044)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    // Since ADR-260065 the selection (+ badge) mapping lives in decorateNodes, whose
    // dependency list carries selectedAtomId; the effect depends on it transitively.
    expect(canvas).toMatch(/\[laidNodes,\s*decorateNodes,\s*setNodes\]/)
    expect(canvas).toMatch(/decorateNodes = useCallback[\s\S]{0,400}\[selectedAtomId/)
  })
})

describe('Canonical selectedAtomId selection sync — Network view (BI-260043 / REQ-FR-260032)', () => {
  it('NetworkCanvas nodes effect derives node selected flag from selectedAtomId', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toMatch(/selected:\s*n\.id\s*===\s*selectedAtomId/)
  })

  it('NetworkCanvas nodes effect lists laidNodes and selectedAtomId as dependencies', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toMatch(/\[laidNodes,\s*selectedAtomId,\s*setNodes\]/)
  })

  it('NetworkCanvas uses useMemo to cache force layout independent of selectedAtomId', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('useMemo')
    expect(canvas).toContain('laidNodes')
    // The useMemo wrapping applyForceLayout must not list selectedAtomId in its dep array
    expect(canvas).not.toMatch(/useMemo\s*\([\s\S]{0,400}applyForceLayout[\s\S]{0,200}\[[\w\s,]*selectedAtomId[\w\s,]*\]/)
  })
})

describe('Detail-panel identity consistency (BI-260043 / REQ-QR-260004)', () => {
  it('WorkspaceShell resolves selectedAtom by looking up selectedAtomId in atoms', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toMatch(/selectedAtom\s*=\s*graphData\.atoms\.find/)
    expect(shell).toMatch(/selectedAtomId/)
  })

  it('Inspector renders a tab only when an atom is selected (guards on context selection)', () => {
    const inspector = fs.readFileSync(path.join(SRC, 'ui-shell', 'Inspector.tsx'), 'utf-8')
    expect(inspector).toContain('useWorkspace')
    expect(inspector).toMatch(/if \(!atom\) return null/)
  })
})

// --- BI-260044: Flow-view directional projection and relayout baseline (D1-D5 / ADR-260039) ---

describe('Eligible-bond allowlist and extension seam (D1 / REQ-FR-260044)', () => {
  it('flow-projection.ts exists and exports FLOW_ELIGIBLE_BONDS', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'flow-projection.ts')),
    ).toBe(true)
    const proj = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'flow-projection.ts'), 'utf-8',
    )
    expect(proj).toContain('FLOW_ELIGIBLE_BONDS')
  })

  it('FLOW_ELIGIBLE_BONDS includes OP_DEPENDENCY as the baseline eligible bond', () => {
    const proj = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'flow-projection.ts'), 'utf-8',
    )
    expect(proj).toContain('OP_DEPENDENCY')
  })

  it('FLOW_ELIGIBLE_BONDS is an exported constant (frontend extension seam)', () => {
    const proj = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'flow-projection.ts'), 'utf-8',
    )
    expect(proj).toMatch(/export\s+const\s+FLOW_ELIGIBLE_BONDS/)
  })

  it('flow-projection.ts exports projectFlowAtoms', () => {
    const proj = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'flow-projection.ts'), 'utf-8',
    )
    expect(proj).toContain('projectFlowAtoms')
  })

  it('flow-projection.ts has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'flow-projection.test.ts')),
    ).toBe(true)
  })
})

describe('atomsToFlowEdges in graph-types (D1/D5 / REQ-FR-260044, REQ-FR-260046)', () => {
  it('graph-types.ts exports atomsToFlowEdges', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    expect(types).toContain('atomsToFlowEdges')
  })

  it('atomsToFlowEdges sets markerEnd for directional arrowheads (REQ-FR-260046)', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    expect(types).toContain('atomsToFlowEdges')
    expect(types).toContain('markerEnd')
    expect(types).toContain('MarkerType.ArrowClosed')
  })

  it('atomsToFlowEdges suppresses labels (label seam retained in atomsToEdges — REQ-FR-260046)', () => {
    const types = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'graph-types.ts'), 'utf-8',
    )
    // atomsToFlowEdges block sets label: undefined
    expect(types).toMatch(/atomsToFlowEdges[\s\S]{0,500}label:\s*undefined/)
  })
})

describe('GraphCanvas uses flow projection and LR layout (D1-D2 / REQ-FR-260044)', () => {
  it('GraphCanvas imports getFlowParticipantIds from flow-projection', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('getFlowParticipantIds')
    expect(canvas).toContain('flow-projection')
  })

  it('GraphCanvas imports applyFlowLayout from use-flow-layout', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('applyFlowLayout')
    expect(canvas).toContain('use-flow-layout')
  })

  it('GraphCanvas imports atomsToFlowEdges from graph-types', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('atomsToFlowEdges')
    expect(canvas).toContain('graph-types')
  })
})

describe('Flow view relayout control (D3 / REQ-FR-260045)', () => {
  it('GraphCanvas exposes a Re-layout button', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('Re-layout')
    expect(canvas).toContain('handleRelayout')
  })

  it('GraphCanvas relayout preserves selectedAtomId (selection continuity — REQ-FR-260045)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    // handleRelayout runs the shared decorateNodes mapping, which carries selectedAtomId
    // (ADR-260065 moved selection + badge stamping into that one helper).
    expect(canvas).toMatch(/handleRelayout[\s\S]{0,200}decorateNodes/)
    expect(canvas).toMatch(/decorateNodes[\s\S]{0,300}selectedAtomId/)
  })

  it('GraphCanvas uses mergeNodePositions for drag-position preservation (REQ-FR-260045)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('mergeNodePositions')
  })
})

describe('Flow node handle grammar — left/right universal handles (D5 / REQ-FR-260046)', () => {
  it('AtomNode uses Position.Left for target handle', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('Position.Left')
    expect(node).not.toContain('Position.Top')
  })

  it('AtomNode uses Position.Right for source handle', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('Position.Right')
    expect(node).not.toContain('Position.Bottom')
  })
})

describe('use-flow-layout module (D1/D2 / ADR-260039)', () => {
  it('use-flow-layout.ts exists and exports applyFlowLayout', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'use-flow-layout.ts')),
    ).toBe(true)
    const layout = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'use-flow-layout.ts'), 'utf-8',
    )
    expect(layout).toContain('applyFlowLayout')
  })

  it('use-flow-layout.ts has dedicated test coverage', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'workspace-graph', 'use-flow-layout.test.ts')),
    ).toBe(true)
  })
})

describe('Network view scope boundary — Flow changes do not affect Network (ADR-260039)', () => {
  it('NetworkCanvas still uses applyForceLayout — not applyFlowLayout', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('applyForceLayout')
    expect(canvas).not.toContain('applyFlowLayout')
  })

  it('NetworkCanvas still uses atomsToNetworkEdges — not atomsToFlowEdges', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('atomsToNetworkEdges')
    expect(canvas).not.toContain('atomsToFlowEdges')
  })

  it('NetworkCanvas does not import projectFlowAtoms or FLOW_ELIGIBLE_BONDS', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('projectFlowAtoms')
    expect(canvas).not.toContain('FLOW_ELIGIBLE_BONDS')
  })
})

// --- BI-260045: Flow-view projection mode toggle and non-flow atom inclusion (D1-D5 / ADR-260040) ---

describe('Projection mode toggle — default and state semantics (D1/D2 / REQ-FR-260047)', () => {
  it('GraphCanvas exports FlowProjectionMode type', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('FlowProjectionMode')
  })

  it('GraphCanvas flowMode state defaults to focused mode (D2 / ADR-260040)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain("useState<FlowProjectionMode>('focused')")
  })

  it('GraphCanvas has toggleFlowMode control that switches between focused and include (D1)', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('toggleFlowMode')
    expect(canvas).toContain("'include'")
    expect(canvas).toContain("'focused'")
  })

  it('GraphCanvas renders toggle button with aria-pressed for accessibility', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('aria-pressed')
    expect(canvas).toMatch(/aria-pressed=\{flowMode\s*===\s*'include'\}/)
  })
})

describe('Include mode — non-flow atom visibility and visual distinction (D4 / REQ-FR-260047)', () => {
  it('GraphCanvas passes isNonFlowAtom flag into node data for include mode', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('isNonFlowAtom')
    expect(canvas).toMatch(/isNonFlowAtom:\s*flowMode\s*===\s*'include'/)
  })

  it('GraphCanvas uses getFlowParticipantIds to identify non-flow atoms', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('getFlowParticipantIds')
    expect(canvas).toContain('participantIds')
  })

  it('flow-projection.ts exports getFlowParticipantIds', () => {
    const proj = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'flow-projection.ts'), 'utf-8',
    )
    expect(proj).toContain('getFlowParticipantIds')
    expect(proj).toMatch(/export\s+function\s+getFlowParticipantIds/)
  })

  it('AtomNode handles isNonFlowAtom flag for visual distinction (D4 / REQ-FR-260047)', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('isNonFlowAtom')
    expect(node).toContain('dashed')
  })

  it('AtomNode uses opacity for non-flow visual distinction — not color alone (branding constraint)', () => {
    const node = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8',
    )
    expect(node).toContain('opacity')
    expect(node).toContain('isNonFlowAtom')
  })
})

describe('Include mode — flow edges remain eligible-bond only (D4 / REQ-FR-260046)', () => {
  it('GraphCanvas flowEdges are derived from atomsToFlowEdges in both modes', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('atomsToFlowEdges')
    // flowEdges is always from eligible bonds — not mode-gated
    expect(canvas).not.toMatch(/flowMode\s*===\s*'include'[\s\S]{0,100}atomsToFlowEdges/)
  })
})

describe('Relayout continuity in both modes (D3 / REQ-FR-260045)', () => {
  it('GraphCanvas handleRelayout uses applyFlowLayout in both modes', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('handleRelayout')
    expect(canvas).toContain('applyFlowLayout')
  })

  it('GraphCanvas re-layout button is rendered regardless of flowMode', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8',
    )
    expect(canvas).toContain('Re-layout')
    // Re-layout button must not be conditional on flowMode
    expect(canvas).not.toMatch(/flowMode[\s\S]{0,50}Re-layout/)
  })
})

describe('Network view scope boundary unchanged (D5 / ADR-260040)', () => {
  it('NetworkCanvas does not import getFlowParticipantIds or FlowProjectionMode', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('getFlowParticipantIds')
    expect(canvas).not.toContain('FlowProjectionMode')
  })

  it('NetworkCanvas does not use isNonFlowAtom in node data', () => {
    const canvas = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8',
    )
    expect(canvas).not.toContain('isNonFlowAtom')
  })
})

// --- BI-260047: New brand identity — CSS token system and dark mode (ADR-260047) ---

describe('Brand token system files exist (BI-260047)', () => {
  it('src/styles/tokens.css exists with brand color variables', () => {
    const cssPath = path.join(SRC, 'styles', 'tokens.css')
    expect(fs.existsSync(cssPath)).toBe(true)
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).toContain('--color-primary')
    expect(css).toContain('--color-control')
    expect(css).toContain('--color-accent')
    expect(css).toContain('data-theme="dark"')
    expect(css).toContain('prefers-color-scheme: dark')
  })

  it('src/styles/tokens.ts exists and exports primary brand token constants', () => {
    const tsPath = path.join(SRC, 'styles', 'tokens.ts')
    expect(fs.existsSync(tsPath)).toBe(true)
    const ts = fs.readFileSync(tsPath, 'utf-8')
    expect(ts).toContain('C_PRIMARY')
    expect(ts).toContain('C_CONTROL')
    expect(ts).toContain('C_ACCENT')
    expect(ts).toContain('var(--color-primary)')
  })

  it('src/styles/ThemeProvider.tsx exists and exports ThemeProvider and useTheme', () => {
    const providerPath = path.join(SRC, 'styles', 'ThemeProvider.tsx')
    expect(fs.existsSync(providerPath)).toBe(true)
    const src = fs.readFileSync(providerPath, 'utf-8')
    expect(src).toContain('ThemeProvider')
    expect(src).toContain('useTheme')
    expect(src).toContain('localStorage')
    expect(src).toContain('data-theme')
  })

  it('src/styles/ThemeToggle.tsx exists and exports ThemeToggle', () => {
    const togglePath = path.join(SRC, 'styles', 'ThemeToggle.tsx')
    expect(fs.existsSync(togglePath)).toBe(true)
    const src = fs.readFileSync(togglePath, 'utf-8')
    expect(src).toContain('ThemeToggle')
    expect(src).toContain('useTheme')
  })
})

describe('Token system integration wiring (BI-260047)', () => {
  it('main.tsx imports tokens.css', () => {
    const main = fs.readFileSync(path.join(SRC, 'main.tsx'), 'utf-8')
    expect(main).toContain('tokens.css')
  })

  it('App.tsx wraps the app with ThemeProvider', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf-8')
    expect(app).toContain('ThemeProvider')
    expect(app).toContain('ThemeProvider')
  })

  it('WorkspaceShell exposes the theme control via the AccountMenu (ADR-260066 rewrote the BI-260047 pin)', () => {
    // The standalone header ThemeToggle was consolidated into the account menu's Theme item
    // (ADR-260066); ThemeToggle.tsx itself is kept and pinned above.
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toContain('AccountMenu')
    const menu = fs.readFileSync(path.join(SRC, 'ui-shell', 'AccountMenu.tsx'), 'utf-8')
    expect(menu).toContain('useTheme')
  })
})

describe('No-hardcoded-hex ESLint rule (BI-260047)', () => {
  it('eslint.config.js contains a no-restricted-syntax rule targeting hex color literals', () => {
    const eslintConfig = fs.readFileSync(path.join(ROOT, 'eslint.config.js'), 'utf-8')
    expect(eslintConfig).toContain('no-restricted-syntax')
    expect(eslintConfig).toMatch(/#\[0-9A-Fa-f\]|hex.*color|color.*hex/i)
  })

  it('network-tokens.ts is excluded from the hex-color ESLint rule', () => {
    const eslintConfig = fs.readFileSync(path.join(ROOT, 'eslint.config.js'), 'utf-8')
    expect(eslintConfig).toContain('network-tokens')
  })
})

describe('Core components use token references not hardcoded hex (BI-260047)', () => {
  const HEX_RE = /#[0-9A-Fa-f]{3,8}(?![0-9A-Fa-f])/

  it('AtomNode.tsx has no hardcoded hex color literals', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8',
    )
    expect(src).not.toMatch(HEX_RE)
  })

  it('UndoNotification.tsx has no hardcoded hex color literals', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'workspace-graph', 'UndoNotification.tsx'), 'utf-8',
    )
    expect(src).not.toMatch(HEX_RE)
  })

  it('DetailPanel.tsx has no hardcoded hex color literals', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'workspace-details', 'DetailPanel.tsx'), 'utf-8',
    )
    expect(src).not.toMatch(HEX_RE)
  })

  it('GraphViewTabs.tsx has no hardcoded hex color literals', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'ui-shell', 'GraphViewTabs.tsx'), 'utf-8',
    )
    expect(src).not.toMatch(HEX_RE)
  })
})

// --- BI-260048: Production-ready token-based authentication ---

describe('Auth contract files exist (BI-260048)', () => {
  it('session-expired.ts exists with onSessionExpired and triggerSessionExpired', () => {
    const p = path.join(SRC, 'api-contract', 'session-expired.ts')
    expect(fs.existsSync(p)).toBe(true)
    const src = fs.readFileSync(p, 'utf-8')
    expect(src).toContain('onSessionExpired')
    expect(src).toContain('triggerSessionExpired')
  })

  it('auth-queries.ts retains SIGN_IN_GOOGLE_QUERY; verify-first sign-up lives in auth-operations.ts', () => {
    const queries = fs.readFileSync(path.join(SRC, 'api-contract', 'auth-queries.ts'), 'utf-8')
    expect(queries).toContain('SIGN_IN_GOOGLE_QUERY')
    // The old single-step signup mutation was removed in 8.1.0 (BI-260055).
    expect(queries).not.toContain('SIGN_UP_QUERY')
    const ops = fs.readFileSync(path.join(SRC, 'api-contract', 'auth-operations.ts'), 'utf-8')
    expect(ops).toContain('BEGIN_SIGNUP_MUTATION')
    expect(ops).toContain('COMPLETE_SIGNUP_MUTATION')
  })

  it('auth-token.ts exports localStorage helpers', () => {
    const src = fs.readFileSync(path.join(SRC, 'api-contract', 'auth-token.ts'), 'utf-8')
    expect(src).toContain('readStoredToken')
    expect(src).toContain('persistToken')
    expect(src).toContain('clearStoredToken')
    expect(src).toContain('localStorage')
  })

  it('apollo-client.ts intercepts 401 via error link', () => {
    const src = fs.readFileSync(path.join(SRC, 'api-contract', 'apollo-client.ts'), 'utf-8')
    expect(src).toMatch(/ErrorLink|onError/)
    expect(src).toContain('triggerSessionExpired')
    expect(src).toContain('401')
    expect(src).toContain('UNAUTHENTICATED')
  })
})

describe('AuthProvider persistence and session-expiry (BI-260048)', () => {
  it('AuthProvider restores token from localStorage on mount', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthProvider.tsx'), 'utf-8',
    )
    expect(src).toContain('readStoredToken')
    expect(src).toContain('persistToken')
    expect(src).toContain('clearStoredToken')
  })

  it('AuthProvider registers onSessionExpired callback for auto sign-out', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthProvider.tsx'), 'utf-8',
    )
    expect(src).toContain('onSessionExpired')
    expect(src).toContain('signOut')
  })
})

describe('Sign-up and Google sign-in wiring (BI-260048)', () => {
  it('SignInPage delegates sign-up to SignUpPanel (verify-first flow)', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain('<SignUpPanel')
    expect(src).toContain('mode')
    expect(src).not.toContain('SIGN_UP_QUERY')
    const hook = fs.readFileSync(path.join(FEATURES, 'auth-entry', 'use-sign-up.ts'), 'utf-8')
    expect(hook).toContain('BEGIN_SIGNUP_MUTATION')
    expect(hook).toContain('COMPLETE_SIGNUP_MUTATION')
  })

  it('GoogleSignInButton.tsx owns the sign-in query and delegates GIS to the shared primitive (BI-260065)', () => {
    expect(
      fs.existsSync(path.join(FEATURES, 'auth-entry', 'GoogleSignInButton.tsx')),
    ).toBe(true)
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'GoogleSignInButton.tsx'), 'utf-8',
    )
    expect(src).toContain('googleClientId')
    expect(src).toContain('SIGN_IN_GOOGLE_QUERY')
    // The GIS script/init plumbing now lives once in the shared ui-primitives button.
    expect(src).toContain('GoogleCredentialButton')
    expect(src).not.toContain('accounts.google.com/gsi/client')
    const primitive = fs.readFileSync(
      path.join(SRC, 'ui-primitives', 'buttons', 'GoogleCredentialButton.tsx'), 'utf-8',
    )
    expect(primitive).toContain('accounts.google.com/gsi/client')
  })

  it('auth-entry barrel exports GoogleSignInButton', () => {
    const barrel = fs.readFileSync(path.join(FEATURES, 'auth-entry', 'index.ts'), 'utf-8')
    expect(barrel).toContain('GoogleSignInButton')
  })

  it('config.ts exposes googleClientId as part of the runtime config loaded from config.json', () => {
    const config = fs.readFileSync(path.join(SRC, 'config.ts'), 'utf-8')
    expect(config).toContain('googleClientId')
  })
})

// --- BI-260049: Username/password authentication (username-or-email sign-in field) ---

describe('Username/password sign-in (BI-260049)', () => {
  it('SignInPage sign-in mode uses "Username or Email" label (not email-only)', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain('Username or Email')
  })

  it('SignInPage identifier field uses type="text" in sign-in mode to allow plain usernames', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain('type="text"')
  })

  it('SignInPage sends identifier as email param — REQ-OR-260013 compatibility shim', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain('email: identifier')
  })

  it('SignUpPanel email step enforces email format (type="email")', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignUpPanel.tsx'), 'utf-8',
    )
    expect(src).toContain('type="email"')
  })
})

describe('api-contract barrel exports BI-260048 symbols', () => {
  it('barrel re-exports new auth token helpers', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'api-contract', 'index.ts'), 'utf-8')
    expect(barrel).toContain('readStoredToken')
    expect(barrel).toContain('persistToken')
    expect(barrel).toContain('clearStoredToken')
  })

  it('barrel re-exports session-expired module', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'api-contract', 'index.ts'), 'utf-8')
    expect(barrel).toContain('onSessionExpired')
    expect(barrel).toContain('triggerSessionExpired')
  })

  it('barrel re-exports auth query + verify-first sign-up operations', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'api-contract', 'index.ts'), 'utf-8')
    expect(barrel).toContain('SIGN_IN_GOOGLE_QUERY')
    expect(barrel).toContain('BEGIN_SIGNUP_MUTATION')
    expect(barrel).toContain('COMPLETE_SIGNUP_MUTATION')
    expect(barrel).not.toContain('SIGN_UP_QUERY')
  })
})

// --- BI-260050: Consolidated authentication experience with demo mode ---

describe('Demo mode — "Try a Demo" one-click entry (BI-260050)', () => {
  it('SignInPage wires signInAsDemoUser and passes it to DemoPanel', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    // "Try a Demo" label lives in DemoPanel (BI-260052 layout split); SignInPage owns the logic
    expect(src).toContain('signInAsDemoUser')
    expect(src).toContain('<DemoPanel')
  })

  it('DemoPanel renders the "Try a Demo" button label', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'DemoPanel.tsx'), 'utf-8',
    )
    expect(src).toContain('Try a Demo')
  })

  it('signInAsDemoUser sends hardcoded demo credentials as email param', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain("email: 'demo@demo.invalid'")
    expect(src).toContain("password: 'crystord-demo'")
  })

  it('signInAsDemoUser calls signIn with demo=true to skip localStorage persistence', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain('handleSuccess(data.signin, true)')
  })
})

describe('AuthProvider demo session state (BI-260050)', () => {
  it('AuthProvider exposes isDemoSession in AuthState interface', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthProvider.tsx'), 'utf-8',
    )
    expect(src).toContain('isDemoSession')
  })

  it('AuthProvider signIn skips persistToken when demo=true', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthProvider.tsx'), 'utf-8',
    )
    expect(src).toContain('if (!demo)')
    expect(src).toContain('persistToken')
  })

  it('AuthProvider signOut resets isDemoSession to false', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'AuthProvider.tsx'), 'utf-8',
    )
    expect(src).toMatch(/signOut[\s\S]{0,100}setIsDemoSession\(false\)/)
  })
})

// --- BI-260052: Two-column auth + demo panel layout (REQ-CR-260022 / ADR-260053) ---

describe('Two-column auth + demo layout (BI-260052)', () => {
  it('SignInPage imports DemoPanel sub-component', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain("from './DemoPanel'")
    expect(src).toContain('<DemoPanel')
  })

  it('SignInPage imports sign-in-page.css', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain("'./sign-in-page.css'")
  })

  it('SignInPage uses the full WAI-ARIA tablist pattern for Sign In / Sign Up tabs (BI-260063)', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain('role="tablist"')
    expect(src).toContain('role="tab"')
    expect(src).toContain('aria-selected=')
    expect(src).toContain('role="tabpanel"')
    // Full pattern (matches the dual-view tabs): tab↔panel wiring, roving tabindex, arrow-key nav.
    expect(src).toContain('aria-controls=')
    expect(src).toContain('aria-labelledby=')
    expect(src).toMatch(/tabIndex=\{[^}]*\? 0 : -1\}/)
    expect(src).toContain('ArrowRight')
    expect(src).toContain('ArrowLeft')
  })

  it('SignInPage renders a divider for alternative sign-in method', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'SignInPage.tsx'), 'utf-8',
    )
    expect(src).toContain('or sign in with')
    expect(src).toContain('or sign up with')
  })

  it('DemoPanel file exists and exports DemoPanel', () => {
    expect(fs.existsSync(path.join(FEATURES, 'auth-entry', 'DemoPanel.tsx'))).toBe(true)
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'DemoPanel.tsx'), 'utf-8',
    )
    expect(src).toContain('export function DemoPanel')
  })

  it('DemoPanel renders "No registration required" note and demo call-to-action', () => {
    const src = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'DemoPanel.tsx'), 'utf-8',
    )
    expect(src).toContain('No registration required')
    expect(src).toContain('Try a Demo')
  })

  it('sign-in-page.css exists with two-column grid and responsive breakpoint', () => {
    expect(fs.existsSync(path.join(FEATURES, 'auth-entry', 'sign-in-page.css'))).toBe(true)
    const css = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'sign-in-page.css'), 'utf-8',
    )
    expect(css).toContain('grid-template-columns: 1fr 1fr')
    expect(css).toContain('max-width: 768px')
    expect(css).toContain('grid-template-columns: 1fr')
  })

  it('sign-in-page.css uses only CSS custom property tokens — no hardcoded hex values', () => {
    const css = fs.readFileSync(
      path.join(FEATURES, 'auth-entry', 'sign-in-page.css'), 'utf-8',
    )
    // Strip comments and #ffffff (pure white is acceptable for button text — matches --color-card-bg)
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const withoutWhite = withoutComments.replace(/#ffffff/gi, '')
    expect(withoutWhite).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})

// --- BI-260054: central error mapping + authenticated-read ordering ---

describe('Central error mapping is the only auth error-code interpreter (BI-260054 / REQ-CR-260025)', () => {
  it('the error-code table lives in api-contract/error-codes.ts', () => {
    const src = fs.readFileSync(path.join(SRC, 'api-contract', 'error-codes.ts'), 'utf-8')
    for (const code of AUTH_ERROR_CODES) {
      expect(src).toContain(code)
    }
  })

  it('no feature module hard-codes an auth error code — features must route through mapAuthError', () => {
    for (const mod of FEATURE_MODULES) {
      const modDir = path.join(FEATURES, mod)
      if (!fs.existsSync(modDir)) continue
      for (const file of collectTsFiles(modDir)) {
        const content = fs.readFileSync(file, 'utf-8')
        for (const code of AUTH_ERROR_CODES) {
          expect(
            content.includes(code),
            `${path.relative(SRC, file)} hard-codes auth code "${code}" — interpret it via api-contract mapAuthError instead of parsing raw messages`,
          ).toBe(false)
        }
      }
    }
  })
})

describe('No gated read is issued before authentication (BI-260054 / REQ-FR-260068)', () => {
  it('the startup compatibility check issues only the public schemaInfo query', () => {
    const src = fs.readFileSync(path.join(SRC, 'bootstrap', 'startup-check.ts'), 'utf-8')
    expect(src).toContain('SCHEMA_INFO_QUERY')
    // Gated reads must NOT run during the pre-auth startup handshake.
    expect(src).not.toContain('RETRIEVE_QUERY')
    expect(src).not.toContain('LIST_LABELS_QUERY')
    expect(src).not.toContain('listLabels')
  })

  it('the pre-auth sign-in screen does not import gated data/taxonomy reads', () => {
    const dir = path.join(FEATURES, 'auth-entry')
    for (const file of collectTsFiles(dir)) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(
        content.includes('RETRIEVE_QUERY') || content.includes('LIST_LABELS_QUERY'),
        `${path.relative(SRC, file)} pulls a gated read into the pre-auth auth-entry surface`,
      ).toBe(false)
    }
  })
})

// --- EPIC-260071: Table view — tri-view registration + inline edit (ADR-260062 / REQ-FR-260070) ---

describe('Table view registration — tri-view center host (ADR-260062 / EPIC-260071 T2)', () => {
  it('view registry registers the Table view from the workspace-table barrel, after the graph views', () => {
    const viewReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'view-registry.ts'), 'utf-8')
    expect(viewReg).toContain('TableView')
    expect(viewReg).toMatch(/id:\s*'table'/)
    expect(viewReg).toMatch(/from '\.\.\/\.\.\/features\/workspace-table'/)
    // Not "home": Table registers after Network/Flow in display order (ADR-260062 D6 / Q1).
    expect(viewReg.indexOf("id: 'table'")).toBeGreaterThan(viewReg.indexOf("id: 'flow'"))
  })

  it('TableView is a DOM table, not a canvas — no @xyflow/react and no workspace-graph import', () => {
    const view = fs.readFileSync(path.join(FEATURES, 'workspace-table', 'TableView.tsx'), 'utf-8')
    expect(view).toContain('<table')
    expect(view).not.toContain('@xyflow/react')
    expect(view).not.toContain('features/workspace-graph')
  })

  it('TableView reflects shared selection and edits through the single mutation source', () => {
    const view = fs.readFileSync(path.join(FEATURES, 'workspace-table', 'TableView.tsx'), 'utf-8')
    // Shared selection parity (ADR-260062 D2): selectedAtomId marks the row via aria-current
    // (valid on a static-table row, unlike aria-selected which needs a grid/tab composite),
    // and edits go through the single updateAtom mutation source (D3).
    expect(view).toContain('selectedAtomId')
    expect(view).toContain('aria-current')
    expect(view).toContain('updateAtom')
  })

  it('the graph legend is canvas chrome — not rendered over non-graph views', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    // The legend describes nodes/edges; it must be gated to the canvas views, not the tabpanel.
    expect(shell).toMatch(/'flow'[\s\S]{0,60}<GraphLegend|<GraphLegend[\s\S]{0,60}'flow'/)
    expect(shell).toMatch(/activeView === 'flow' \|\| activeView === 'network'/)
  })
})

// --- EPIC-260067: Classify inspector — label & category chip editors (ADR-260063 / REQ-FR-260071) ---

describe('Classify inspector registration and contracts (ADR-260063 / EPIC-260067)', () => {
  it('inspector registry registers the Classify tab from the workspace-classify barrel, after Details', () => {
    const inspectorReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'inspector-registry.ts'), 'utf-8')
    expect(inspectorReg).toContain('ClassifyTab')
    expect(inspectorReg).toMatch(/id:\s*'classify'/)
    expect(inspectorReg).toMatch(/from '\.\.\/\.\.\/features\/workspace-classify'/)
    expect(inspectorReg.indexOf("id: 'classify'")).toBeGreaterThan(inspectorReg.indexOf("id: 'details'"))
  })

  it('RETRIEVE_QUERY selects the category assignments (dimensionKey + valueKey)', () => {
    const queries = fs.readFileSync(path.join(SRC, 'api-contract', 'graph-queries.ts'), 'utf-8')
    expect(queries).toContain('categories')
    expect(queries).toContain('valueKey')
    expect(queries).toContain('dimensionKey')
  })

  it('the DetailPanel comma-box is gone (Classify owns labels in edit mode)', () => {
    const detailPanel = fs.readFileSync(path.join(FEATURES, 'workspace-details', 'DetailPanel.tsx'), 'utf-8')
    expect(detailPanel).not.toContain('comma-separated')
    // Creation mode still needs labels (`change` requires them) — via the shared chip editor.
    expect(detailPanel).toContain('LabelChipEditor')
  })

  it('the 8-slot label-chip palette exists in the light root and both dark blocks', () => {
    const tokensCss = fs.readFileSync(path.join(SRC, 'styles', 'tokens.css'), 'utf-8')
    expect(tokensCss).toContain('--label-chip-1')
    expect(tokensCss).toContain('--label-chip-8')
    // Dark-theme coverage: the explicit dark block and the prefers-color-scheme block both
    // define the palette (same structure as every other token).
    const darkBlock = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'))
    expect(darkBlock).toContain('--label-chip-8')
    const mediaDarkBlock = tokensCss.slice(tokensCss.indexOf('prefers-color-scheme: dark'))
    expect(mediaDarkBlock).toContain('--label-chip-8')
  })

  it('the deterministic hash helper lives in src/styles and is exported', () => {
    const labelColors = fs.readFileSync(path.join(SRC, 'styles', 'label-colors.ts'), 'utf-8')
    expect(labelColors).toContain('export function labelColorIndex')
    expect(labelColors).toContain('export function labelColorToken')
    const tokens = fs.readFileSync(path.join(SRC, 'styles', 'tokens.ts'), 'utf-8')
    expect(tokens).toContain('C_LABEL_PALETTE')
  })

  it('ClassifyTab declares a local props slice (no ui-shell import) and aria-labels its sections', () => {
    const tabPath = path.join(FEATURES, 'workspace-classify', 'ClassifyTab.tsx')
    for (const imp of extractImports(tabPath)) {
      expect(imp).not.toContain('ui-shell')
    }
    const tab = fs.readFileSync(tabPath, 'utf-8')
    expect(tab).toMatch(/interface ClassifyTabProps/)
    expect(tab).toMatch(/aria-label="Labels"/)
    const section = fs.readFileSync(path.join(FEATURES, 'workspace-classify', 'CategoriesSection.tsx'), 'utf-8')
    expect(section).toMatch(/aria-label="Categories"/)
  })
})

// --- EPIC-260068: Categories navigator — facet tree, lens switcher, inline authoring (ADR-260064 / REQ-FR-260072) ---

describe('Categories navigator registration and contracts (ADR-260064 / EPIC-260068)', () => {
  it('navigator registry registers CategoriesNavigator from the workspace-categories barrel, after labels', () => {
    const reg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'navigator-registry.ts'), 'utf-8')
    expect(reg).toContain('CategoriesNavigator')
    expect(reg).toMatch(/id:\s*'categories'/)
    expect(reg).toMatch(/from '\.\.\/\.\.\/features\/workspace-categories'/)
    expect(reg.indexOf("id: 'categories'")).toBeGreaterThan(reg.indexOf("id: 'labels'"))
  })

  it('NavigatorProps carries the additive optional filter contract', () => {
    const types = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'slot-types.ts'), 'utf-8')
    expect(types).toContain('filter?')
    expect(types).toContain('onFilterChange?')
  })

  it('RETRIEVE_QUERY accepts the optional category facet filter', () => {
    const queries = fs.readFileSync(path.join(SRC, 'api-contract', 'graph-queries.ts'), 'utf-8')
    expect(queries).toContain('$categories')
    expect(queries).toContain('CategoryFilterInput')
  })

  it('LeftRail hosts the registry-driven lens switcher (ARIA tablist)', () => {
    const rail = fs.readFileSync(path.join(SRC, 'ui-shell', 'LeftRail.tsx'), 'utf-8')
    expect(rail).toMatch(/role="tablist"/)
    expect(rail).toContain('Navigator lens')
    expect(rail).toContain('ArrowRight')
    expect(rail).toContain('ArrowLeft')
  })

  it('WorkspaceShell owns the category facet state', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toContain('categoryFacets')
    expect(shell).toContain('FacetChips')
  })
})

// --- EPIC-260069: Compute — formula builder, transparency & Flow visualization (ADR-260065 / REQ-FR-260073) ---

describe('Compute authoring and transparency (ADR-260065 / EPIC-260069)', () => {
  it('inspector registry registers the Compute tab from the workspace-compute barrel, after Classify', () => {
    const inspectorReg = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'inspector-registry.ts'), 'utf-8')
    expect(inspectorReg).toContain('ComputeTab')
    expect(inspectorReg).toMatch(/id:\s*'compute'/)
    expect(inspectorReg).toMatch(/from '\.\.\/\.\.\/features\/workspace-compute'/)
    expect(inspectorReg.indexOf("id: 'compute'")).toBeGreaterThan(inspectorReg.indexOf("id: 'classify'"))
  })

  it('RETRIEVE_QUERY selects the evaluation-reporting fields (optional on Atom, mock-compat)', () => {
    const queries = fs.readFileSync(path.join(SRC, 'api-contract', 'graph-queries.ts'), 'utf-8')
    expect(queries).toContain('evaluationStatus')
    expect(queries).toContain('cycleNodes')
    expect(queries).toContain('cycleEdges')
    // Optional modelling — existing mocks/older responses stay valid.
    expect(queries).toMatch(/evaluationStatus\?:/)
    expect(queries).toMatch(/causes\?:/)
  })

  it('slot contracts carry the additive ADR-260065 extensions only', () => {
    const types = fs.readFileSync(path.join(SRC, 'ui-shell', 'slots', 'slot-types.ts'), 'utf-8')
    // ViewProps gains the badge preference; InspectorTabProps gains the working set — both optional.
    expect(types).toMatch(/computeBadges\?:\s*'always'\s*\|\s*'onDemand'/)
    expect(types).toMatch(/atoms\?:\s*Atom\[\]/)
  })

  it('api-contract exposes the payload/status/discovery contract through the barrel', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'api-contract', 'index.ts'), 'utf-8')
    for (const name of ['parseOperation', 'serializeOperation', 'computeStatusFor', 'DISCOVER_OPERATIONS_QUERY']) {
      expect(barrel).toContain(name)
    }
  })

  it('AtomNode renders the badge from computeStatus in the reserved region — never color alone', () => {
    const node = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8')
    const badges = node.slice(node.indexOf('function NodeBadges'))
    expect(badges).toContain('aria-label')
    expect(badges).toContain('title')
    // The reserved-seam gate stays: undefined computeStatus renders nothing.
    expect(badges).toMatch(/computeStatus === undefined\) return null/)
  })

  it('the shell wires the emphasis preferences: initial view + badge visibility', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toContain('initialActiveView(')
    expect(shell).toContain('computeBadges={preferences.computeBadges}')
  })

  it('GraphCanvas stamps computeStatus and danger-styles cycle edges (Flow-only seam)', () => {
    const canvas = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'GraphCanvas.tsx'), 'utf-8')
    expect(canvas).toContain('computeStatusFor')
    expect(canvas).toContain('applyCycleStyling')
    expect(canvas).toContain('cycleEdgeKeys')
    // Flow-only: the Network canvas and circle node carry no badge/cycle wiring (ADR-260065).
    const network = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'NetworkCanvas.tsx'), 'utf-8')
    const circle = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8')
    for (const src of [network, circle]) {
      expect(src).not.toContain('computeStatus')
      expect(src).not.toContain('applyCycleStyling')
    }
  })

  it('ComputeTab declares a local props slice and imports neither ui-shell nor other features', () => {
    const tabPath = path.join(FEATURES, 'workspace-compute', 'ComputeTab.tsx')
    for (const imp of extractImports(tabPath)) {
      expect(imp).not.toContain('ui-shell')
    }
    const tab = fs.readFileSync(tabPath, 'utf-8')
    expect(tab).toMatch(/interface ComputeTabProps/)
  })

  it('compute E2E spec exists and covers authoring + status', () => {
    expect(fs.existsSync(path.join(ROOT, 'e2e', 'compute.spec.ts'))).toBe(true)
    const spec = fs.readFileSync(path.join(ROOT, 'e2e', 'compute.spec.ts'), 'utf-8')
    expect(spec).toContain('discoverOperations')
    expect(spec).toMatch(/"name":"SUM"|\\"name\\":\\"SUM\\"/)
  })
})

// --- EPIC-260070: Account & Settings — avatar menu and settings surfaces (ADR-260066 / REQ-FR-260074) ---

describe('Account menu consolidation (ADR-260066 / EPIC-260070)', () => {
  it('WorkspaceShell renders the AccountMenu and no longer the three loose header controls', () => {
    const shell = fs.readFileSync(path.join(SRC, 'ui-shell', 'WorkspaceShell.tsx'), 'utf-8')
    expect(shell).toMatch(/<AccountMenu/)
    expect(shell).not.toMatch(/<ThemeToggle/)
  })

  it('AccountMenu is a WAI-ARIA menu with Sign Out pinned last, after Preferences and a separator', () => {
    const menu = fs.readFileSync(path.join(SRC, 'ui-shell', 'AccountMenu.tsx'), 'utf-8')
    expect(menu).toContain('role="menu"')
    expect(menu).toContain('role="menuitem"')
    expect(menu).toContain('role="separator"')
    // Keyboard pattern: roving arrows + Escape-to-trigger.
    expect(menu).toContain('ArrowDown')
    expect(menu).toContain('ArrowUp')
    expect(menu).toContain('Escape')
    expect(menu.indexOf("'Sign Out'")).toBeGreaterThan(menu.indexOf("'Preferences…'"))
  })

  it('PreferencesPanel is a shell-owned modal writing the EPIC-260066 preferences contract', () => {
    const panel = fs.readFileSync(path.join(SRC, 'ui-shell', 'PreferencesPanel.tsx'), 'utf-8')
    expect(panel).toContain('role="dialog"')
    expect(panel).toContain('homeEmphasis')
    expect(panel).toContain('computeBadges')
  })

  it('api-contract barrel exposes the workspace-operations documents', () => {
    const barrel = fs.readFileSync(path.join(SRC, 'api-contract', 'index.ts'), 'utf-8')
    expect(barrel).toContain('LIST_MY_WORKSPACES_QUERY')
  })

  it('workspace-admin imports no other feature module', () => {
    const dir = path.join(FEATURES, 'workspace-admin')
    for (const file of collectTsFiles(dir)) {
      for (const imp of extractImports(file)) {
        expect(imp).not.toMatch(/features\/(?!workspace-admin)/)
        expect(imp).not.toContain('ui-shell')
      }
    }
  })
})

// --- EPIC-260072: Node visual design — LOD & Blender-style blocks (ADR-260067 / REQ-FR-260075) ---

describe('Node level-of-detail (ADR-260067 / EPIC-260072)', () => {
  it('node-lod pins the LOD threshold literal', () => {
    const lod = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'node-lod.ts'), 'utf-8')
    expect(lod).toMatch(/LOD_THRESHOLD\s*=\s*0\.75/)
  })

  it('AtomNode forks the body on the zoom signal and keeps both region markers', () => {
    const node = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8')
    expect(node).toContain('lodStateForZoom')
    expect(node).toContain('useStore')
    expect(node).toMatch(/data-node-region="body"/)
    // Seam discipline (ADR-260067): the badges region markup composes unchanged over both states.
    expect(node).toMatch(/data-node-region="badges"/)
  })

  it('CircleAtomNode carries no LOD wiring (Flow-only scope)', () => {
    const circle = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'CircleAtomNode.tsx'), 'utf-8')
    expect(circle).not.toContain('lodStateForZoom')
    expect(circle).not.toContain('LOD_THRESHOLD')
  })

  it('classification dots row carries its meaning as text — never color alone', () => {
    const node = fs.readFileSync(path.join(FEATURES, 'workspace-graph', 'AtomNode.tsx'), 'utf-8')
    expect(node).toContain('aria-label="Classification"')
  })
})
