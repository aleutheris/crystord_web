import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Edge, Connection } from '@xyflow/react'
import type { EffectiveAccessLevel } from '../../api-contract/graph-queries'
import { useCanvasInteractions } from './use-canvas-interactions'

function makeAtom(id: string, title = 'Atom', accessLevel: EffectiveAccessLevel = 'OWNER') {
  return {
    labels: ['Node'],
    bonds: [],
    accessLevel,
    properties: {
      shellies: { uuid: id },
      nuclearies: { title, description: '', content: '', operation: null, constants: null },
    },
  }
}

function makeHook(overrides?: Partial<{ selectedAtomId: string | null; atoms: ReturnType<typeof makeAtom>[] }>) {
  const atoms = overrides?.atoms ?? [makeAtom('a1', 'Alpha'), makeAtom('a2', 'Beta'), makeAtom('a3', 'Gamma')]
  const onSelectAtom = vi.fn()
  const { result } = renderHook(() =>
    useCanvasInteractions({
      atoms,
      edges: [],
      selectedAtomId: overrides?.selectedAtomId ?? null,
      onSelectAtom,
      deleteAtom: vi.fn(),
      createAtom: vi.fn(),
      addBond: vi.fn(),
      removeBond: vi.fn(),
    }),
  )
  return { result, onSelectAtom }
}

function pressKey(result: ReturnType<typeof makeHook>['result'], key: string) {
  act(() => {
    result.current.onKeyDown({
      key,
      target: document.createElement('div'),
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent)
  })
}

describe('useCanvasInteractions keyboard navigation (BI-260043 / REQ-FR-260032)', () => {
  it('ArrowRight advances selection to the next atom and calls onSelectAtom', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: 'a1' })
    pressKey(result, 'ArrowRight')
    expect(onSelectAtom).toHaveBeenCalledWith('a2')
  })

  it('ArrowDown advances selection to the next atom and calls onSelectAtom', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: 'a1' })
    pressKey(result, 'ArrowDown')
    expect(onSelectAtom).toHaveBeenCalledWith('a2')
  })

  it('ArrowLeft moves selection to the previous atom and calls onSelectAtom', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: 'a2' })
    pressKey(result, 'ArrowLeft')
    expect(onSelectAtom).toHaveBeenCalledWith('a1')
  })

  it('ArrowUp moves selection to the previous atom and calls onSelectAtom', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: 'a2' })
    pressKey(result, 'ArrowUp')
    expect(onSelectAtom).toHaveBeenCalledWith('a1')
  })

  it('ArrowRight wraps from the last atom to the first', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: 'a3' })
    pressKey(result, 'ArrowRight')
    expect(onSelectAtom).toHaveBeenCalledWith('a1')
  })

  it('ArrowLeft wraps from the first atom to the last', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: 'a1' })
    pressKey(result, 'ArrowLeft')
    expect(onSelectAtom).toHaveBeenCalledWith('a3')
  })

  it('Escape clears selection by calling onSelectAtom(null)', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: 'a1' })
    pressKey(result, 'Escape')
    expect(onSelectAtom).toHaveBeenCalledWith(null)
  })

  it('pane click clears selection by calling onSelectAtom(null)', () => {
    const onSelectAtom = vi.fn()
    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms: [makeAtom('a1')],
        edges: [],
        selectedAtomId: 'a1',
        onSelectAtom,
        deleteAtom: vi.fn(),
        createAtom: vi.fn(),
        addBond: vi.fn(),
        removeBond: vi.fn(),
      }),
    )
    act(() => { result.current.onPaneClick() })
    expect(onSelectAtom).toHaveBeenCalledWith(null)
  })
})

