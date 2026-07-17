import { useState, useEffect } from 'react'
import { useApolloClient } from '@apollo/client/react'
import { LIST_LABELS_QUERY } from '../../api-contract/graph-queries'
import type { ListLabelsResponse } from '../../api-contract/graph-queries'

/**
 * All known labels, fetched once for chip autocomplete (ADR-260063 / EPIC-260067).
 * Best-effort: silently empty on failure (precedent: workspace-search's use-recommended-labels).
 */
export function useLabelSuggestions(): string[] {
  const client = useApolloClient()
  const [labels, setLabels] = useState<string[]>([])

  useEffect(() => {
    void client
      .query<ListLabelsResponse>({
        query: LIST_LABELS_QUERY,
        variables: { prefix: '' },
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        setLabels(data?.listLabels ?? [])
      })
      .catch(() => {
        // best-effort: suggestions silently absent on failure
      })
  }, [client])

  return labels
}
