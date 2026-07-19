import { Navigate, useLocation, useParams } from 'react-router-dom'

/** Legacy browser entry retained only as a selection-preserving redirect. */
export function PartnershipDetail() {
  const { id } = useParams()
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  if (id) query.set('partnership', id)
  return <Navigate to={`/partnership-tracker?${query}`} replace />
}
