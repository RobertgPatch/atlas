import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Building2, CheckCircle2, FileText, RefreshCw, Upload, X } from 'lucide-react'

import type { K1IngestionBatch, K1IngestionItem } from '../../../../../../packages/types/src/k1-ingestion'
import { Button } from '../../../components/shared/Button'
import {
  fieldClassName,
  fileDropClassName,
  iconActionClassName,
  interactiveLinkClassName,
} from '../../../components/shared/colorRecipes'
import { K1ApiError } from '../api/k1Client'
import { useK1BatchUpload, useK1Lookups } from '../hooks/useK1Queries'

interface K1UploadDialogProps {
  open: boolean
  onClose: () => void
  onUploaded: () => void
  onBatchCreated?: (batch: K1IngestionBatch) => void
  initialFile?: File | null
  entityScope?: {
    id: string
    name: string
  }
}

type LocalStatus = 'READY' | 'UPLOADING' | K1IngestionItem['status']

interface LocalFileState {
  key: string
  file: File
  status: LocalStatus
  progress: number
  error: { code: string; message: string; retryable: boolean } | null
}

const MAX_FILES = 25
const MAX_BYTES = 25 * 1024 * 1024

const keyFor = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

const validateFiles = (files: File[]): string | null => {
  if (files.length > MAX_FILES) return `You can upload up to ${MAX_FILES} PDFs at a time.`
  for (const file of files) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return `${file.name} must be a PDF.`
    }
    if (file.size < 1) return `${file.name} is empty.`
    if (file.size > MAX_BYTES) return `${file.name} is larger than 25 MB.`
  }
  return null
}

const statusLabel = (state: LocalFileState): string => {
  if (state.status === 'READY') return 'Ready'
  if (state.status === 'UPLOADING') return `Uploading ${state.progress}%`
  if (state.status === 'PENDING_UPLOAD') return 'Waiting to upload'
  if (state.status === 'UPLOADED' || state.status === 'VALIDATING') return 'Validating'
  if (state.status === 'QUEUED') return 'Queued'
  if (state.status === 'PROCESSING') return 'Extracting'
  if (state.status === 'NEEDS_MATCH') return 'Needs matching'
  if (state.status === 'NEEDS_REVIEW') return 'Needs review'
  if (state.status === 'READY_TO_APPLY') return 'Ready to apply'
  if (state.status === 'APPLIED') return 'Applied'
  if (state.status === 'CANCELLED') return 'Cancelled'
  return 'Failed'
}

const itemError = (item: K1IngestionItem): LocalFileState['error'] => {
  if (!item.error) return null
  const value = item.error as K1IngestionItem['error'] & { code?: string; error?: string }
  return {
    code: value.code ?? value.error,
    message: value.message ?? value.error,
    retryable: value.retryable ?? false,
  }
}

