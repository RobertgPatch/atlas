import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Crosshair } from 'lucide-react'
import type { K1SourceLocation } from '../../../../../../packages/types/src/review-finalization'
import { ErrorState } from '../../../components/ErrorState'

interface Props {
  pdfUrl: string
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
export const PdfPanel = ({ pdfUrl, highlight, title = 'K-1 PDF' }: Props) => {
  const ref = useRef<HTMLIFrameElement>(null)
  const [probeKey, setProbeKey] = useState(0)
  const [unavailable, setUnavailable] = useState(false)
  const [page, setPage] = useState(highlight?.page ?? 1)

  useEffect(() => {
    let active = true
    setUnavailable(false)

    void fetch(pdfUrl, {
      method: 'HEAD',
      credentials: 'include',
      headers: { Accept: 'application/pdf' },
    })
      .then((res) => {
        if (!active) return
        const contentType = res.headers.get('content-type') ?? ''
        if (!res.ok || !contentType.includes('application/pdf')) {
          setUnavailable(true)
        }
      })
      .catch(() => {
        if (!active) return
        setUnavailable(true)
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

  useEffect(() => setPage(highlight?.page ?? 1), [highlight])

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
          message="The source PDF could not be loaded for this K-1 document."
          onRetry={() => setProbeKey((v) => v + 1)}
        />
      ) : (
        <iframe
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
