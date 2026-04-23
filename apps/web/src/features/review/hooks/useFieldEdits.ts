import { useState } from 'react'
import type {
  K1FieldValue,
  K1ReviewSection,
} from '../../../../../../packages/types/src/review-finalization'

/**
 * Tracks pending edits keyed by fieldId so multiple fields can be saved together.
 * Exposed as a hook-like pure function returning a tuple of helpers.
 */
export interface PendingEdits {
  values: Record<string, string | null>
  touchedIds: string[]
}

export const useFieldEdits = () => {
  const [edits, setEdits] = useState<PendingEdits>({ values: {}, touchedIds: [] })

  const setFieldValue = (fieldId: string, value: string | null) => {
    setEdits((prev) => {
      const next = { ...prev.values, [fieldId]: value }
      const touched = Array.from(new Set([...prev.touchedIds, fieldId]))
      return { values: next, touchedIds: touched }
    })
  }

  const reset = () => setEdits({ values: {}, touchedIds: [] })

  const currentValueFor = (field: K1FieldValue): string | null => {
    if (field.id in edits.values) return edits.values[field.id] ?? null
    return field.reviewerCorrectedValue ?? field.normalizedValue ?? field.rawValue
  }

  const hasEdits = edits.touchedIds.length > 0

  const toCorrectionsPayload = () =>
    edits.touchedIds.map((fieldId) => ({
      fieldId,
      value: edits.values[fieldId] ?? null,
    }))

  return { edits, setFieldValue, reset, currentValueFor, hasEdits, toCorrectionsPayload }
}

export const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'bg-green-50 border-green-200 text-green-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-red-50 border-red-200 text-red-700',
  none: 'bg-gray-50 border-gray-200 text-gray-600',
}

export const SECTION_TITLE: Record<K1ReviewSection, string> = {
  entityMapping: 'Entity Mapping',
  partnershipMapping: 'Partnership Mapping',
  core: 'K-1 Boxes',
}
