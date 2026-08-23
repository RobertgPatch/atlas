import { config } from '../../../config.js'
import type { K1Extractor } from './K1Extractor.js'
import { stubExtractor } from './stubExtractor.js'
import { createBdaExtractor } from './bdaExtractor.js'

let cached: K1Extractor | undefined

export type K1ExtractorBackend = K1Extractor['backend']
export type K1ExtractorFactory = () => K1Extractor

const factories = new Map<K1ExtractorBackend, K1ExtractorFactory>([
  ['stub', () => stubExtractor],
  ['aws_bda', createBdaExtractor],
])

export const registerExtractorProvider = (
  backend: K1ExtractorBackend,
  factory: K1ExtractorFactory,
): void => {
  factories.set(backend, factory)
  if (cached?.backend === backend) cached = undefined
}

export function getExtractor(): K1Extractor {
  if (cached) return cached

  const backend = config.k1ExtractorBackend
  const factory = factories.get(backend)
  if (!factory) throw new Error(`Unsupported K-1 extractor backend: ${backend}`)
  cached = factory()

  return cached
}

export function setExtractorForTests(extractor: K1Extractor | undefined): void {
  cached = extractor
}

export const listExtractorProviders = (): K1ExtractorBackend[] => [...factories.keys()]
