import { describe, expect, it, vi } from 'vitest'

import {
  applyK1StatusCheckboxVerification,
  BedrockK1StatusCheckboxVerifier,
} from '../src/modules/k1/extraction/bedrockCheckboxVerifier.js'
import { mapBdaResult } from '../src/modules/k1/extraction/mapBdaResult.js'

describe('Bedrock K-1 status checkbox verification', () => {
  it('parses the Bedrock visual response and sends the PDF as a document', async () => {
    const send = vi.fn().mockResolvedValue({
      output: {
        message: {
          content: [{ text: '```json\n{"finalK1":true,"amendedK1":false,"evidence":"Visible X in Final K-1."}\n```' }],
        },
      },
    })
    const verifier = new BedrockK1StatusCheckboxVerifier({
      client: { send },
      modelId: 'us.amazon.nova-2-lite-v1:0',
    })

    await expect(verifier.verify(Buffer.from('%PDF-test'))).resolves.toEqual({
      finalK1: true,
      amendedK1: false,
      evidence: 'Visible X in Final K-1.',
      modelId: 'us.amazon.nova-2-lite-v1:0',
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].input.messages[0].content[0].document.source.bytes)
      .toEqual(Buffer.from('%PDF-test'))
  })

  it('replaces only ambiguous status values and retains Bedrock evidence', () => {
    const draft = mapBdaResult({
      outputSegments: [{
        customOutputStatus: 'MATCH',
        customOutput: {
          inference_result: {
            match__tax_year: 2025,
            official__k1_status_final: 'UNCHECKED',
            official__k1_status_amended: 'UNCHECKED',
          },
          explainability_info: {
            official__k1_status_final: { confidence: 0.36, geometry: [{ page: 1 }] },
            official__k1_status_amended: { confidence: 0.86, geometry: [{ page: 1 }] },
          },
        },
      }],
    })

    const verified = applyK1StatusCheckboxVerification(draft, {
      finalK1: true,
      amendedK1: false,
      evidence: 'The Final K-1 square contains an X.',
      modelId: 'us.amazon.nova-2-lite-v1:0',
    })

    expect(verified.values.find((value) => value.canonicalPath === 'official.k1_status_final')?.normalizedValue).toBe(true)
    expect(verified.values.find((value) => value.canonicalPath === 'official.k1_status_amended')?.normalizedValue).toBe(false)
    expect(verified.validationIssues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AMBIGUOUS_CHECKBOX' }),
    ]))
    expect(verified.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'IMAGE', sourceRef: 'The Final K-1 square contains an X.' }),
    ]))
  })
})