export function K1UploadDialog({
  open,
  onClose,
  onUploaded,
  onBatchCreated,
  initialFile,
  entityScope,
}: K1UploadDialogProps) {
  const [entityId, setEntityId] = useState(entityScope?.id ?? '')
  const [files, setFiles] = useState<LocalFileState[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lookups = useK1Lookups()
  const upload = useK1BatchUpload()

  const addFiles = (incoming: File[]) => {
    const validation = validateFiles(incoming)
    if (validation) {
      setError(validation)
      return
    }
    setFiles((current) => {
      const unique = new Map(current.map((entry) => [entry.key, entry]))
      for (const file of incoming) {
        const key = keyFor(file)
        if (!unique.has(key)) {
          unique.set(key, { key, file, status: 'READY', progress: 0, error: null })
        }
      }
      const next = [...unique.values()]
      const combinedError = validateFiles(next.map((entry) => entry.file))
      if (combinedError) {
        setError(combinedError)
        return current
      }
      setError(null)
      return next
    })
  }

  useEffect(() => {
    if (open && initialFile) addFiles([initialFile])
    // `initialFile` is the only intentional trigger; `addFiles` uses a state callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile])

  useEffect(() => {
    if (open && entityScope) setEntityId(entityScope.id)
  }, [entityScope, open])

  const reset = () => {
    setEntityId(entityScope?.id ?? '')
    setFiles([])
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const updateProgress = (fileName: string, progress: number) => {
    setFiles((current) => current.map((entry) => entry.file.name === fileName
      ? { ...entry, status: 'UPLOADING', progress }
      : entry))
  }

  const mergeBatch = (batch: K1IngestionBatch, submitted: File[]) => {
    setFiles((current) => current.map((entry) => {
      const submittedIndex = submitted.findIndex((file) => keyFor(file) === entry.key)
      const item = submittedIndex >= 0 ? batch.items[submittedIndex] : undefined
      return item
        ? { ...entry, status: item.status, progress: 100, error: itemError(item) }
        : entry
    }))
  }

  const uploadFiles = async (submitted: File[]) => {
    if (!entityId) {
      setError('Choose an entity before uploading.')
      return
    }
    setError(null)
    setFiles((current) => current.map((entry) => submitted.some((file) => keyFor(file) === entry.key)
      ? { ...entry, status: 'UPLOADING', progress: 0, error: null }
      : entry))
    try {
      const batch = await upload.mutateAsync({
        files: submitted,
        entityScopeId: entityId,
        onProgress: updateProgress,
      })
      mergeBatch(batch, submitted)
      onBatchCreated?.(batch)
      onUploaded()
      if (batch.items.every((item) => item.status !== 'FAILED')) handleClose()
    } catch (caught) {
      const message = caught instanceof K1ApiError
        ? ((caught.payload as { message?: string } | undefined)?.message ?? caught.code)
        : 'Upload failed. Try again.'
      setFiles((current) => current.map((entry) => submitted.some((file) => keyFor(file) === entry.key)
        ? { ...entry, status: 'FAILED', error: { code: 'UPLOAD_FAILED', message, retryable: true } }
        : entry))
      setError(message)
    }
  }

  const readyFiles = useMemo(
    () => files.filter((entry) => entry.status === 'READY').map((entry) => entry.file),
    [files],
  )

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="k1-upload-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="k1-upload-title" className="text-lg font-semibold text-gray-900">Upload K-1 documents</h2>
            <p className="mt-0.5 text-sm text-gray-500">Select up to 25 partnership K-1 PDFs. Each document is read separately.</p>
          </div>
          <button aria-label="Close upload dialog" onClick={handleClose} className={iconActionClassName}>
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {entityScope ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-950">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">Upload scope</p>
                <p className="mt-0.5 font-semibold">{entityScope.name}</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">Documents are matched to a partnership and tax year from their extracted EIN, TIN, and filing period before anything is applied.</p>
              </div>
            </div>
          ) : !lookups.isLoading && (lookups.data?.entities.length ?? 0) === 0 ? (
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="flex-1">
                <p className="font-semibold">You have no entities yet</p>
                <p className="mt-1">Create an entity before uploading K-1s.</p>
                <Link to="/entities" onClick={handleClose} className={`mt-2 inline-flex font-medium ${interactiveLinkClassName}`}>
                  Go to Entities →
                </Link>
              </div>
            </div>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Entity</span>
              <select
                aria-label="Entity"
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                className={`mt-1 block w-full px-3 py-2 text-sm ${fieldClassName}`}
                disabled={lookups.isLoading || upload.isPending}
              >
                <option value="">Select entity…</option>
                {lookups.data?.entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>{entity.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Partnership and tax-year matches are proposed from the PDF. The app will ask for review instead of creating or overwriting records automatically.
          </div>

          <div
            data-testid="k1-drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              addFiles(Array.from(event.dataTransfer.files))
            }}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition ${fileDropClassName}`}
          >
            <Upload className="mx-auto h-7 w-7 text-gray-400" />
            <label className="mt-2 block cursor-pointer text-sm font-medium text-gray-800">
              Drop PDFs here or choose files
              <input
                ref={inputRef}
                aria-label="PDF files"
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
                className="sr-only"
              />
            </label>
            <p className="mt-1 text-xs text-gray-500">PDF only · 25 MB per file · 25 files per batch</p>
          </div>

          {files.length > 0 && (
            <ul className="space-y-2" aria-label="Selected K-1 files">
              {files.map((entry) => (
                <li
                  key={entry.key}
                  data-testid={`upload-file-${entry.file.name}`}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{entry.file.name}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span>{(entry.file.size / 1024).toFixed(1)} KB</span>
                        <span aria-live="polite" className={entry.status === 'FAILED' ? 'text-error' : 'text-gray-600'}>
                          {statusLabel(entry)}
                        </span>
                      </div>
                      {entry.status === 'UPLOADING' && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                          <div className="h-full bg-primary transition-all" style={{ width: `${entry.progress}%` }} />
                        </div>
                      )}
                      {entry.error && <p className="mt-1 text-xs text-error">{entry.error.message}</p>}
                    </div>
                    {entry.status === 'READY' ? (
                      <Button
                        aria-label={`Remove ${entry.file.name}`}
                        onClick={() => setFiles((current) => current.filter((value) => value.key !== entry.key))}
                        variant="ghost"
                        size="icon"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : entry.status === 'FAILED' && entry.error?.retryable ? (
                      <Button
                        aria-label={`Retry ${entry.file.name}`}
                        onClick={() => void uploadFiles([entry.file])}
                        variant="secondary"
                        size="sm"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry
                      </Button>
                    ) : entry.status === 'QUEUED' || entry.status === 'PROCESSING' ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : entry.status === 'FAILED' ? (
                      <AlertCircle className="h-5 w-5 text-error" />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div role="alert" className="rounded-md border border-error/30 bg-error-light p-3 text-sm text-error">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <Button onClick={handleClose} variant="secondary">
            {files.some((entry) => entry.status !== 'READY') ? 'Done' : 'Cancel'}
          </Button>
          {readyFiles.length > 0 && (
            <Button
              onClick={() => void uploadFiles(readyFiles)}
              disabled={upload.isPending || !entityId}
              pending={upload.isPending}
            >
              <Upload className="h-4 w-4" />
              {upload.isPending ? 'Uploading…' : `Upload ${readyFiles.length} ${readyFiles.length === 1 ? 'file' : 'files'}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
