import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TARGET_RULES = new Set([
  'api_general_per_ip',
  'api_general_global',
  'auth_per_ip',
  'auth_global',
  'paid_admission_per_ip',
  'paid_admission_global_emergency',
])
const RETAINED_FLOWS = [
  'homepage',
  'dashboard',
  'liquidity',
  'investment_tracker',
  'tic_registry',
  'entities',
]

export function validateWafRolloutEvidence(evidence, options = {}) {
  const errors = []
  const now = options.now instanceof Date ? options.now : new Date()
  const generatedAt = new Date(evidence?.generatedAt)
  const expiresAt = new Date(evidence?.expiresAt)
  if (evidence?.schemaVersion !== '1.0.0') errors.push('Unsupported WAF rollout evidence schema.')
  if (typeof evidence?.owner !== 'string' || evidence.owner.trim().length < 3) {
    errors.push('A named rollout owner is required.')
  }
  if (!Number.isFinite(generatedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) {
    errors.push('generatedAt and expiresAt must be RFC3339 timestamps.')
  } else {
    const duration = expiresAt.getTime() - generatedAt.getTime()
    if (generatedAt.getTime() > now.getTime() + 60_000) errors.push('Rollout evidence cannot be future-dated.')
    if (expiresAt <= now) errors.push('Rollout evidence has expired.')
    if (duration <= 0 || duration > 86_400_000) errors.push('Count observation must expire within 24 hours.')
  }
  if (!TARGET_RULES.has(evidence?.targetRule)) errors.push('Target WAF rule is not in the reviewed finite registry.')
  const validTransition = (
    evidence?.transition === 'count_to_block' && evidence?.fromAction === 'count' && evidence?.toAction === 'block'
  ) || (
    evidence?.transition === 'rollback_to_count' && evidence?.fromAction === 'block' && evidence?.toAction === 'count'
  )
  if (!validTransition) errors.push('Only Count-to-Block or Block-to-Count rollback is permitted.')

  const flowResults = new Map((evidence?.retainedFlows ?? []).map((flow) => [flow?.name, flow?.status]))
  if (!RETAINED_FLOWS.every((name) => flowResults.get(name) === 'pass')) {
    errors.push('Every retained dashboard-accessible flow must pass below the candidate limit.')
  }
  for (const field of ['wafMetricProven', 'alarmDestinationConfirmed', 'redactionReviewed']) {
    if (evidence?.observability?.[field] !== true) errors.push(`Observability evidence '${field}' is required.`)
  }
  for (const field of [
    'preservesWebAclAttachment',
    'preservesPrivateOrigin',
    'preservesHardAuthGlobalCeiling',
    'preservesHardPaidGlobalCeiling',
  ]) {
    if (evidence?.rollback?.[field] !== true) errors.push(`Rollback invariant '${field}' is required.`)
  }
  if (!Array.isArray(evidence?.changedInputs) || evidence.changedInputs.length !== 1 ||
      evidence.changedInputs[0] !== `waf.${evidence?.targetRule}.action`) {
    errors.push('The evidence may change only the selected WAF rule action.')
  }
  return { valid: errors.length === 0, errors }
}

async function main() {
  const args = process.argv.slice(2)
  const evidenceIndex = args.indexOf('--evidence')
  if (evidenceIndex < 0 || !args[evidenceIndex + 1]) throw new Error('Expected --evidence <path>.')
  const evidence = JSON.parse(await fs.readFile(path.resolve(args[evidenceIndex + 1]), 'utf8'))
  const result = validateWafRolloutEvidence(evidence)
  if (!result.valid) {
    for (const error of result.errors) process.stderr.write(`waf-rollout: ${error}\n`)
    process.exitCode = 4
    return
  }
  process.stdout.write(`PASS ${evidence.transition} evidence for ${evidence.targetRule}; no AWS Apply was performed.\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`waf-rollout: ${error instanceof Error ? error.message : 'validation failed'}\n`)
    process.exitCode = 4
  })
}
