import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime'

import type { K1ExtractionDraft } from '../k1.types.js'
import { validateK1DraftRelationships } from './k1DraftValidation.js'

const FINAL_PATH = 'official.k1_status_final'
const AMENDED_PATH = 'official.k1_status_amended'
const STATUS_PATHS = new Set([FINAL_PATH, AMENDED_PATH])

type BedrockClient = Pick<BedrockRuntimeClient, 'send'>

export interface K1StatusCheckboxVerification {
  finalK1: boolean
  amendedK1: boolean
  evidence: string
  modelId: string
}

export interface K1StatusCheckboxVerifier {
  verify(pdfBytes: Uint8Array): Promise<K1StatusCheckboxVerification>
}

const responseText = (response: ConverseCommandOutput): string =>
  response.output?.message?.content
    ?.flatMap((content) => typeof content.text === 'string' ? [content.text] : [])
    .join('\n')
    .trim() ?? ''

const parseVerification = (raw: string, modelId: string): K1StatusCheckboxVerification => {
  const withoutFence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const firstBrace = withoutFence.indexOf('{')
  const lastBrace = withoutFence.lastIndexOf('}')
  const json = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw Object.assign(new Error('BEDROCK_CHECKBOX_RESPONSE_INVALID'), { code: 'BEDROCK_CHECKBOX_RESPONSE_INVALID' })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('BEDROCK_CHECKBOX_RESPONSE_INVALID'), { code: 'BEDROCK_CHECKBOX_RESPONSE_INVALID' })
  }
  const value = parsed as Record<string, unknown>
  if (typeof value.finalK1 !== 'boolean' || typeof value.amendedK1 !== 'boolean') {
    throw Object.assign(new Error('BEDROCK_CHECKBOX_RESPONSE_INVALID'), { code: 'BEDROCK_CHECKBOX_RESPONSE_INVALID' })
  }
  return {
    finalK1: value.finalK1,
    amendedK1: value.amendedK1,
    evidence: typeof value.evidence === 'string' ? value.evidence.slice(0, 500) : 'Bedrock visual checkbox verification.',
    modelId,
  }
}

export class BedrockK1StatusCheckboxVerifier implements K1StatusCheckboxVerifier {
  private readonly client: BedrockClient
  private readonly modelId: string

  constructor(options: { client?: BedrockClient; modelId?: string; region?: string } = {}) {
    this.client = options.client ?? new BedrockRuntimeClient({ region: options.region })
    this.modelId = options.modelId ?? 'us.amazon.nova-2-lite-v1:0'
  }

  async verify(pdfBytes: Uint8Array): Promise<K1StatusCheckboxVerification> {
    const response = await this.client.send(new ConverseCommand({
      modelId: this.modelId,
      messages: [{
        role: 'user',
        content: [
          {
            document: {
              format: 'pdf',
              name: 'schedule-k1',
              source: { bytes: pdfBytes },
            },
          },
          {
            text: [
              'Inspect only the two status checkboxes at the top of page 1 of this Schedule K-1.',
              "The small square immediately left of 'Final K-1' may contain a typed X; any X, check mark, fill, or crossing stroke means checked.",
              "Apply the same rule independently to the small square immediately left of 'Amended K-1'.",
              'Return exactly one JSON object with boolean keys finalK1 and amendedK1 and a short evidence string. Do not use Markdown.',
            ].join(' '),
          },
        ],
      }],
      inferenceConfig: { maxTokens: 200, temperature: 0 },
    })) as ConverseCommandOutput
    return parseVerification(responseText(response), this.modelId)
  }
}

export const hasAmbiguousK1StatusCheckbox = (draft: K1ExtractionDraft): boolean =>
  draft.validationIssues.some(
    (issue) => issue.code === 'AMBIGUOUS_CHECKBOX' && issue.canonicalPath != null && STATUS_PATHS.has(issue.canonicalPath),
  )

export const applyK1StatusCheckboxVerification = (
  draft: K1ExtractionDraft,
  verification: K1StatusCheckboxVerification,
): K1ExtractionDraft => {
  const ambiguousPaths = new Set(
    draft.validationIssues.flatMap((issue) =>
      issue.code === 'AMBIGUOUS_CHECKBOX' && issue.canonicalPath && STATUS_PATHS.has(issue.canonicalPath)
        ? [issue.canonicalPath]
        : []),
  )
  if (ambiguousPaths.size === 0) return draft

  const evidenceId = `bedrock-status-checkbox:${verification.modelId}`
  const values = draft.values.map((value) => {
    if (!ambiguousPaths.has(value.canonicalPath)) return value
    return {
      ...value,
      normalizedValue: value.canonicalPath === FINAL_PATH ? verification.finalK1 : verification.amendedK1,
      sourceLocations: [
        { page: 1, textRef: evidenceId },
        ...value.sourceLocations,
      ],
    }
  })
  const validationIssues = draft.validationIssues.filter((issue) =>
    !(issue.code === 'AMBIGUOUS_CHECKBOX' && issue.canonicalPath && ambiguousPaths.has(issue.canonicalPath))
    && issue.code !== 'MUTUALLY_EXCLUSIVE_FIELDS',
  )
  validationIssues.push(...validateK1DraftRelationships(values).filter((issue) => issue.code === 'MUTUALLY_EXCLUSIVE_FIELDS'))

  return {
    ...draft,
    values,
    evidence: [
      ...draft.evidence,
      {
        id: evidenceId,
        page: 1,
        kind: 'IMAGE',
        sourceRef: verification.evidence,
      },
    ],
    validationIssues,
  }
}
