import '@testing-library/jest-dom/vitest'

class ResizeObserverMock implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) { void callback }
  observe(target: Element, options?: ResizeObserverOptions) { void target; void options }
  unobserve(target: Element) { void target }
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

// Mock pdfjs-dist — the bundle is not available in JSDOM and tests never exercise it.
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}))
