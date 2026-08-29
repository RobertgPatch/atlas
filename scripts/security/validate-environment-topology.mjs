import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const normalizePath = (value) => value.replaceAll('\\', '/')

const locationOf = (content, token) => {
  const index = content.indexOf(token)
  if (index < 0) return { line: 1, column: 1 }
  const prefix = content.slice(0, index)
  const lines = prefix.split(/\r?\n/)
  return { line: lines.length, column: lines.at(-1).length + 1 }
}

const finding = (file, content, rule, token) => ({
  file,
  ...locationOf(content, token),
  rule,
  token,
})

const operationalDocs = new Set([
  'docs/deployment/environment-strategy.md',
  'docs/deployment/aws-liquidity-production-readiness.md',
  'infra/aws/README.md',
  'infra/aws/manual-liquidity-deployment.md',
  'infra/aws/cost-abuse-response-runbook.md',
])

export function auditEnvironmentTopology(inputFiles) {
  const files = Object.fromEntries(Object.entries(inputFiles).map(([file, content]) => [normalizePath(file), String(content)]))
  const findings = []
  let scripts = {}
  try { scripts = JSON.parse(files['package.json'] ?? '{}').scripts ?? {} } catch {
    findings.push(finding('package.json', files['package.json'] ?? '', 'package-json', 'package.json'))
  }

  const stagingCommands = Object.keys(scripts).filter((name) => name === 'deploy:aws:staging')
  const awsDevelopmentCommands = Object.keys(scripts).filter((name) => name === 'deploy:aws:development')
  for (const name of stagingCommands) findings.push(finding('package.json', files['package.json'], 'staging-command', name))
  for (const name of awsDevelopmentCommands) findings.push(finding('package.json', files['package.json'], 'aws-development-command', name))

  for (const [file, content] of Object.entries(files)) {
    if (/^specs\//.test(file) || /(?:^|\/)fixtures?\//.test(file) || /\.test\.[^.]+$/.test(file) || /\.spec\.[^.]+$/.test(file)) continue
    const basename = path.posix.basename(file)
    if (/^scripts\/deploy-to-aws-staging\.ps1$/i.test(file)) findings.push(finding(file, content, 'staging-entrypoint', basename))
    if (/^scripts\/deploy-to-aws-development\.ps1$/i.test(file)) findings.push(finding(file, content, 'aws-development-entrypoint', basename))
    if (/^infra\/aws\/terraform\/(?:development|staging|terraform)\.tfvars\.example$/i.test(file)) {
      findings.push(finding(file, content, 'nonproduction-terraform-example', basename))
    }
    if (/^infra\/aws\/terraform\/.*\.tf$/i.test(file)) {
      const match = /contains\s*\(\s*\[\s*["']development["']\s*,\s*["']production["']|environment_name[^\n]*(?:development|staging)/i.exec(content)
      if (match) findings.push(finding(file, content, 'terraform-environment-validation', match[0]))
    }
    if (/^\.github\/workflows\/.*\.ya?ml$/i.test(file)) {
      const match = /deploy:aws:(?:staging|development)|deploy-to-aws-(?:staging|development)/i.exec(content)
      if (match) findings.push(finding(file, content, 'ci-nonproduction-target', match[0]))
    }
    if (operationalDocs.has(file)) {
      const match = /validate staging (?:first|before production)|staging\s+(?:parity|prerequisite)|staging[^\n]{0,80}(?:before|then)[^\n]{0,40}production/i.exec(content)
      if (match) findings.push(finding(file, content, 'operational-parity-dependency', match[0]))
    }
  }

  const productionExamples = Object.keys(files).filter((file) => file === 'infra/aws/terraform/production.tfvars.example').length
  const nonProductionExamples = Object.keys(files).filter((file) => /^infra\/aws\/terraform\/(?:development|staging|terraform)\.tfvars\.example$/i.test(file)).length
  const localCommands = Object.keys(scripts).filter((name) => name === 'dev:local').length
  const productionCommands = Object.keys(scripts).filter((name) => name === 'deploy:aws:production').length
  if (localCommands !== 1) findings.push(finding('package.json', files['package.json'] ?? '', 'local-command-cardinality', 'dev:local'))
  if (productionCommands !== 1) findings.push(finding('package.json', files['package.json'] ?? '', 'production-command-cardinality', 'deploy:aws:production'))
  if (productionExamples !== 1) findings.push(finding('infra/aws/terraform/production.tfvars.example', files['infra/aws/terraform/production.tfvars.example'] ?? '', 'production-example-cardinality', 'production.tfvars.example'))

  findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule) || left.token.localeCompare(right.token))
  return {
    valid: findings.length === 0,
    findings,
    summary: {
      localDevelopmentCommands: localCommands,
      productionDeploymentCommands: productionCommands,
      stagingDeploymentCommands: stagingCommands.length,
      awsDevelopmentDeploymentCommands: awsDevelopmentCommands.length,
      productionTerraformExamples: productionExamples,
      nonProductionTerraformExamples: nonProductionExamples,
    },
  }
}

const shouldRead = (file) => file === 'package.json' ||
  /^\.github\/workflows\/.*\.ya?ml$/i.test(file) ||
  /^scripts\/deploy-to-aws-.*\.ps1$/i.test(file) ||
  /^infra\/aws\/terraform\/.*(?:\.tf|\.tfvars\.example)$/i.test(file) ||
  operationalDocs.has(file)

function main() {
  const repoRoot = process.cwd()
  const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' })
    .split(/\r?\n/).map(normalizePath).filter(Boolean).filter(shouldRead)
    .filter((name) => fs.existsSync(path.join(repoRoot, name)))
  const files = Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(repoRoot, name), 'utf8')]))
  const result = auditEnvironmentTopology(files)
  if (!result.valid) {
    for (const item of result.findings) process.stderr.write(`${item.file}:${item.line}:${item.column} [${item.rule}] ${item.token}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`PASS environment topology: ${result.summary.localDevelopmentCommands} local, ${result.summary.productionDeploymentCommands} production, 0 staging, 0 AWS development.\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
