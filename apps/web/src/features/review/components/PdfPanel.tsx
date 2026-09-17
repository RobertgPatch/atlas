import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Crosshair, Upload } from 'lucide-react'
import type { K1SourceLocation } from '../../../../../../packages/types/src/review-finalization'
import { ErrorState } from '../../../components/ErrorState'
import { authenticatedFetch } from '../../../auth/authenticatedFetch'
import { Button } from '../../../components/shared/Button'

interface Props {
  pdfUrl: string
  reattachUrl?: string
  highlight: K1SourceLocation | null
  /** Absolute API base so iframe includes credentials automatically on same-origin. */
  title?: string
}

/**
 * Native-browser PDF preview. Uses the URL fragment `#page=N` to jump to the
 * location referenced by the selected field. When browsers support bbox
 * navigation (FitR), that could be added; today the fragment moves the viewer
 * to the correct page, which is sufficient for the US1 acceptance criterion.
 */
export const PdfPanel = ({ pdfUrl, reattachUrl, highlight, title = 'K-1 PDF' }: Props) => {
  const ref = useRef<HTMLIFrameElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [probeKey, setProbeKey] = useState(0)
  const [unavailable, setUnavailable] = useState(false)
  const [sourceMissing, setSourceMissing] = useState(false)
  const [page, setPage] = useState(highlight?.page ?? 1)
  const [reattaching, setReattaching] = useState(false)
  const [reattachError, setReattachError] = useState<string | null>(null)

  const reattachSource = async (file: File) => {
    if (!reattachUrl) return
    setReattaching(true)
    setReattachError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await authenticatedFetch(reattachUrl, {
        method: 'PUT',
        credentials: 'include',
        body: form,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => undefined) as { error?: string } | undefined
        if (payload?.error === 'SOURCE_PDF_CHECKSUM_MISMATCH') {
          throw new Error('That file is not the original PDF for this K-1. Select the same PDF that was uploaded before.')
        }
        if (payload?.error === 'SOURCE_PDF_ALREADY_AVAILABLE') {
          setReattachError(null)
          setProbeKey((value) => value + 1)
          return
        }
        if (payload?.error === 'PDF_STORAGE_UNAVAILABLE') {
          throw new Error('PDF storage is temporarily unavailable. Try loading the PDF again shortly.')
        }
        throw new Error('The PDF could not be reattached. Please try again.')
      }
      setUnavailable(false)
      setProbeKey((value) => value + 1)
    } catch (error) {
      setReattachError(error instanceof Error ? error.message : 'The PDF could not be reattached.')
    } finally {
      setReattaching(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  useEffect(() => {
    let active = true

    void authenticatedFetch(pdfUrl, {
      method: 'HEAD',
      credentials: 'include',
      headers: { Accept: 'application/pdf' },
    })
      .then((res) => {
        if (!active) return
        const contentType = res.headers.get('content-type') ?? ''
        setSourceMissing(res.status === 404)
        setUnavailable(!res.ok || !contentType.includes('application/pdf'))
        if (res.ok) setReattachError(null)
      })
      .catch(() => {
        if (!active) return
        setUnavailable(true)
        setSourceMissing(false)
      })

    return () => {
      active = false
    }
  }, [pdfUrl, probeKey])

  useEffect(() => {
    if (!ref.current) return
    const page = highlight?.page ?? 1
    // Re-assign src to force the browser to seek to the fragment.
    const url = `${pdfUrl}#page=${page}`
    if (ref.current.src !== url) {
      ref.current.src = url
    }
  }, [highlight, pdfUrl])

  useEffect(() => {
    // The selected evidence field is an external navigation command for the
    // native PDF viewer, so it intentionally resets manual page navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(highlight?.page ?? 1)
  }, [highlight])

  useEffect(() => {
    if (!ref.current) return
    ref.current.src = `${pdfUrl}#page=${page}`
  }, [page, pdfUrl])

  return (
    <section
      className="flex flex-col h-full bg-white border border-slate-300 rounded-lg overflow-hidden shadow-[0_12px_35px_rgba(15,23,42,0.08)]"
      aria-label="Source PDF evidence"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') setPage((value) => Math.max(1, value - 1))
        if (event.key === 'ArrowRight' || event.key === 'PageDown') setPage((value) => value + 1)
      }}
    >
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous PDF page" onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600"><ChevronLeft size={14} /></button>
          <div className="min-w-12 text-center text-xs text-gray-500 font-mono" data-testid="pdf-highlight-page" aria-live="polite">
            p.{page}
          </div>
          <button type="button" aria-label="Next PDF page" onClick={() => setPage((value) => value + 1)} className="rounded border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600"><ChevronRight size={14} /></button>
        </div>
      </div>
      {highlight?.bbox && (
        <div className="flex items-center gap-2 border-b border-cyan-200 bg-cyan-50 px-4 py-1.5 text-xs text-cyan-900" data-testid="pdf-highlight-bbox">
          <Crosshair size={13} aria-hidden="true" />
          Evidence region {highlight.bbox.map((coordinate) => Number(coordinate).toFixed(2)).join(' · ')}
        </div>
      )}
      {unavailable ? (
        <ErrorState
          title="PDF unavailable"
          message={reattachError ?? (sourceMissing
            ? 'The source PDF could not be found for this K-1 document. Reattach the original file to keep the existing review and audit history.'
            : 'PDF storage is temporarily unavailable. Try loading the PDF again shortly.')}
          onRetry={() => setProbeKey((v) => v + 1)}
        >
          {reattachUrl && sourceMissing && <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              aria-label="Select original source PDF"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void reattachSource(file)
              }}
            />
            <Button
              type="button"
              size="sm"
              pending={reattaching}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {reattaching ? 'Reattaching…' : 'Reattach original PDF'}
            </Button>
          </>}
        </ErrorState>
      ) : (
        <iframe
          key={`${pdfUrl}:${probeKey}`}
          ref={ref}
          title="PDF preview"
          className="w-full flex-1"
          src={`${pdfUrl}#page=${page}`}
          data-testid="pdf-iframe"
        />
      )}
    </section>
  )
}
