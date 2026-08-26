import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_REQUIRED_WORKLOADS = Object.freeze([
  'k1_upload_file',
  'k1_bda_document',
  'k1_bedrock_checkbox',
  'plaid_link_token',
  'plaid_token_exchange',
  'plaid_refresh',
  'market_provider_call',
  'report_export',
  'market_price_backfill',
])

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const dateOnly = (value) => {
  if (typeof value !== 'string' || !dateOnlyPattern.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value
}

const roundUsd = (value) => Number(value.toFixed(6))

const error = (code, message, context = {}) => ({ code, message, ...context })

const validateFinitePositiveInteger = (
  errors,
  workload,
  field,
  code,
) => {
  const value = workload[field]
  if (!Number.isSafeInteger(value) || value <= 0) {
    errors.push(error(
      code,
      `${workload.workloadKey ?? '<unknown>'}.${field} must be a finite positive integer.`,
      { workloadKey: workload.workloadKey ?? null, field },
    ))
    return false
  }
  return true
}

const validateWorkload = (workload, nowDay) => {
  const errors = []
  if (!isObject(workload)) {
    return {
      errors: [error('INVALID_WORKLOAD', 'Every workload entry must be an object.')],
      result: null,
    }
  }

  const workloadKey = typeof workload.workloadKey === 'string'
    ? workload.workloadKey.trim()
    : ''
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(workloadKey)) {
    errors.push(error(
      'INVALID_WORKLOAD_KEY',
      'workloadKey must be a stable lowercase identifier.',
      { workloadKey: workloadKey || null },
    ))
  }
  if (typeof workload.unitName !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(workload.unitName)) {
    errors.push(error('MISSING_UNIT_NAME', `${workloadKey || '<unknown>'} has no valid unitName.`, { workloadKey }))
  }
  if (!Number.isFinite(workload.unitPriceUsd) || workload.unitPriceUsd <= 0) {
    errors.push(error('INVALID_UNIT_PRICE', `${workloadKey || '<unknown>'}.unitPriceUsd must be finite and greater than zero.`, { workloadKey }))
  }

  const attemptsValid = validateFinitePositiveInteger(
    errors,
    workload,
    'maximumProviderAttempts',
    'UNLIMITED_PROVIDER_ATTEMPTS',
  )
  validateFinitePositiveInteger(
    errors,
    workload,
    'perPrincipalRollingLimit',
    'UNLIMITED_PER_PRINCIPAL_ROLLING_LIMIT',
  )
  validateFinitePositiveInteger(
    errors,
    workload,
    'perPrincipalDailyLimit',
    'UNLIMITED_PER_PRINCIPAL_DAILY_LIMIT',
  )
  const dailyValid = validateFinitePositiveInteger(
    errors,
    workload,
    'globalDailyLimit',
    'UNLIMITED_GLOBAL_DAILY_LIMIT',
  )
  const concurrencyValid = validateFinitePositiveInteger(
    errors,
    workload,
    'globalConcurrencyLimit',
    'UNLIMITED_GLOBAL_CONCURRENCY_LIMIT',
  )
  const backlogValid = validateFinitePositiveInteger(
    errors,
    workload,
    'globalBacklogLimit',
    'UNLIMITED_GLOBAL_BACKLOG_LIMIT',
  )

  if (
    Number.isSafeInteger(workload.perPrincipalRollingLimit)
    && Number.isSafeInteger(workload.perPrincipalDailyLimit)
    && workload.perPrincipalRollingLimit > workload.perPrincipalDailyLimit
  ) {
    errors.push(error(
      'INVALID_PRINCIPAL_LIMIT_ORDER',
      `${workloadKey}.perPrincipalRollingLimit must not exceed perPrincipalDailyLimit.`,
      { workloadKey },
    ))
  }
  if (
    concurrencyValid
    && backlogValid
    && workload.globalConcurrencyLimit > workload.globalBacklogLimit
  ) {
    errors.push(error(
      'INVALID_BACKLOG_LIMIT',
      `${workloadKey}.globalBacklogLimit must cover globalConcurrencyLimit.`,
      { workloadKey },
    ))
  }

  if (typeof workload.owner !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(workload.owner)) {
    errors.push(error('MISSING_OWNER', `${workloadKey || '<unknown>'} requires a stable owner.`, { workloadKey }))
  }
  if (
    !Number.isFinite(workload.warningPercent)
    || !Number.isFinite(workload.emergencyPercent)
    || workload.warningPercent <= 0
    || workload.warningPercent >= workload.emergencyPercent
    || workload.emergencyPercent > 100
  ) {
    errors.push(error(
      'INVALID_ALERT_THRESHOLDS',
      `${workloadKey}.warningPercent must be below emergencyPercent and both must be within 1-100.`,
      { workloadKey },
    ))
  }

  const reviewedAt = dateOnly(workload.reviewedAt)
  const reviewBefore = dateOnly(workload.reviewBefore)
  if (!reviewedAt) {
    errors.push(error('MISSING_PRICE_REVIEW', `${workloadKey} requires a valid reviewedAt date.`, { workloadKey }))
  }
  if (!reviewBefore) {
    errors.push(error('MISSING_REVIEW_DEADLINE', `${workloadKey} requires a valid reviewBefore date.`, { workloadKey }))
  }
  if (reviewedAt && reviewedAt > nowDay) {
    errors.push(error('FUTURE_PRICE_REVIEW', `${workloadKey}.reviewedAt cannot be in the future.`, { workloadKey }))
  }
  if (reviewedAt && reviewBefore && reviewBefore <= reviewedAt) {
    errors.push(error('INVALID_REVIEW_WINDOW', `${workloadKey}.reviewBefore must be after reviewedAt.`, { workloadKey }))
  }
  if (reviewBefore && reviewBefore < nowDay) {
    errors.push(error('STALE_PRICE_REVIEW', `${workloadKey} price review expired on ${reviewBefore}.`, { workloadKey }))
  }

  if (
    workload.priceSource !== undefined
    && (typeof workload.priceSource !== 'string' || workload.priceSource.trim().length < 8)
  ) {
    errors.push(error('INVALID_PRICE_SOURCE', `${workloadKey}.priceSource is invalid.`, { workloadKey }))
  }
  if (
    workload.killSwitch !== undefined
    && (typeof workload.killSwitch !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(workload.killSwitch))
  ) {
    errors.push(error('INVALID_KILL_SWITCH', `${workloadKey}.killSwitch is invalid.`, { workloadKey }))
  }
  if (
    workload.ceilingSources !== undefined
    && (
      !Array.isArray(workload.ceilingSources)
      || workload.ceilingSources.length === 0
      || workload.ceilingSources.some((value) => typeof value !== 'string' || value.trim() === '')
    )
  ) {
    errors.push(error('INVALID_CEILING_SOURCES', `${workloadKey}.ceilingSources must list finite enforcement settings.`, { workloadKey }))
  }

  const maximumDailyCostUsd = (
    Number.isFinite(workload.unitPriceUsd)
    && workload.unitPriceUsd > 0
    && attemptsValid
    && dailyValid
  )
    ? roundUsd(
        workload.unitPriceUsd
        * workload.maximumProviderAttempts
        * workload.globalDailyLimit,
      )
    : null

  return {
    errors,
    result: {
      workloadKey,
      maximumDailyCostUsd,
    },
  }
}

