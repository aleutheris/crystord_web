import { useState, useMemo, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { CategoryFacetFilter, WorkspaceFilter } from '../ui-primitives'
import { useLogout, useAuth } from '../features/auth-entry'
import { AccountSettingsPanel } from '../features/account-settings'
import { useGraphData, DeleteConfirmDialog, useGraphDegrade } from '../features/workspace-graph'
import { CreationNotification } from '../features/workspace-details'
import { SearchBar, QuerySummary, useSearch, useRecommendedLabels } from '../features/workspace-search'
import { AtomCreationOverlay } from './AtomCreationOverlay'
import { BetaBanner } from './BetaBanner'
import { GraphViewTabs } from './GraphViewTabs'
import { GraphRenderGate } from './GraphRenderGate'
import { GraphLegend } from './GraphLegend'
import { LeftRail } from './LeftRail'
import { FacetChips } from './FacetChips'
import { enabledViews } from './slots'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'
import { usePreferences } from './use-preferences'
import { Inspector } from './Inspector'
import { ThemeToggle } from '../styles/ThemeToggle'
import { C_BORDER } from '../styles/tokens'

export function WorkspaceShell({ googleClientId }: { googleClientId?: string }) {
  const logout = useLogout()
  const { signOut } = useAuth()
  const graphData = useGraphData()
  const search = useSearch(graphData.atoms, graphData.search)
  const recommendedLabels = useRecommendedLabels()
  const preferences = usePreferences()
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<string>(enabledViews[0]?.id ?? 'flow')
  const { mode: renderMode, confirmRender } = useGraphDegrade(graphData.atoms.length)
  const [isCreatingAtom, setIsCreatingAtom] = useState(false)
  const [creationSuccessMsg, setCreationSuccessMsg] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [categoryFacets, setCategoryFacets] = useState<CategoryFacetFilter[]>([])
  const canvasMode = renderMode === 'full' ? 'full' : 'reduced'

  // Facet scoping (ADR-260064): the shell owns the facet state; every change re-fetches
  // immediately, combining the facets with the last committed labels (undefined → reuse).
  const graphSearch = graphData.search
  const handleFacetsChange = useCallback((facets: CategoryFacetFilter[]) => {
    setCategoryFacets(facets)
    void graphSearch(undefined, facets)
  }, [graphSearch])

  const handleFilterChange = useCallback((filter: WorkspaceFilter) => {
    handleFacetsChange(filter.categories)
  }, [handleFacetsChange])

  const selectedAtom = graphData.atoms.find(
    (a) => a.properties.shellies.uuid === selectedAtomId,
  ) ?? null

  const pendingDeleteAtom = pendingDeleteId
    ? graphData.atoms.find((a) => a.properties.shellies.uuid === pendingDeleteId) ?? null
    : null

  function handleDeleteConfirm() {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    setSelectedAtomId(null)
    void graphData.deleteAtom(id)
  }

  async function handleCreateAtom(title: string, labels: string[], description: string, content: string) {
    await graphData.createAtom(title, labels, { description, content })
    setIsCreatingAtom(false)
    setCreationSuccessMsg(`Atom "${title}" created successfully.`)
  }

  // Center view-host: render the active view from the registry's enabled views (ADR-260061).
  // Invariant: Flow is unconditionally enabled in slots/view-registry.ts, so enabledViews is never
  // empty and activeView is always a valid id — the `?? enabledViews[0]!` fallback (like L30's
  // `?? 'flow'`) is a defensive no-op. If a future epic ever gates Flow, this assertion and the
  // EPIC-260066/T9 coverage exemption must be revisited (the empty state would crash here).
  const ActiveView = (enabledViews.find((v) => v.id === activeView) ?? enabledViews[0]!).Component

  // Shell-owned workspace state (selection + working set), provided via context (ADR-260061 / T3).
  // filter.labels stays [] — the submitted labels are private useSearch state, not cheaply
  // available here; categories are the shell-owned facet slice (ADR-260064).
  const workspace = useMemo<WorkspaceContextValue>(() => ({
    selection: { selectedAtomId, selectedAtom, select: setSelectedAtomId },
    workingSet: {
      atoms: graphData.atoms,
      filter: { labels: [], categories: categoryFacets },
      onFilterChange: handleFilterChange,
    },
    preferences,
  }), [selectedAtomId, selectedAtom, graphData.atoms, categoryFacets, handleFilterChange, preferences])

  // Facet summary joins the label summary in the shared `Dimension ▸ Value` grammar.
  const facetSummary = categoryFacets
    .map((f) => `${f.dimensionKey} ▸ ${f.valueKeys.join('|')}`)
    .join(' · ')
  const querySummary = [search.querySummary, facetSummary].filter(Boolean).join(' · ')

  return (
    <WorkspaceProvider value={workspace}>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <BetaBanner />
      <header style={{ padding: '0.5rem 1rem', borderBottom: `1px solid ${C_BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', flexShrink: 0 }}>Crystord</h1>
        <SearchBar search={search} recommendedLabels={recommendedLabels} />
        <FacetChips facets={categoryFacets} onChange={handleFacetsChange} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <ThemeToggle />
          <button type="button" onClick={() => setIsSettingsOpen(true)} style={{ padding: '0.25rem 0.75rem' }}>
            Account
          </button>
          <button type="button" onClick={logout} style={{ padding: '0.25rem 0.75rem' }}>
            Sign Out
          </button>
        </div>
      </header>
      <QuerySummary summary={querySummary} resultCount={graphData.atoms.length} />
      <ReactFlowProvider>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <LeftRail />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {enabledViews.length > 1 && <GraphViewTabs views={enabledViews} activeView={activeView} onViewChange={setActiveView} />}
            <div
              id="tabpanel-graph"
              role="tabpanel"
              aria-labelledby={`tab-${activeView}`}
              style={{ flex: 1, position: 'relative' }}
            >
              {/* Canvas chrome only — the legend describes nodes/edges, which non-graph
                  views (Table, Board) don't have. */}
              {(activeView === 'flow' || activeView === 'network') && <GraphLegend view={activeView} />}
              <GraphRenderGate
                atomCount={graphData.atoms.length}
                mode={renderMode}
                onConfirm={confirmRender}
              >
                <ActiveView
                  data={graphData}
                  selectedAtomId={selectedAtomId}
                  onSelectAtom={setSelectedAtomId}
                  onCreateAtom={() => setIsCreatingAtom(true)}
                  renderMode={canvasMode}
                />
              </GraphRenderGate>
            </div>

          </div>
          <Inspector
            onUpdate={graphData.updateAtom}
            onDelete={(id) => setPendingDeleteId(id)}
          />
        </div>
      </ReactFlowProvider>
      {pendingDeleteAtom && (
        <DeleteConfirmDialog
          atomTitle={pendingDeleteAtom.properties.nuclearies.title}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
      {isCreatingAtom && (
        <AtomCreationOverlay
          onCreate={handleCreateAtom}
          onClose={() => setIsCreatingAtom(false)}
        />
      )}
      {creationSuccessMsg && (
        <CreationNotification
          message={creationSuccessMsg}
          onExpire={() => setCreationSuccessMsg(null)}
        />
      )}
      {isSettingsOpen && (
        <AccountSettingsPanel
          onClose={() => setIsSettingsOpen(false)}
          onSessionEnded={signOut}
          googleClientId={googleClientId}
        />
      )}
    </div>
    </WorkspaceProvider>
  )
}
