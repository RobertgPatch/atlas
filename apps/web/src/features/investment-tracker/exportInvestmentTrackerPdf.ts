const REPORT_WIDTH = 1600
const PAGE_MARGIN = 12
const FOOTER_HEIGHT = 8

interface Bounds { top: number; bottom: number }

// Prefer the start of a card/row to cutting through it. Oversized sections can
// still span pages, so a long report never stalls or needs a giant canvas.
export function pdfPageEnd(start: number, height: number, total: number, keepTogether: Bounds[]) {
  let end = Math.min(start + height, total)
  for (;;) {
    const crossing = keepTogether.filter((bounds) => (
      bounds.top > start + 0.5 && bounds.top < end - 0.5 && bounds.bottom > end + 0.5
      && bounds.bottom - bounds.top <= height
    ))
    if (!crossing.length) return end
    end = Math.min(...crossing.map((bounds) => bounds.top))
  }
}

function snapshotView(source: HTMLElement) {
  const copy = source.cloneNode(true) as HTMLElement
  // cloneNode does not reliably preserve a select's live selection.
  source.querySelectorAll('select').forEach((select) => {
    const replacement = document.createElement('div')
    replacement.className = select.className
    replacement.textContent = select.selectedOptions[0]?.textContent ?? ''
    copy.querySelectorAll('select')[0]?.replaceWith(replacement)
  })
  copy.querySelectorAll('[data-pdf-exclude], [role="dialog"], [role="tooltip"]').forEach((node) => node.remove())
  // Keep filter labels and fund names, without interactive buttons/icons.
  copy.querySelectorAll('button').forEach((button) => {
    const replacement = document.createElement('span')
    replacement.className = button.className
    replacement.append(...Array.from(button.childNodes))
    button.replaceWith(replacement)
  })
  return copy
}

