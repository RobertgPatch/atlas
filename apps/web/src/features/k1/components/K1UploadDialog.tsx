import { useMemo, useState } from 'react'
import { Upload, X, AlertCircle } from 'lucide-react'
import { K1ApiError } from '../api/k1Client'
import { useK1Lookups, useK1Upload } from '../hooks/useK1Queries'
import type { K1DuplicateResponse } from '../../../../../../packages/types/src/k1-ingestion'

interface K1UploadDialogProps {
  open: boolean
  onClose: () => void
  onUploaded: () => void
}

const currentYear = new Date().getFullYear()
const YEARS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

export function K1UploadDialog({ open, onClose, onUploaded }: K1UploadDialogProps) {
  const [entityId, setEntityId] = useState('')
  const [partnershipId, setPartnershipId] = useState('')
  const [taxYear, setTaxYear] = useState<number>(currentYear - 1)
  const [file, setFile] = useState<File | null>(null)
  const [duplicate, setDuplicate] = useState<K1DuplicateResponse['existing'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lookups = useK1Lookups()
  const upload = useK1Upload()

  const partnershipOptions = useMemo(() => {
    if (!lookups.data || !entityId) return []
    return lookups.data.partnerships.filter((p) => p.entityId === entityId)
  }, [lookups.data, entityId])

  const reset = () => {
    setEntityId('')
    setPartnershipId('')
    setTaxYear(currentYear - 1)
    setFile(null)
    setDuplicate(null)
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async (opts: { replaceDocumentId?: string } = {}) => {
    if (!file || !partnershipId || !entityId) {
      setError('Choose entity, partnership, tax year, and a PDF.')
      return
    }
    setError(null)
    try {
      await upload.mutateAsync({
        file,
        partnershipId,
        entityId,
        taxYear,
        replaceDocumentId: opts.replaceDocumentId,
      })
      onUploaded()
      handleClose()
    } catch (err) {
      if (err instanceof K1ApiError && err.code === 'DUPLICATE_K1') {
        const payload = err.payload as K1DuplicateResponse
        setDuplicate(payload.existing)
        return
      }
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
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Entity</span>
            <select
              value={entityId}
              onChange={(e) => { setEntityId(e.target.value); setPartnershipId('') }}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold"
              disabled={lookups.isLoading}
            >
              <option value="">Select entity…</option>
              {lookups.data?.entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Partnership</span>
            <select
              value={partnershipId}
              onChange={(e) => setPartnershipId(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold disabled:bg-gray-50"
              disabled={!entityId}
            >
              <option value="">Select partnership…</option>
              {partnershipOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Tax year</span>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(Number(e.target.value))}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>

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

          {duplicate && (
            <div className="rounded-md border border-warning/30 bg-warning-light p-3 text-sm text-gray-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p>
                    A K-1 for this partnership, entity, and year already exists
                    (uploaded {new Date(duplicate.uploadedAt).toLocaleDateString()}).
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSubmit({ replaceDocumentId: duplicate.documentId })}
                      className="px-3 py-1.5 text-xs font-medium bg-atlas-gold text-white rounded hover:bg-atlas-hover"
                    >
                      Replace existing
                    </button>
                    <button
                      onClick={() => { setDuplicate(null); handleClose() }}
                      className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                    >
                      Keep existing (cancel)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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
            disabled={upload.isPending || !file || !partnershipId || !!duplicate}
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
