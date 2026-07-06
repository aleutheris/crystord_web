import type { CategoryTreeProps, CategoryTreeNode, CategoryTreeClassNames } from './widgets.types'

/**
 * Style-neutral, permission-aware category tree (ADR-260061 / EPIC-260066 T8). Renders a
 * `CategoryTreeNode[]` as an ARIA tree with expand/collapse, select, and per-node count badges.
 * Edit affordances render only where `canEditNode` returns true (the Q2 permission seam) and an
 * `onEditNode` action is provided. Data/styling injected; consumed by the Categories navigator
 * (EPIC-260068) and atom "pick" mode (EPIC-260067).
 *
 * Every action is a native `<button>`, so the tree is fully keyboard-operable today. The formal
 * ARIA tree keyboard pattern (roving focus + arrow-key navigation) is completed by EPIC-260068
 * when it wires real data and focus management.
 */
export function CategoryTree({
  nodes,
  expandedKeys,
  onToggle,
  onSelect,
  canEditNode,
  onEditNode,
  ariaLabel = 'Categories',
  classNames,
}: CategoryTreeProps) {
  return (
    <ul role="tree" aria-label={ariaLabel} className={classNames?.root}>
      {nodes.map((node) => (
        <CategoryTreeItem
          key={node.key}
          node={node}
          expandedKeys={expandedKeys}
          onToggle={onToggle}
          onSelect={onSelect}
          canEditNode={canEditNode}
          onEditNode={onEditNode}
          classNames={classNames}
        />
      ))}
    </ul>
  )
}

interface CategoryTreeItemProps {
  node: CategoryTreeNode
  expandedKeys: string[]
  onToggle: (key: string) => void
  onSelect?: (node: CategoryTreeNode) => void
  canEditNode?: (node: CategoryTreeNode) => boolean
  onEditNode?: (node: CategoryTreeNode) => void
  classNames?: CategoryTreeClassNames
}

function CategoryTreeItem({ node, expandedKeys, onToggle, onSelect, canEditNode, onEditNode, classNames }: CategoryTreeItemProps) {
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const expanded = expandedKeys.includes(node.key)
  const showEdit = canEditNode?.(node) === true && onEditNode !== undefined

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined} className={classNames?.item}>
      <span>
        {hasChildren && (
          <button
            type="button"
            className={classNames?.toggle}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.displayName}`}
            onClick={() => onToggle(node.key)}
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
        <button type="button" className={classNames?.select} onClick={() => onSelect?.(node)}>
          <span className={classNames?.label}>{node.displayName}</span>
          {node.atomCount !== undefined && <span className={classNames?.count}>{node.atomCount}</span>}
        </button>
        {showEdit && (
          <button type="button" className={classNames?.edit} aria-label={`Edit ${node.displayName}`} onClick={() => onEditNode!(node)}>
            ✎
          </button>
        )}
      </span>
      {hasChildren && expanded && (
        <ul role="group" className={classNames?.group}>
          {children.map((child) => (
            <CategoryTreeItem
              key={child.key}
              node={child}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              onSelect={onSelect}
              canEditNode={canEditNode}
              onEditNode={onEditNode}
              classNames={classNames}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