/** Download the current DOM view locally; no report data is sent to a service. */
export async function exportInvestmentTrackerPdf(source: HTMLElement) {
  // Freeze the view before awaiting imports, fonts, or rendering.
  const copy = snapshotView(source)
  const host = document.createElement('div')
  host.dataset.pdfHost = ''
  host.setAttribute('aria-hidden', 'true')
  host.inert = true
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${REPORT_WIDTH}px`, pointerEvents: 'none' })
  const styles = document.createElement('style')
  styles.textContent = `
    [data-pdf-capture], [data-pdf-capture] * { scrollbar-width: none !important; scrollbar-gutter: auto !important; }
    [data-pdf-capture]::-webkit-scrollbar, [data-pdf-capture] *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    [data-pdf-capture] * { animation: none !important; transition: none !important; }
    [data-pdf-capture] [data-pdf-scroll] { height: auto !important; max-height: none !important; overflow: visible !important; }
    [data-pdf-capture] .sticky { position: static !important; }
    [data-pdf-capture] .truncate { overflow: visible !important; white-space: normal !important; text-overflow: clip !important; }
    [data-pdf-capture] [data-pdf-chart-grid] { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    [data-pdf-capture] [data-pdf-filter-grid] { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  `
  const viewport = document.createElement('div')
  viewport.dataset.pdfCapture = ''
  Object.assign(viewport.style, { width: `${REPORT_WIDTH}px`, position: 'relative', overflow: 'hidden', backgroundColor: '#e7edf4' })
  const slice = document.createElement('div')
  Object.assign(slice.style, { position: 'relative', overflow: 'hidden', width: '100%' })
  Object.assign(copy.style, { margin: '0', padding: '24px', minHeight: '0', width: '100%', boxSizing: 'border-box' })
  slice.append(copy)
  // Include scrollbar rules in the serialized image, as well as the live clone.
  viewport.append(styles, slice)
  host.append(viewport)
  document.body.append(host)

  try {
    // Expand every scroll area, including summary panels without a PDF marker.
    // Keep intentional clipping on chart bars and the page-slicing viewport.
    for (const element of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
      const computed = window.getComputedStyle(element)
      if ([computed.overflowX, computed.overflowY].some((value) => value === 'auto' || value === 'scroll')) {
        element.style.setProperty('overflow', 'visible', 'important')
        element.style.setProperty('height', 'auto', 'important')
        element.style.setProperty('max-height', 'none', 'important')
      }
    }
    const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([
      import('html-to-image'), import('jspdf'),
    ])
    await document.fonts.ready
    // Allow very wide values to enlarge the report instead of clipping columns.
    const width = Math.max(REPORT_WIDTH, copy.scrollWidth, ...Array.from(copy.querySelectorAll('table')).map((table) => table.scrollWidth + 48))
    host.style.width = viewport.style.width = `${width}px`
    const rootBounds = copy.getBoundingClientRect()
    const total = Math.ceil(rootBounds.height)
    const boundsOf = (element: Element) => {
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top - rootBounds.top, bottom: bounds.bottom - rootBounds.top }
    }
    const keepTogether = Array.from(copy.querySelectorAll('[data-pdf-keep-together], tr, header')).map(boundsOf)
    const tables = Array.from(copy.querySelectorAll('table')).filter((table) => table.tHead).map((table) => ({
      table,
      ...boundsOf(table),
      bodyTop: boundsOf(table.tHead!).bottom,
      left: table.getBoundingClientRect().left - rootBounds.left,
      width: table.getBoundingClientRect().width,
    }))
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true })
    pdf.setProperties({ title: 'Investment tracker', subject: 'Current investment tracker view', creator: 'Atlas' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imageWidth = pageWidth - PAGE_MARGIN * 2
    const maxHeight = Math.floor((pageHeight - PAGE_MARGIN * 2 - FOOTER_HEIGHT) * width / imageWidth)
    const fontEmbedCSS = await getFontEmbedCSS(copy)
    let start = 0
    let page = 0

    while (start < total) {
      const continued = tables.find((table) => start >= table.bodyTop && start < table.bottom)
      let repeatedHeader: HTMLDivElement | undefined
      let headerHeight = 0
      if (continued) {
        repeatedHeader = document.createElement('div')
        repeatedHeader.style.paddingLeft = `${continued.left}px`
        const table = continued.table.cloneNode(false) as HTMLTableElement
        table.style.width = `${continued.width}px`
        const columns = document.createElement('colgroup')
        Array.from(continued.table.tHead!.rows[0].cells).forEach((cell) => {
          const column = document.createElement('col')
          column.style.width = `${cell.getBoundingClientRect().width}px`
          columns.append(column)
        })
        table.append(columns, continued.table.tHead!.cloneNode(true))
        repeatedHeader.append(table)
        viewport.prepend(repeatedHeader)
        headerHeight = Math.ceil(repeatedHeader.getBoundingClientRect().height)
      }
      const end = pdfPageEnd(start, maxHeight - headerHeight, total, keepTogether)
      const height = end - start
      slice.style.height = `${height}px`
      copy.style.transform = `translateY(-${start}px)`
      viewport.style.height = `${height + headerHeight}px`
      const canvas = await toCanvas(viewport, { width, height: height + headerHeight, pixelRatio: 2, fontEmbedCSS })
      if (page > 0) pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', PAGE_MARGIN, PAGE_MARGIN, imageWidth, (height + headerHeight) * imageWidth / width, undefined, 'FAST')
      // Release each page's bitmap before rendering the next one.
      canvas.width = canvas.height = 0
      repeatedHeader?.remove()
      start = end
      page += 1
    }

    for (let index = 1; index <= page; index += 1) {
      pdf.setPage(index)
      pdf.setFontSize(9)
      pdf.setTextColor(71, 85, 105)
      pdf.text('Investment tracker', PAGE_MARGIN, pageHeight - PAGE_MARGIN)
      pdf.text(`${index} / ${page}`, pageWidth - PAGE_MARGIN, pageHeight - PAGE_MARGIN, { align: 'right' })
    }
    const date = new Date()
    const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
    await pdf.save(`investment-tracker-${stamp}.pdf`, { returnPromise: true })
  } finally {
    host.remove()
  }
}
