import { EntitiesApiError } from '../features/partnerships/api/entitiesClient'

export function errorMessage(
  err: unknown,
  fallback = 'Action failed. Please try again.',
): string {
  if (err instanceof EntitiesApiError) {
    if (err.code === 'DUPLICATE_ENTITY_NAME') return 'An entity with that name already exists.'
    if (err.code === 'ENTITY_HAS_PARTNERSHIPS') {
      return 'This entity has partnerships attached. Move or delete them before removing the entity.'
    }
    if (err.code === 'FORBIDDEN_ROLE') return 'Only Admins can manage entities.'
    if (err.code === 'VALIDATION_ERROR') return 'Please enter a valid entity name.'
    return err.code
  }
  return fallback
}