export const validateCostEnvelope = (document, options = {}) => {
  const errors = []
  const now = options.now instanceof Date ? options.now : new Date()
  if (Number.isNaN(now.getTime())) {
    return {
      valid: false,
      errors: [error('INVALID_VALIDATION_DATE', 'The validation date is invalid.')],
      maximumDailyCostUsd: null,
      workloads: [],
    }
  }
  const nowDay = now.toISOString().slice(0, 10)
  const requiredWorkloads = options.requiredWorkloads ?? DEFAULT_REQUIRED_WORKLOADS

  if (!isObject(document)) {
    return {
      valid: false,
      errors: [error('INVALID_DOCUMENT', 'The cost envelope must be an object.')],
      maximumDailyCostUsd: null,
      workloads: [],
    }
  }
  if (document.version !== 1) {
    errors.push(error('UNSUPPORTED_VERSION', 'cost-guardrails version must be 1.'))
  }
  if (typeof document.environment !== 'string' || document.environment.trim() === '') {
    errors.push(error('MISSING_ENVIRONMENT', 'A target environment is required.'))
  } else if (options.environment && document.environment !== options.environment) {
    errors.push(error(
      'ENVIRONMENT_MISMATCH',
      `Expected ${options.environment}, found ${document.environment}.`,
    ))
  }
  if (!Number.isFinite(document.approvedDailyUsd) || document.approvedDailyUsd <= 0) {
    errors.push(error('UNLIMITED_APPROVED_DAILY_USD', 'approvedDailyUsd must be finite and greater than zero.'))
  }

  const workloadDocuments = Array.isArray(document.workloads) ? document.workloads : []
  if (!Array.isArray(document.workloads)) {
    errors.push(error('MISSING_WORKLOADS', 'workloads must be an array.'))
  }
  const seen = new Set()
  const workloads = []
  for (const workload of workloadDocuments) {
    const validated = validateWorkload(workload, nowDay)
    errors.push(...validated.errors)
    if (!validated.result) continue
    if (seen.has(validated.result.workloadKey)) {
      errors.push(error(
        'DUPLICATE_WORKLOAD',
        `workloadKey ${validated.result.workloadKey} appears more than once.`,
        { workloadKey: validated.result.workloadKey },
      ))
    }
    seen.add(validated.result.workloadKey)
    workloads.push(validated.result)
  }

  for (const workloadKey of requiredWorkloads) {
    if (!seen.has(workloadKey)) {
      errors.push(error(
        'MISSING_WORKLOAD',
        `Required paid workload ${workloadKey} is missing.`,
        { workloadKey },
      ))
    }
  }

  if (!Array.isArray(document.vulnerabilityExceptions)) {
    errors.push(error('INVALID_EXCEPTIONS', 'vulnerabilityExceptions must be an array, even when empty.'))
  } else {
    for (const [index, exception] of document.vulnerabilityExceptions.entries()) {
      if (!isObject(exception)) {
        errors.push(error('INVALID_EXCEPTION', `vulnerabilityExceptions[${index}] must be an object.`, { exceptionIndex: index }))
        continue
      }
      const expiresOn = dateOnly(exception.expiresOn)
      if (!expiresOn) {
        errors.push(error('INVALID_EXCEPTION_EXPIRY', `vulnerabilityExceptions[${index}] requires expiresOn.`, { exceptionIndex: index }))
      } else if (expiresOn < nowDay) {
        errors.push(error(
          'EXPIRED_EXCEPTION',
          `Exception for ${exception.workloadKey ?? '<unknown>'} expired on ${expiresOn}.`,
          { exceptionIndex: index, workloadKey: exception.workloadKey ?? null },
        ))
      }
      if (typeof exception.owner !== 'string' || exception.owner.trim() === '') {
        errors.push(error('INVALID_EXCEPTION_OWNER', `vulnerabilityExceptions[${index}] requires an owner.`, { exceptionIndex: index }))
      }
      if (
        (typeof exception.exploitability !== 'string' || exception.exploitability.trim().length < 10)
        && (typeof exception.reason !== 'string' || exception.reason.trim().length < 10)
      ) {
        errors.push(error('INVALID_EXCEPTION_REASON', `vulnerabilityExceptions[${index}] requires exploitability or a meaningful reason.`, { exceptionIndex: index }))
      }
    }
  }

  const finiteCosts = workloads.map(({ maximumDailyCostUsd }) => maximumDailyCostUsd)
  const maximumDailyCostUsd = finiteCosts.every((value) => Number.isFinite(value))
    ? roundUsd(finiteCosts.reduce((total, value) => total + value, 0))
    : null
  if (
    Number.isFinite(maximumDailyCostUsd)
    && Number.isFinite(document.approvedDailyUsd)
    && maximumDailyCostUsd > document.approvedDailyUsd
  ) {
    errors.push(error(
      'APPROVED_DAILY_USD_EXCEEDED',
      `Calculated maximum $${maximumDailyCostUsd.toFixed(2)} exceeds approvedDailyUsd $${document.approvedDailyUsd.toFixed(2)}.`,
    ))
  }

  return {
    valid: errors.length === 0,
    errors,
    maximumDailyCostUsd,
    workloads,
  }
}

