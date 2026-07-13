import { Navigate, useLocation } from 'react-router-dom'

/** Legacy browser entry retained only as a compatibility redirect. */
export function K1TrackerPage() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  if (!query.has('partnership') && query.has('partnershipId')) query.set('partnership', query.get('partnershipId')!)
  if (!query.has('year') && query.has('taxYear')) query.set('year', query.get('taxYear')!)
  query.delete('partnershipId')
  query.delete('taxYear')
  return <Navigate to={`/partnership-tracker${query.size ? `?${query}` : ''}`} replace />
}
