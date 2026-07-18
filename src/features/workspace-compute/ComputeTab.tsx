import { useState } from 'react'
import type { Atom } from '../../api-contract'
import { atomPermissions, mapAuthError, parseOperation, serializeOperation } from '../../api-contract'
import { C_ERROR, C_TEXT_MUTED, C_TEXT_SECONDARY } from '../../styles/tokens'
import { formatFormula } from './formula-format'
import { FormulaBuilder } from './FormulaBuilder'
import { ExplainSection } from './ExplainSection'

/**
 * Local slice of the inspector-tab props (ADR-260065): features may not import ui-shell, so
 * the tab declares only what it consumes (the ClassifyTab precedent). `atoms` is the additive
 * working-set prop the Inspector passes so references resolve to titles.
 */
interface ComputeTabProps {
  atom: Atom
  onUpdate: (uuid: string, atom: Atom) => Promise<void>
  atoms?: Atom[]
}

/**
 * Compute inspector tab (ADR-260065 / REQ-FR-260073): formula builder + computation
 * transparency. Manual-vs-computed is a hard fork — a non-empty `operation` means this tab
 * owns the value (Details/Table content is read-only); "Convert to manual" clears it.
 */
export function ComputeTab({ atom, onUpdate, atoms }: ComputeTabProps) {
  const uuid = atom.properties.shellies.uuid
  const nuclearies = atom.properties.nuclearies
  const payload = parseOperation(nuclearies.operation)
  const constants = nuclearies.constants ?? {}
  const canEdit = atomPermissions(atom.accessLevel).canEdit
  const [editing, setEditing] = useState(false)
  const [confirmConvert, setConfirmConvert] = useState(false)
  // Single-save guard (the ClassifyTab rule): onUpdate is a full-document write from the
  // last-fetched atom, so a second edit before the refetch lands would revert the first.
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function persist(operation: string, nextConstants: Record<string, unknown>) {
    setSaving(true)
    try {
      await onUpdate(uuid, {
        ...atom,
        properties: {
          ...atom.properties,
          nuclearies: { ...nuclearies, operation, constants: nextConstants },
        },
      })
      setSaveError(null)
      setEditing(false)
      setConfirmConvert(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const outcome = mapAuthError(msg)
      // Unrecognized codes surface the raw message (the use-category-browse precedent);
      // session expiry stays silent — the error link signs out globally.
      if (outcome.kind !== 'reauth') {
        setSaveError(outcome.code ? outcome.message : msg || 'Could not save the computation.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {!canEdit && (
        <p role="status" style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>
          You have view-only access to this atom.
        </p>
      )}
      {saveError && (
        <div role="alert" style={{ fontSize: '0.8rem', color: C_ERROR }}>{saveError}</div>
      )}

      {/* `editing` is reachable only through canEdit affordances, so it alone gates the builder. */}
      {editing ? (
        <FormulaBuilder
          initial={payload}
          initialConstants={constants}
          atoms={atoms ?? []}
          saving={saving}
          onSave={(next, nextConstants) => void persist(serializeOperation(next), nextConstants)}
          onCancel={() => setEditing(false)}
        />
      ) : payload ? (
        <>
          <section aria-label="Formula">
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.85rem' }}>Formula</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>
              {formatFormula(payload, atoms, constants)}
            </p>
          </section>
          <ExplainSection atom={atom} payload={payload} atoms={atoms} />
          {canEdit && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <button type="button" onClick={() => setEditing(true)} disabled={saving} style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
                Edit formula
              </button>
              {confirmConvert ? (
                // Two-step inline confirm (ADR-260065): converting discards the formula.
                <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.78rem' }}>
                  Remove the formula and enter content by hand?
                  <button type="button" onClick={() => void persist('', {})} disabled={saving} style={{ color: C_ERROR, cursor: 'pointer' }}>
                    Convert
                  </button>
                  <button type="button" onClick={() => setConfirmConvert(false)} style={{ cursor: 'pointer' }}>
                    Keep formula
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmConvert(true)} disabled={saving} style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
                  Convert to manual
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: '0.82rem', color: C_TEXT_SECONDARY }}>
            This atom is manual — its content is entered by hand.
          </p>
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)} style={{ padding: '0.25rem 0.75rem', cursor: 'pointer', alignSelf: 'flex-start' }}>
              Add computation
            </button>
          )}
        </>
      )}
    </div>
  )
}