const usage = `Usage: node scripts/security/validate-cost-envelope.mjs [options]

Options:
  --file <path>          JSON-compatible YAML file (default: .security/cost-guardrails.yml)
  --environment <name>  Expected environment (default: production)
  --now <ISO date>       Validation time override for deterministic checks
  --help                 Show this help
`

const parseArguments = (arguments_) => {
  const parsed = {
    file: resolve('.security/cost-guardrails.yml'),
    environment: 'production',
    now: new Date(),
  }
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--help') return { ...parsed, help: true }
    if (!['--file', '--environment', '--now'].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`)
    }
    const value = arguments_[index + 1]
    if (!value) throw new Error(`Missing value for ${argument}`)
    index += 1
    if (argument === '--file') parsed.file = resolve(value)
    if (argument === '--environment') parsed.environment = value
    if (argument === '--now') parsed.now = new Date(value)
  }
  return parsed
}

const main = async () => {
  let arguments_
  try {
    arguments_ = parseArguments(process.argv.slice(2))
  } catch (caught) {
    console.error(caught instanceof Error ? caught.message : String(caught))
    console.error(usage)
    process.exitCode = 2
    return
  }
  if (arguments_.help) {
    console.log(usage)
    return
  }

  let document
  try {
    const source = (await readFile(arguments_.file, 'utf8')).replace(/^\uFEFF/, '')
    document = JSON.parse(source)
  } catch (caught) {
    console.error(`COST_ENVELOPE_READ_FAILED: ${caught instanceof Error ? caught.message : String(caught)}`)
    console.error('The .yml file must use JSON-compatible YAML so validation has no undeclared package dependency.')
    process.exitCode = 1
    return
  }

  const result = validateCostEnvelope(document, {
    environment: arguments_.environment,
    now: arguments_.now,
  })
  if (!result.valid) {
    for (const item of result.errors) {
      console.error(`${item.code}: ${item.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`Validated ${result.workloads.length} finite ${arguments_.environment} cost workloads:`)
  for (const workload of result.workloads) {
    console.log(`  ${workload.workloadKey}: $${workload.maximumDailyCostUsd.toFixed(2)}/day maximum`)
  }
  console.log(`Maximum daily cost: $${result.maximumDailyCostUsd.toFixed(2)} USD`)
  console.log(`Approved daily ceiling: $${document.approvedDailyUsd.toFixed(2)} USD`)
}

const directRun = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (directRun) await main()
