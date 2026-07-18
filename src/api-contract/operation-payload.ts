/**
 * Pure parse/serialize helpers for the canonical `nuclearies.operation` payload
 * (ADR-260065 / EPIC-260069): a JSON STRING of `{"name":"SUM","args":[...]}` where each
 * arg is an atom UUID or a key into the `constants` map. Users never see or type this
 * JSON — the formula builder goes through these helpers exclusively.
 */

export interface OperationPayload {
  name: string
  args: string[]
}

/**
 * Tolerant parse: `null`/`''` (manual atom), malformed JSON, or a payload without a usable
 * `name` all degrade to `null` — never a crash (ADR-260065). Missing `args` defaults to `[]`;
 * non-string args are coerced via `String` so a legacy numeric arg still renders.
 */
export function parseOperation(operation: string | null | undefined): OperationPayload | null {
  if (!operation) return null
  let raw: unknown
  try {
    raw = JSON.parse(operation)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record['name'] !== 'string' || record['name'] === '') return null
  const args = Array.isArray(record['args']) ? record['args'].map((a) => String(a)) : []
  return { name: record['name'], args }
}

/** Canonical JSON serialization (`{"name":...,"args":[...]}` — key order fixed). */
export function serializeOperation(payload: OperationPayload): string {
  return JSON.stringify({ name: payload.name, args: payload.args })
}
