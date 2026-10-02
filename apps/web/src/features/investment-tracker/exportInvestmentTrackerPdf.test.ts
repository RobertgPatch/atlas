import { describe, expect, it } from 'vitest'
import { pdfPageEnd } from './exportInvestmentTrackerPdf'

describe('PDF pagination', () => {
  it('moves a chart panel intact onto the next page', () => {
    expect(pdfPageEnd(0, 1000, 2400, [{ top: 800, bottom: 1200 }])).toBe(800)
    expect(pdfPageEnd(800, 1000, 2400, [{ top: 800, bottom: 1200 }])).toBe(1800)
  })

  it('keeps table rows intact and uses the last page only for remaining content', () => {
    const rows = [{ top: 950, bottom: 1020 }, { top: 1020, bottom: 1090 }]
    expect(pdfPageEnd(0, 1000, 1090, rows)).toBe(950)
    expect(pdfPageEnd(950, 1000, 1090, rows)).toBe(1090)
  })

  it('makes progress with a section taller than a page', () => {
    expect(pdfPageEnd(0, 1000, 3000, [{ top: 100, bottom: 2800 }])).toBe(1000)
  })

  it('does not cascade back through adjacent rows with fractional borders', () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ top: index * 60 + 0.25, bottom: (index + 1) * 60 + 0.5 }))
    expect(pdfPageEnd(0, 1000, 1800, rows)).toBe(960.25)
  })

  it('rechecks overlapping sections after moving the page boundary', () => {
    expect(pdfPageEnd(0, 1000, 2000, [{ top: 850, bottom: 1100 }, { top: 700, bottom: 900 }])).toBe(700)
  })
})
