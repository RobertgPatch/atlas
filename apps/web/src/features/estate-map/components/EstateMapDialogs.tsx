import { useState } from 'react'
import type { EntityListItem } from '../../partnerships/api/entitiesClient'
import {
  MagicButton,
  MagicModal,
  mpInputClass,
  mpLabelClass,
} from '../../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'
import type { EstateMapDefinition } from '../estateMapStorage'

export function EstateMapEditorDialog({
  map,
  entities,
  defaultRootEntityId,
  onClose,
  onSave,
}: {
  map?: EstateMapDefinition
  entities: EntityListItem[]
  defaultRootEntityId?: string
  onClose: () => void
  onSave: (value: { name: string; rootEntityId: string }) => void
}) {
  const [name, setName] = useState(map?.name ?? '')
  const [rootEntityId, setRootEntityId] = useState(
    map?.rootEntityId ?? defaultRootEntityId ?? entities[0]?.id ?? '',
  )
  const [submitted, setSubmitted] = useState(false)
  const nameError = submitted && !name.trim() ? 'Enter a map name.' : undefined
  const rootError = submitted && !rootEntityId ? 'Select the main trust or owner.' : undefined

  const save = () => {
    setSubmitted(true)
    if (!name.trim() || !rootEntityId) return
    onSave({ name: name.trim(), rootEntityId })
  }

  return (
    <MagicModal
      open
      onClose={onClose}
      size="md"
      title={map ? 'Edit estate map' : 'Create estate map'}
      description="Choose the trust or owner at the top of this map. Partnership relationships determine the branches below it."
      footer={
        <>
          <MagicButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </MagicButton>
          <MagicButton type="button" onClick={save}>
            {map ? 'Save changes' : 'Create map'}
          </MagicButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className={mpLabelClass}>
          Map name <span className="text-red-700">*</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Main Trust Estate Map"
            className={mpInputClass}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'estate-map-name-error' : undefined}
          />
          {nameError ? (
            <span id="estate-map-name-error" className="mt-1 block text-xs text-red-700">
              {nameError}
            </span>
          ) : null}
        </label>
        <label className={mpLabelClass}>
          Main trust / owner <span className="text-red-700">*</span>
          <select
            value={rootEntityId}
            onChange={(event) => setRootEntityId(event.target.value)}
            className={mpInputClass}
            aria-invalid={Boolean(rootError)}
            aria-describedby={rootError ? 'estate-map-root-error' : 'estate-map-root-help'}
          >
            <option value="">Select an entity or individual</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name} · {entity.entityType}
              </option>
            ))}
          </select>
          <span id="estate-map-root-help" className="mt-1 block text-xs font-normal text-slate-500">
            This record is the map's root. Its ownership and control relationships decide which partnerships appear.
          </span>
          {rootError ? (
            <span id="estate-map-root-error" className="mt-1 block text-xs text-red-700">
              {rootError}
            </span>
          ) : null}
        </label>
      </div>
    </MagicModal>
  )
}