describe('useCanvasInteractions keyboard deletion policy', () => {
  it('opens delete confirmation for selected atom on Delete key', () => {
    const atoms = [makeAtom('a1', 'Alpha')]
    const onSelectAtom = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms,
        edges: [],
        selectedAtomId: 'a1',
        onSelectAtom,
        deleteAtom: vi.fn(),
        createAtom: vi.fn(),
        addBond: vi.fn(),
        removeBond: vi.fn(),
      }),
    )

    act(() => {
      result.current.onKeyDown({
        key: 'Delete',
        target: document.createElement('div'),
        preventDefault,
      } as unknown as React.KeyboardEvent)
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(result.current.confirmDelete?.properties.shellies.uuid).toBe('a1')
  })

  it('does not open delete confirmation for Backspace key', () => {
    const atoms = [makeAtom('a1', 'Alpha')]
    const onSelectAtom = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms,
        edges: [],
        selectedAtomId: 'a1',
        onSelectAtom,
        deleteAtom: vi.fn(),
        createAtom: vi.fn(),
        addBond: vi.fn(),
        removeBond: vi.fn(),
      }),
    )

    act(() => {
      result.current.onKeyDown({
        key: 'Backspace',
        target: document.createElement('div'),
        preventDefault,
      } as unknown as React.KeyboardEvent)
    })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(result.current.confirmDelete).toBeNull()
  })

  it('does not trigger deletion when Delete is pressed inside input fields', () => {
    const atoms = [makeAtom('a1', 'Alpha')]
    const onSelectAtom = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms,
        edges: [] as Edge[],
        selectedAtomId: 'a1',
        onSelectAtom,
        deleteAtom: vi.fn(),
        createAtom: vi.fn(),
        addBond: vi.fn(),
        removeBond: vi.fn(),
      }),
    )

    act(() => {
      result.current.onKeyDown({
        key: 'Delete',
        target: document.createElement('input'),
        preventDefault,
      } as unknown as React.KeyboardEvent)
    })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(result.current.confirmDelete).toBeNull()
  })
})

describe('useCanvasInteractions access-level gating (BI-260061 / REQ-FR-260069)', () => {
  const connection = (source: string, target: string): Connection => ({
    source, target, sourceHandle: null, targetHandle: null,
  })

  it('opens the bond dialog when connecting from an owner/editor source', () => {
    const { result } = makeHook() // default OWNER
    act(() => { result.current.onConnect(connection('a1', 'a2')) })
    expect(result.current.pendingConnection).toEqual({ source: 'a1', target: 'a2' })
  })

  it('allows an EDITOR to bond from their source', () => {
    const atoms = [makeAtom('a1', 'Alpha', 'EDITOR'), makeAtom('a2', 'Beta', 'OWNER')]
    const { result } = makeHook({ atoms })
    act(() => { result.current.onConnect(connection('a1', 'a2')) })
    expect(result.current.pendingConnection).toEqual({ source: 'a1', target: 'a2' })
  })

  it('ignores a bond drawn from a view-only source', () => {
    const atoms = [makeAtom('a1', 'Alpha', 'VIEWER'), makeAtom('a2', 'Beta', 'OWNER')]
    const { result } = makeHook({ atoms })
    act(() => { result.current.onConnect(connection('a1', 'a2')) })
    expect(result.current.pendingConnection).toBeNull()
  })

  it('does not open delete confirmation for a view-only atom on Delete', () => {
    const { result } = makeHook({ atoms: [makeAtom('a1', 'Alpha', 'VIEWER')], selectedAtomId: 'a1' })
    pressKey(result, 'Delete')
    expect(result.current.confirmDelete).toBeNull()
  })

  it('does not open delete confirmation for an EDITOR (destroy is owner-only)', () => {
    const { result } = makeHook({ atoms: [makeAtom('a1', 'Alpha', 'EDITOR')], selectedAtomId: 'a1' })
    pressKey(result, 'Delete')
    expect(result.current.confirmDelete).toBeNull()
  })

  function bondHook(sourceLevel: EffectiveAccessLevel, removeBond = vi.fn()) {
    const sourceAtom = { ...makeAtom('a1', 'Alpha', sourceLevel), bonds: [{ uuid: 'a2', name: 'REL', direction: 'from' }] }
    const edges: Edge[] = [{ id: 'e1', source: 'a1', target: 'a2', label: 'REL', selected: true }]
    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms: [sourceAtom, makeAtom('a2', 'Beta')],
        edges,
        selectedAtomId: 'a1',
        onSelectAtom: vi.fn(),
        deleteAtom: vi.fn(),
        createAtom: vi.fn(),
        addBond: vi.fn(),
        removeBond,
      }),
    )
    return { result, removeBond }
  }

  it('removes a bond from an editable source via Delete on a selected edge', async () => {
    const { result, removeBond } = bondHook('EDITOR', vi.fn().mockResolvedValue(undefined))
    await act(async () => {
      result.current.onKeyDown({ key: 'Delete', target: document.createElement('div'), preventDefault: vi.fn() } as unknown as React.KeyboardEvent)
    })
    expect(removeBond).toHaveBeenCalledWith('a1', 'a2', 'REL')
  })

  it('does not remove a bond from a view-only source', async () => {
    const { result, removeBond } = bondHook('VIEWER')
    await act(async () => {
      result.current.onKeyDown({ key: 'Delete', target: document.createElement('div'), preventDefault: vi.fn() } as unknown as React.KeyboardEvent)
    })
    expect(removeBond).not.toHaveBeenCalled()
  })
})

