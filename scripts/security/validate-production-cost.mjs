import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100
const isFiniteNonnegative = (value) => Number.isFinite(value) && value >= 0

const sortedUnique = (values) => [...new Set(values)].sort()

async function terraformFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(root, entry.name)
    if (entry.isDirectory()) return terraformFiles(resolved)
    return entry.isFile() && entry.name.endsWith('.tf') ? [resolved] : []
  }))
  return nested.flat()
}

/** Derive reviewed cost/security components from Terraform declarations. */
export async function deriveTerraformCostInventory(terraformRoot) {
  const files = await terraformFiles(path.resolve(terraformRoot))
  const sources = await Promise.all(files.map(async (file) => ({
    file,
    text: await fs.readFile(file, 'utf8'),
  })))
  const joined = sources.map((source) => source.text).join('\n')
  const resources = [...joined.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"\s*{/g)]
    .map((match) => ({ type: match[1], name: match[2] }))
  const wafRuleNames = sortedUnique([
    ...joined.matchAll(/name\s*=\s*"(AWSManagedRules[^"]+|api_general_per_ip|api_general_global|auth_per_ip|auth_global|paid_admission_per_ip|paid_admission_global_emergency)"/g),
  ].map((match) => match[1]))
  const alarmResourceFamilies = sortedUnique(resources
    .filter((resource) => resource.type === 'aws_cloudwatch_metric_alarm')
    .map((resource) => resource.name))
  const spaFunctions = sortedUnique(resources
    .filter((resource) => resource.type === 'aws_cloudfront_function')
    .map((resource) => resource.name))
  const s3ProtectionTypes = new Set([
    'aws_s3_bucket_lifecycle_configuration',
    'aws_s3_bucket_policy',
    'aws_s3_bucket_public_access_block',
    'aws_s3_bucket_server_side_encryption_configuration',
    'aws_s3_bucket_versioning',
  ])
  const s3ProtectionResources = sortedUnique(resources
    .filter((resource) => s3ProtectionTypes.has(resource.type))
    .map((resource) => `${resource.type}.${resource.name}`))
  const customMetricNamespaces = sortedUnique([
    ...joined.matchAll(/ProjectJackson\/[A-Za-z0-9_-]+/g),
  ].map((match) => match[0]))
  const prohibitedControls = sortedUnique([
    ...(joined.match(/AWSManagedRulesBotControlRuleSet/gi) ?? []).map(() => 'bot-control'),
    ...(joined.match(/resource\s+"aws_(?:elasticache|memorydb)[^"]*"/gi) ?? []).map(() => 'redis-cache'),
    ...(joined.match(/\bcaptcha\s*{/gi) ?? []).map(() => 'captcha'),
    ...(joined.match(/\bchallenge\s*{/gi) ?? []).map(() => 'challenge'),
  ])
  return {
    wafRuleNames,
    alarmResourceFamilies,
    wafLogConfigurationCount: resources.filter(
      (resource) => resource.type === 'aws_wafv2_web_acl_logging_configuration',
    ).length,
    customMetricNamespaces,
    spaFunctions,
    s3ProtectionResources,
    prohibitedControls,
  }
}

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
  const terraformInventory = options.terraformInventory
  if (!terraformInventory) {
    errors.push('Terraform-derived cost inventory is required.')
  } else {
    if (terraformInventory.prohibitedControls?.length > 0) {
      errors.push(`Prohibited cost-amplifying controls detected: ${terraformInventory.prohibitedControls.join(', ')}.`)
    }
    if (JSON.stringify(terraformInventory) !== JSON.stringify(profile?.terraformInventory)) {
      errors.push('Terraform WAF/alarm/metric-log/SPA/S3 inventory drifted from the reviewed profile.')
    }
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
  if (!args['terraform-root']) {
    throw new Error('Expected --terraform-root so resource counts are derived from source.')
  }
  const terraformInventory = await deriveTerraformCostInventory(args['terraform-root'])
  const result = calculateProductionCost(profile, rates, { terraformInventory })
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
