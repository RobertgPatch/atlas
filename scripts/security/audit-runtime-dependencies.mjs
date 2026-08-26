import { spawnSync } from 'node:child_process'
import process from 'node:process'

const audit = (workspace, omitDevelopment) => {
  const args = ['audit', '--json', `--workspace=${workspace}`]
  if (omitDevelopment) args.splice(1, 0, '--omit=dev')
  const result = spawnSync('npm', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024,
  })
  const raw = result.stdout?.trim()
  if (!raw) {
    throw new Error(`npm audit produced no JSON for ${workspace}: ${result.stderr?.trim()}`)
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`npm audit returned invalid JSON for ${workspace}`, { cause: error })
  }
}

const findings = (report) => Object.values(report.vulnerabilities ?? {}).map((finding) => ({
  package: finding.name,
  severity: finding.severity,
  direct: Boolean(finding.isDirect),
  nodes: finding.nodes ?? [],
  fixAvailable: Boolean(finding.fixAvailable),
}))

const apiRuntime = findings(audit('api', true))
const webRuntime = findings(audit('web', true))
const allDevelopment = findings(audit('api', false)).filter((finding) =>
  !apiRuntime.some((runtime) => runtime.package === finding.package))
const blocking = apiRuntime.filter((finding) =>
  finding.severity === 'high' || finding.severity === 'critical')

const result = {
  generatedAt: new Date().toISOString(),
  apiRuntime: {
    findingCount: apiRuntime.length,
    highOrCritical: blocking.length,
    findings: apiRuntime,
  },
  webRuntime: {
    findingCount: webRuntime.length,
    findings: webRuntime,
  },
  apiBuildAndTestOnly: {
    findingCount: allDevelopment.length,
    findings: allDevelopment,
  },
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (blocking.length > 0) {
  process.stderr.write('Unapproved high/critical findings remain in the deployable API runtime tree.\n')
  process.exitCode = 1
}
