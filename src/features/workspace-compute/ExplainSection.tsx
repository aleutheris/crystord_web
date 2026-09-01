import type { Atom, OperationPayload } from '../../api-contract'
import { computeStatusFor } from '../../api-contract'
import { C_SUCCESS, C_ERROR, C_WARNING, C_TEXT_SECONDARY } from '../../styles/tokens'
import { atomTitle, countInputArgs, shortUuid } from './formula-format'

interface ExplainSectionProps {
  atom: Atom
  payload: OperationPayload
  atoms?: Atom[]
}

/** Plain-language cause sentences per documented errorCode (ADR-260065, calm competence). */
const ORIGIN_SENTENCES: Record<string, string> = {
  'OP-DIVISION-BY-ZERO': 'This value could not be computed: a division by zero occurred.',
  'AU-DEPENDENCY-MISSING': 'This value could not be computed: a dependency is missing.',
  'OP-SIG-SHAPE-MISMATCH':
    'This value could not be computed: the inputs do not fit the operation (shape mismatch).',
  // Codes schema 9.3.0 documented. The COLLECT trio is new behaviour (user-guide.md:1305) and
  // QUERY-UNKNOWN is reachable from the UI, which leaves the free-text query name ungated.
  'OP-COLLECT-CONSTANTS-MISSING':
    'This value could not be computed: the collect query is missing a required setting.',
  'OP-COLLECT-CONSTANTS-INVALID':
    'This value could not be computed: a collect query setting is empty or the wrong type.',
  'OP-COLLECT-QUERY-UNKNOWN':
    'This value could not be computed: that collect query name is not registered on the server.',
  // Named by 9.3.0 (user-guide.md:1150) but NOT new: the guide has listed "type mismatch" among
  // the failed-origin causes since before it, and ADR-260065 §50-51 required a sentence for that
  // cause from EPIC-260069 on — this one was simply never written.
  //
  // Two constraints on the copy. The response carries only the code, nothing identifying which
  // reference failed (user-guide.md:1151-1152), so it must not promise to name the input. And
  // the guide documents exactly ONE cause (an unresolvable ref cell expanding to null, :1147-50)
  // while describing failed-origin's "type mismatch" generally (:1499) — so the cause is offered
  // as the documented one, not as a frequency the client has no way to know.
  'OP-OPERAND-TYPE-MISMATCH':
    'This value could not be computed: an input is not the type the operation needs (type mismatch) — one documented cause is a reference to an atom that is unknown, deleted, or not yours.',
}

function resolveName(uuid: string, atoms: Atom[] | undefined): string {
  return atomTitle(uuid, atoms) ?? shortUuid(uuid)
}

/**
 * "Explain this value" (EPIC-260069 T4): the evaluation state in plain language —
 * up-to-date input counts, failure causes by title, cycle members, skipped inputs.
 */
export function ExplainSection({ atom, payload, atoms }: ExplainSectionProps) {
  const status = computeStatusFor(atom)
  if (!status) return null

  const color = status.kind === 'ok' ? C_SUCCESS : status.kind === 'error' ? C_ERROR : C_WARNING

  return (
    <section aria-label="Explain this value">
      <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.85rem' }}>Explain this value</h3>
      <div style={{ fontSize: '0.82rem', color }}>{explainBody(atom, payload, atoms, status.kind)}</div>
    </section>
  )
}

function explainBody(
  atom: Atom,
  payload: OperationPayload,
  atoms: Atom[] | undefined,
  kind: 'ok' | 'error' | 'skipped',
) {
  if (kind === 'ok') {
    const n = countInputArgs(payload, atom.properties.nuclearies.constants)
    return <p style={{ margin: 0 }}>Up to date — computed from {n} {n === 1 ? 'input' : 'inputs'}.</p>
  }

  if (kind === 'skipped') {
    return <p style={{ margin: 0 }}>Skipped — an optional input is absent, so this value was not computed.</p>
  }

  // Cycles are named as such wherever the code appears — the loop matters more than origin vs. propagated.
  if (atom.errorCode === 'AU-CYCLE-DETECTED') {
    const members = atom.cycleNodes ?? []
    return (
      <>
        <p style={{ margin: 0 }}>These atoms form a dependency loop:</p>
        <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
          {members.map((uuid) => (
            <li key={uuid}>{resolveName(uuid, atoms)}</li>
          ))}
        </ul>
      </>
    )
  }

  if (atom.evaluationStatus === 'failed-propagated') {
    const causes = atom.causes ?? []
    return (
      <>
        <p style={{ margin: 0 }}>An input this value depends on failed:</p>
        <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
          {causes.map((uuid) => (
            <li key={uuid}>{resolveName(uuid, atoms)}</li>
          ))}
        </ul>
      </>
    )
  }

  const sentence =
    (atom.errorCode && ORIGIN_SENTENCES[atom.errorCode]) ?? 'This value could not be computed.'
  return (
    <>
      <p style={{ margin: 0 }}>{sentence}</p>
      {atom.errorCode && !ORIGIN_SENTENCES[atom.errorCode] && (
        <p style={{ margin: '0.25rem 0 0', color: C_TEXT_SECONDARY }}>({atom.errorCode})</p>
      )}
    </>
  )
}
