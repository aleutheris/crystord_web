import { useRef, useState } from 'react'
import { useModalFocus } from '../../a11y/use-modal-focus'
import { useWorkspaces } from './use-workspaces'
import { WorkspaceList } from './WorkspaceList'
import { WorkspaceDetail } from './WorkspaceDetail'
import { C_BORDER, C_OVERLAY, C_SURFACE, C_TEXT_MUTED } from '../../styles/tokens'

export interface WorkspacePanelProps {
  onClose: () => void
  /** The signed-in user's username, threaded from the shell's single `me` query (ADR-260066). */
  selfUsername?: string
}

/**
 * Workspace-management modal (ADR-260066 / REQ-FR-260074): list/create workspaces on the left,
 * and for a selected workspace rename/description, members & roles, and dissolve on the right.
 * Management only — schema 9.2.0 has no current-workspace concept, so there is nothing to
 * "switch" to.
 */
export function WorkspacePanel({ onClose, selfUsername }: WorkspacePanelProps) {
  const state = useWorkspaces()
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, onClose)

  const selected = state.workspaces.find((w) => w.uuid === selectedUuid) ?? null

  async function handleDissolve(uuid: string): Promise<boolean> {
    const dissolved = await state.dissolveWorkspace(uuid)
    if (dissolved) setSelectedUuid(null)
    return dissolved
  }

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, background: C_OVERLAY, zIndex: 1000 }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-panel-title"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(46rem, 94vw)',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: C_SURFACE,
          border: `1px solid ${C_BORDER}`,
          borderRadius: '8px',
          padding: '1rem',
          zIndex: 1001,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 id="workspace-panel-title" style={{ margin: 0, fontSize: '1.1rem' }}>Workspaces</h2>
          <button type="button" aria-label="Close workspaces" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>×</button>
        </div>

        {state.loadError && <p role="alert" style={{ fontSize: '0.85rem' }}>{state.loadError}</p>}
        {state.mutationError && <p role="alert" style={{ fontSize: '0.85rem' }}>{state.mutationError}</p>}
        {state.loading && state.workspaces.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: C_TEXT_MUTED }}>Loading workspaces…</p>
        )}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <WorkspaceList
            workspaces={state.workspaces}
            selectedUuid={selectedUuid}
            onSelect={setSelectedUuid}
            onCreate={state.createWorkspace}
          />
          {selected ? (
            <WorkspaceDetail
              key={selected.uuid}
              workspace={selected}
              selfUsername={selfUsername}
              onUpdate={state.updateWorkspace}
              onDissolve={handleDissolve}
              onMembershipChanged={state.refetch}
            />
          ) : (
            <p style={{ flex: 1, margin: 0, fontSize: '0.85rem', color: C_TEXT_MUTED }}>
              Select a workspace to manage its details and members.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
