import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100
const isFiniteNonnegative = (value) => Number.isFinite(value) && value >= 0

export function calculateProductionCost(profile, priceEvidence, options = {}) {
  const errors = []
  const unpriced = []
  const now = options.now instanceof Date ? options.now : new Date()
  const maxRateAgeDays = options.maxRateAgeDays ?? 30

  if (profile?.schemaVersion !== '1.0.0') errors.push('Unsupported workload-profile schema.')
  if (priceEvidence?.schemaVersion !== '1.0.0') errors.push('Unsupported price-evidence schema.')
  if (profile?.region !== 'us-west-2' || priceEvidence?.region !== profile?.region) {
    errors.push('Cost evidence must use the committed us-west-2 production target.')
  }
  if (!Array.isArray(priceEvidence?.sources) || priceEvidence.sources.length === 0 ||
      priceEvidence.sources.some((source) => typeof source !== 'string' || !/^https:\/\//.test(source))) {
    errors.push('Price evidence requires at least one dated HTTPS source.')
  }

  const retrievedAt = new Date(priceEvidence?.retrievedAt)
  const ageMs = now.getTime() - retrievedAt.getTime()
  if (!Number.isFinite(retrievedAt.getTime()) || ageMs < 0 || ageMs > maxRateAgeDays * 86_400_000) {
    errors.push(`Price evidence must be current within ${maxRateAgeDays} days.`)
  }

  const workloadChecks = [
    ['hoursPerMonth', 730],
    ['apiDesiredCount', 1],
    ['apiCpu', 256],
    ['apiMemoryMiB', 512],
    ['k1AwsIngestionEnabled', false],
    ['paidInferenceCalls', 0],
    ['targetMonthlyUsd', 110],
    ['budgetThresholdUsd', 125],
    ['budgetActionCount', 0],
  ]
  const workloadProfileMatched = workloadChecks.every(([key, expected]) => profile?.[key] === expected)
  if (!workloadProfileMatched) errors.push('Production workload or notification-only Budget profile drifted.')
  if (!isFiniteNonnegative(profile?.usageUpperBoundMonthlyUsd)) {
    errors.push('Usage upper bound must be a finite nonnegative number.')
  }

  let fixedUnrounded = 0
  const lineItems = []
  const seenKeys = new Set()
  if (!Array.isArray(profile?.recurringResources) || profile.recurringResources.length === 0) {
    errors.push('Recurring resource inventory is empty.')
  } else {
    for (const resource of profile.recurringResources) {
      const key = typeof resource?.key === 'string' ? resource.key : 'invalid-resource'
      if (seenKeys.has(key)) errors.push(`Recurring resource '${key}' is duplicated.`)
      seenKeys.add(key)
      const rate = priceEvidence?.rates?.[resource?.rateKey]
      if (!Number.isFinite(rate) || rate < 0) {
        unpriced.push(key)
        continue
      }
      if (!Number.isFinite(resource?.quantity) || resource.quantity <= 0) {
        errors.push(`Recurring resource '${key}' has an invalid quantity.`)
        continue
      }
      const monthlyUsd = rate * resource.quantity
      fixedUnrounded += monthlyUsd
      lineItems.push({
        key,
        rateKey: resource.rateKey,
        quantity: resource.quantity,
        unitRateUsd: rate,
        monthlyUsd: roundCurrency(monthlyUsd),
      })
    }
  }
  if (unpriced.length > 0) errors.push('One or more recurring resources have no current unit price.')

  const fixedMonthlyUsd = roundCurrency(fixedUnrounded)
  const usageUpperBoundMonthlyUsd = isFiniteNonnegative(profile?.usageUpperBoundMonthlyUsd)
    ? roundCurrency(profile.usageUpperBoundMonthlyUsd)
    : 0
  const estimatedMonthlyUsd = roundCurrency(fixedUnrounded + usageUpperBoundMonthlyUsd)
  if (estimatedMonthlyUsd > 110) errors.push('Production upper estimate exceeds the $110 target.')

  return {
    valid: errors.length === 0,
    errors,
    evidence: {
      schemaVersion: '1.0.0',
      region: profile?.region ?? null,
      pricingRetrievedAt: Number.isFinite(retrievedAt.getTime()) ? retrievedAt.toISOString() : null,
      pricingSources: Array.isArray(priceEvidence?.sources) ? [...priceEvidence.sources] : [],
      hoursPerMonth: profile?.hoursPerMonth ?? null,
      lineItems,
      fixedMonthlyUsd,
      usageUpperBoundMonthlyUsd,
      estimatedMonthlyUsd,
      targetMonthlyUsd: profile?.targetMonthlyUsd ?? null,
      budgetThresholdUsd: profile?.budgetThresholdUsd ?? null,
      budgetActionCount: profile?.budgetActionCount ?? null,
      workloadProfileMatched,
      unpricedRecurringResources: [...new Set(unpriced)].sort(),
    },
  }
}

const parseArgs = (argv) => {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) throw new Error('Expected --profile, --rates or --rates-url, and --output arguments.')
    values[name.slice(2)] = value
  }
  return values
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.profile || (!args.rates && !args['rates-url']) || !args.output) {
    throw new Error('Expected --profile, --rates or --rates-url, and --output arguments.')
  }
  const profile = await readJsonFile(args.profile)
  const rates = args.rates
    ? await readJsonFile(args.rates)
    : await fetch(args['rates-url']).then((response) => {
      if (!response.ok) throw new Error(`Live price evidence request failed with HTTP ${response.status}.`)
      return response.json()
    })
  const result = calculateProductionCost(profile, rates)
  await fs.writeFile(path.resolve(args.output), `${JSON.stringify(result.evidence, null, 2)}\n`, { flag: 'wx' })
  if (!result.valid) {
    for (const error of result.errors) process.stderr.write(`cost-policy: ${error}\n`)
    process.exitCode = 4
  } else {
    process.stdout.write(`PASS production cost estimate $${result.evidence.estimatedMonthlyUsd.toFixed(2)}.\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`cost-policy: ${error instanceof Error ? error.message : 'validation failed'}\n`)
    process.exitCode = 4
  })
}
