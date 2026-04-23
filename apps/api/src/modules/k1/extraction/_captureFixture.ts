/**
 * _captureFixture.ts — Dev-only fixture regeneration script.
 *
 * Submits a local K-1 PDF to Azure Document Intelligence, then writes the
 * sanitised AnalyzeResult to tests/fixtures/azure-di-analyze-result.sample.json.
 *
 * PII scrubbing applied before writing:
 *   - SSN/TIN patterns  (\d{3}-\d{2}-\d{4})     → 987-65-4321
 *   - EIN patterns       (\d{2}-\d{7})            → 12-3456789
 *   - Legal entity names (heuristic: ALL CAPS tokens ≥ 3 words ending in LLC/LP/LLP/FUND/PARTNERS/INC/CORP/TRUST)
 *                                                 → IRON TRIANGLE FUND LP (synthetic)
 *
 * Usage (from apps/api directory):
 *   npm run capture-di-fixture -- --pdf ./path/to/sample-k1.pdf
 *
 * Or with tsx directly:
 *   npx tsx src/modules/k1/extraction/_captureFixture.ts --pdf ./sample-k1.pdf
 *
 * Requires K1_EXTRACTOR=azure (or any env) and valid Azure DI credentials in
 * apps/api/.env.  NOT part of npm test.
 */

import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
} from '@azure-rest/ai-document-intelligence'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Load .env from the apps/api root so this script can be run standalone.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../../../..', '.env')
dotenv.config({ path: envPath })

const FIXTURE_OUTPUT = path.resolve(
  __dirname,
  '../../../../tests/fixtures/azure-di-analyze-result.sample.json',
)

// ---------------------------------------------------------------------------
// PII scrubbing
// ---------------------------------------------------------------------------

/**
 * Replace SSN/TIN (###-##-####), EIN (##-#######), and all-caps legal entity
 * names with synthetic placeholders.  Operates on the serialised JSON string
 * so it covers every string value without needing to traverse the object.
 */
function scrubPii(json: string): string {
  // SSN / TIN: 9-digit pattern with first-group of 3
  let out = json.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '987-65-4321')
  // EIN: 2-digit + dash + 7-digit
  out = out.replace(/\b\d{2}-\d{7}\b/g, '12-3456789')
  // Legal entity name heuristic: consecutive ALL-CAPS words (≥ 3) ending in a
  // recognised legal suffix.  Matches names like "ACME CAPITAL PARTNERS VII LP".
  const entityNameRe =
    /\b(?:[A-Z][A-Z0-9&'-]* ){2,}(?:LLC|LP|LLP|FUND|PARTNERS|INC|CORP|TRUST|MANAGEMENT|CAPITAL|ASSOCIATES)\b/g
  out = out.replace(entityNameRe, 'IRON TRIANGLE FUND LP (synthetic)')
  return out
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parsePdfArg(): string {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--pdf')
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: npm run capture-di-fixture -- --pdf <path-to-pdf>')
    process.exit(1)
  }
  return path.resolve(args[idx + 1])
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pdfPath = parsePdfArg()

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  const apiVersion =
    process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? '2024-11-30'
  const modelId = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-layout'

  if (!endpoint || !key) {
    console.error(
      'Missing AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT or AZURE_DOCUMENT_INTELLIGENCE_KEY.\n' +
        'Set them in apps/api/.env or export them before running this script.',
    )
    process.exit(1)
  }

  console.log(`Reading PDF from: ${pdfPath}`)
  const pdfBuffer = new Uint8Array(await readFile(pdfPath))
  console.log(`PDF size: ${pdfBuffer.byteLength} bytes`)

  console.log(`Submitting to Azure DI: ${endpoint}`)
  const client = DocumentIntelligence(endpoint, { key })

  const initialResponse = await client
    .path('/documentModels/{modelId}:analyze', modelId)
    .post({
      contentType: 'application/pdf',
      body: pdfBuffer,
      queryParameters: {
        'api-version': apiVersion,
        stringIndexType: 'utf16CodeUnit',
      } as Record<string, string>,
    })

  if (isUnexpected(initialResponse)) {
    console.error(
      `Azure DI rejected the submission: HTTP ${initialResponse.status}`,
      (initialResponse.body as { message?: string }).message ?? '',
    )
    process.exit(1)
  }

  const opLocation =
    (initialResponse.headers as Record<string, string>)['operation-location'] ?? ''
  const operationId = opLocation.split('/').pop()?.split('?')[0] ?? 'unknown'
  console.log(`Model ID: ${modelId}`)
  console.log(`Operation ID: ${operationId}  — polling…`)

  const poller = getLongRunningPoller(client, initialResponse, {
    intervalInMs: 2_000,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pollResult = await (poller as any).pollUntilDone({
    abortSignal: AbortSignal.timeout(120_000),
  })

  if (isUnexpected(pollResult)) {
    console.error(
      `Azure DI polling failed: HTTP ${pollResult.status}`,
      (pollResult.body as { message?: string }).message ?? '',
    )
    process.exit(1)
  }

  const body = pollResult.body as { status?: string; analyzeResult?: unknown }
  if (body.status === 'failed') {
    console.error('Azure DI analysis failed (status=failed).')
    process.exit(1)
  }

  const raw = JSON.stringify(
    { _note: 'Generated by _captureFixture.ts — PII scrubbed', ...body },
    null,
    2,
  )
  const scrubbed = scrubPii(raw)

  await writeFile(FIXTURE_OUTPUT, scrubbed + '\n', 'utf8')
  console.log(`\nFixture written to:\n  ${FIXTURE_OUTPUT}`)
  console.log('Review the output for any residual PII before committing.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