describe('useCanvasInteractions surfaces mutation failures', () => {
  const atoms = [makeAtom('a1', 'Alpha'), makeAtom('a2', 'Beta')]

  type Mutations = Pick<
    Parameters<typeof useCanvasInteractions>[0],
    'deleteAtom' | 'createAtom' | 'addBond' | 'removeBond'
  >

  function hookWith(mutations: Partial<Mutations>, edges: Edge[] = []) {
    return renderHook(() =>
      useCanvasInteractions({
        atoms,
        edges,
        selectedAtomId: null,
        onSelectAtom: vi.fn(),
        deleteAtom: mutations.deleteAtom ?? vi.fn(),
        createAtom: mutations.createAtom ?? vi.fn(),
        addBond: mutations.addBond ?? vi.fn(),
        removeBond: mutations.removeBond ?? vi.fn(),
      }),
    )
  }

  it('starts with no action error', () => {
    const { result } = hookWith({})
    expect(result.current.actionError).toBeNull()
  })

  it('reports a failed bond creation instead of swallowing it', async () => {
    const addBond = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = hookWith({ addBond })

    act(() => { result.current.onConnect({ source: 'a1', target: 'a2' } as Connection) })
    await act(async () => { await result.current.handleBondConfirm('DEPENDS_ON') })

    expect(result.current.actionError).toMatch(/could not create the bond/i)
  })

  it('reports a failed atom deletion', async () => {
    const deleteAtom = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = hookWith({ deleteAtom })

    act(() => { result.current.setConfirmDelete(atoms[0]! as never) })
    await act(async () => { await result.current.handleDeleteConfirm() })

    expect(result.current.actionError).toMatch(/could not delete the atom/i)
  })

  it('reports a failed undo — the worst case to hide', async () => {
    const createAtom = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = hookWith({ createAtom })

    await act(async () => {
      await result.current.handleUndo({ type: 'atom', atom: atoms[0]! as never })
    })

    expect(result.current.actionError).toMatch(/could not undo/i)
  })

  it('leaves no error behind after a successful action', async () => {
    const addBond = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)
    const { result } = hookWith({ addBond })

    act(() => { result.current.onConnect({ source: 'a1', target: 'a2' } as Connection) })
    await act(async () => { await result.current.handleBondConfirm('DEPENDS_ON') })
    expect(result.current.actionError).not.toBeNull()

    act(() => { result.current.onConnect({ source: 'a1', target: 'a2' } as Connection) })
    await act(async () => { await result.current.handleBondConfirm('DEPENDS_ON') })
    expect(result.current.actionError).toBeNull()
  })

  it('can be dismissed', async () => {
    const deleteAtom = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = hookWith({ deleteAtom })

    act(() => { result.current.setConfirmDelete(atoms[0]! as never) })
    await act(async () => { await result.current.handleDeleteConfirm() })
    expect(result.current.actionError).not.toBeNull()

    act(() => { result.current.dismissActionError() })
    expect(result.current.actionError).toBeNull()
  })
})

