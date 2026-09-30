import { useEffect, useState } from 'react'
import { partiesApi, type PartySummary } from '../api'

// RII-46: my parties, for the "Näkyy" pickers and popup labels. Reloaded on
// login/logout and whenever membership changes (reloadKey).
export function useMyParties(userId: string | undefined, reloadKey: number): PartySummary[] {
  const [parties, setParties] = useState<PartySummary[]>([])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    partiesApi.list().then((result) => {
      if (!cancelled && result.ok) setParties(result.value)
    })
    return () => {
      cancelled = true
    }
  }, [userId, reloadKey])

  return userId ? parties : []
}
