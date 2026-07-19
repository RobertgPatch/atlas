import { Navigate, useLocation } from 'react-router-dom'

/** Legacy browser entry retained only as a compatibility redirect. */
export function PartnershipDirectory() {
  const location = useLocation()
  return <Navigate to={`/partnership-tracker${location.search}`} replace />
}
