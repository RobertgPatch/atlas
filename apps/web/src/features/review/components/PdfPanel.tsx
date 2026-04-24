import { useEffect, useRef, useState } from 'react'
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

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        {highlight && (
          <div className="text-xs text-gray-500 font-mono" data-testid="pdf-highlight-page">
            p.{highlight.page}
          </div>
        )}
      </div>
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
          src={`${pdfUrl}#page=${highlight?.page ?? 1}`}
          data-testid="pdf-iframe"
        />
      )}
    </div>
  )
}
