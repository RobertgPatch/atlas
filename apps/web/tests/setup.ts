import '@testing-library/jest-dom/vitest'

// Mock pdfjs-dist — the bundle is not available in JSDOM and tests never exercise it.
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}))
