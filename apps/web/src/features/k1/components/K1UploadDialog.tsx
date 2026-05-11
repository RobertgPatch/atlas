import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Upload, X } from 'lucide-react'
import { K1ApiError } from '../api/k1Client'
import { useK1Lookups, useK1Upload } from '../hooks/useK1Queries'

interface K1UploadDialogProps {
  open: boolean
  onClose: () => void
  onUploaded: () => void
  initialFile?: File | null
}

export function K1UploadDialog({ open, onClose, onUploaded, initialFile }: K1UploadDialogProps) {
  const [entityId, setEntityId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && initialFile) {
      setFile(initialFile)
    }
  }, [open, initialFile])

  const lookups = useK1Lookups()
  const upload = useK1Upload()

  const reset = () => {
    setEntityId('')
    setFile(null)
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async (opts: { replaceDocumentId?: string } = {}) => {
    if (!file || !entityId) {
      setError('Choose an entity and a PDF.')
      return
    }
    setError(null)
    try {
      await upload.mutateAsync({
        file,
        entityId,
        replaceDocumentId: opts.replaceDocumentId,
      })
      onUploaded()
      handleClose()
    } catch (err) {
      setError(err instanceof K1ApiError ? err.code : 'Upload failed.')
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload K-1</h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {!lookups.isLoading && (lookups.data?.entities.length ?? 0) === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3">
              <Building2 className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">You have no entities yet</p>
                <p className="mt-1">
                  Every K-1 must be attached to an entity. Create one first, then come back to upload.
                </p>
                <Link
                  to="/entities"
                  onClick={handleClose}
                  className="inline-flex items-center mt-2 text-atlas-gold hover:text-atlas-hover font-medium"
                >
                  Go to Entities →
                </Link>
              </div>
            </div>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Entity</span>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold"
                disabled={lookups.isLoading}
              >
                <option value="">Select entity…</option>
                {lookups.data?.entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Partnership name and tax year are extracted from the uploaded K-1. If the partnership
            does not already exist for the selected entity, the backend will create it automatically.
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">PDF file</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-sm hover:file:bg-gray-200"
            />
            {file && (
              <p className="mt-1 text-xs text-gray-500">
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </label>

          {error && (
            <div className="rounded-md border border-error/30 bg-error-light p-3 text-sm text-error">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={upload.isPending || !file || !entityId}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-atlas-gold text-white rounded-lg hover:bg-atlas-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