describe('useCanvasInteractions surfaces bond-removal and bond-undo failures', () => {
  function bondedAtoms() {
    const source = makeAtom('a1', 'Alpha')
    source.bonds = [{ uuid: 'a2', name: 'DEPENDS_ON', direction: 'from' }] as never
    return [source, makeAtom('a2', 'Beta')]
  }

  it('reports a failed bond removal triggered by the Delete key', async () => {
    const removeBond = vi.fn().mockRejectedValue(new Error('boom'))
    const edges = [
      { id: 'e1', source: 'a1', target: 'a2', label: 'DEPENDS_ON', selected: true },
    ] as unknown as Edge[]
    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms: bondedAtoms(),
        edges,
        selectedAtomId: 'a1',
        onSelectAtom: vi.fn(),
        deleteAtom: vi.fn(),
        createAtom: vi.fn(),
        addBond: vi.fn(),
        removeBond,
      }),
    )

    await act(async () => {
      result.current.onKeyDown({
        key: 'Delete',
        target: document.createElement('div'),
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)
    })

    expect(removeBond).toHaveBeenCalled()
    expect(result.current.actionError).toMatch(/could not remove the bond/i)
  })

  it('reports a failed bond undo', async () => {
    const addBond = vi.fn().mockRejectedValue(new Error('boom'))
    const atoms = bondedAtoms()
    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms,
        edges: [],
        selectedAtomId: null,
        onSelectAtom: vi.fn(),
        deleteAtom: vi.fn(),
        createAtom: vi.fn(),
        addBond,
        removeBond: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.handleUndo({
        type: 'bond',
        atom: atoms[0]!,
        bond: { uuid: 'a2', name: 'DEPENDS_ON', direction: 'from' },
      } as never)
    })

    expect(addBond).toHaveBeenCalledWith('a1', 'a2', 'DEPENDS_ON')
    expect(result.current.actionError).toMatch(/could not undo/i)
  })
})

describe('useCanvasInteractions successful deletion (pre-existing gap)', () => {
  it('offers undo and clears the selection when the deleted atom was selected', async () => {
    const atoms = [makeAtom('a1', 'Alpha'), makeAtom('a2', 'Beta')]
    const deleteAtom = vi.fn().mockResolvedValue(undefined)
    const onSelectAtom = vi.fn()
    const { result } = renderHook(() =>
      useCanvasInteractions({
        atoms,
        edges: [],
        selectedAtomId: 'a1',
        onSelectAtom,
        deleteAtom,
        createAtom: vi.fn(),
        addBond: vi.fn(),
        removeBond: vi.fn(),
      }),
    )

    act(() => { result.current.setConfirmDelete(atoms[0]! as never) })
    await act(async () => { await result.current.handleDeleteConfirm() })

    expect(deleteAtom).toHaveBeenCalledWith('a1')
    expect(result.current.undoEntry).toMatchObject({ type: 'atom' })
    expect(onSelectAtom).toHaveBeenCalledWith(null)
    expect(result.current.actionError).toBeNull()
  })
})

describe('useCanvasInteractions node selection', () => {
  it('selects the clicked atom', () => {
    const { result, onSelectAtom } = makeHook()

    act(() => {
      result.current.onNodeClick(
        {} as unknown as React.MouseEvent,
        { id: 'a2' } as never,
      )
    })

    expect(onSelectAtom).toHaveBeenCalledWith('a2')
  })
})

describe('useCanvasInteractions arrow navigation on an empty canvas', () => {
  // These guards exist to stop the non-null assertions below them from throwing on an empty
  // atom list; without coverage a regression there surfaces as a runtime crash, not a test failure.
  it('ArrowRight is a no-op with no atoms', () => {
    const { result, onSelectAtom } = makeHook({ atoms: [] })
    pressKey(result, 'ArrowRight')
    expect(onSelectAtom).not.toHaveBeenCalled()
  })

  it('ArrowLeft is a no-op with no atoms', () => {
    const { result, onSelectAtom } = makeHook({ atoms: [] })
    pressKey(result, 'ArrowLeft')
    expect(onSelectAtom).not.toHaveBeenCalled()
  })
})

describe('useCanvasInteractions arrow navigation with nothing selected', () => {
  it('ArrowRight selects the first atom', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: null })
    pressKey(result, 'ArrowRight')
    expect(onSelectAtom).toHaveBeenCalledWith('a1')
  })

  it('ArrowLeft selects the last atom', () => {
    const { result, onSelectAtom } = makeHook({ selectedAtomId: null })
    pressKey(result, 'ArrowLeft')
    expect(onSelectAtom).toHaveBeenCalledWith('a3')
  })
})
