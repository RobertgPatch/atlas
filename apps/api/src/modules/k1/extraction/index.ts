import { config } from '../../../config.js'
import type { K1Extractor } from './K1Extractor.js'
import { stubExtractor } from './stubExtractor.js'
import { createAzureExtractor } from './azureExtractor.js'

let cached: K1Extractor | undefined

export function getExtractor(): K1Extractor {
  if (cached) return cached

  const backend = config.k1ExtractorBackend
  switch (backend) {
    case 'azure':
      cached = createAzureExtractor()
      break
    case 'stub':
    default:
      cached = stubExtractor
      break
  }

  return cached
}

export function setExtractorForTests(extractor: K1Extractor | undefined): void {
  cached = extractor
}
