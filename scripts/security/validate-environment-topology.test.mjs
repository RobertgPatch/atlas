import assert from 'node:assert/strict'
import test from 'node:test'

import { auditEnvironmentTopology } from './validate-environment-topology.mjs'

const validFiles = {
  'package.json': JSON.stringify({ scripts: { 'dev:local': 'powershell scripts/dev-local.ps1', 'deploy:aws:production': 'powershell scripts/deploy-to-aws-production.ps1' } }),
  'scripts/deploy-to-aws-production.ps1': "[ValidateSet('Plan','Bootstrap','Prepare','Apply','Rollback')]",
  'infra/aws/terraform/production.tfvars.example': 'environment_name = "production"',
  'infra/aws/terraform/variables.tf': 'condition = var.environment_name == "production"',
  'infra/aws/terraform/main.tf': 'TRUSTED_PROXY_CIDRS = join(",", var.private_subnet_cidrs)',
  'infra/aws/terraform/modules/edge/main.tf': `
    resource "aws_cloudfront_origin_request_policy" "api" { headers_config { headers { items = ["CloudFront-Viewer-Address"] } } }
    resource "aws_cloudfront_function" "static_spa_rewrite" {}
    resource "aws_cloudfront_distribution" "this" {
      default_cache_behavior { function_association {} }
      ordered_cache_behavior { path_pattern = "/health" }
      ordered_cache_behavior { path_pattern = "/v1/*" }
    }
  `,
  'docs/deployment/environment-strategy.md': 'Development runs locally. AWS has one production target.',
  'specs/027-historical/spec.md': 'Historical staging text is excluded.',
  'apps/api/src/config.ts': "const legacyPhysicalName = 'PROJECT_JACKSON_SCHEDULER_TOKEN'",
}

test('accepts exactly local development and one AWS production target with historical/legacy exclusions', () => {
  const result = auditEnvironmentTopology(validFiles)
  assert.equal(result.valid, true, JSON.stringify(result.findings))
  assert.deepEqual(result.summary, {
    localDevelopmentCommands: 1,
    productionDeploymentCommands: 1,
    stagingDeploymentCommands: 0,
    awsDevelopmentDeploymentCommands: 0,
    productionTerraformExamples: 1,
    nonProductionTerraformExamples: 0,
  })
})

test('reports deterministic file, line, column, rule, and token diagnostics for every active drift class', () => {
  const files = {
    ...validFiles,
    'package.json': JSON.stringify({ scripts: {
      'dev:local': 'powershell scripts/dev-local.ps1',
      'deploy:aws:production': 'powershell scripts/deploy-to-aws-production.ps1',
      'deploy:aws:staging': 'powershell scripts/deploy-to-aws-staging.ps1',
      'deploy:aws:development': 'powershell scripts/deploy-to-aws-development.ps1',
    } }, null, 2),
    'scripts/deploy-to-aws-staging.ps1': 'terraform apply staging.tfvars',
    'infra/aws/terraform/development.tfvars.example': 'environment_name = "development"',
    'infra/aws/terraform/terraform.tfvars.example': 'Use staging or production.',
    'infra/aws/terraform/modules/example/variables.tf': 'condition = contains(["development", "production"], var.environment_name)',
    '.github/workflows/deploy.yml': 'run: npm run deploy:aws:staging',
    'infra/aws/README.md': 'Validate staging before production.',
  }
  const first = auditEnvironmentTopology(files)
  const second = auditEnvironmentTopology(files)
  assert.equal(first.valid, false)
  assert.deepEqual(first.findings, second.findings)
  for (const rule of ['staging-command', 'aws-development-command', 'staging-entrypoint', 'nonproduction-terraform-example', 'terraform-environment-validation', 'ci-nonproduction-target', 'operational-parity-dependency']) {
    assert.ok(first.findings.some((finding) => finding.rule === rule), `missing ${rule}`)
  }
  assert.deepEqual(first.findings[0], {
    file: '.github/workflows/deploy.yml',
    line: 1,
    column: 14,
    rule: 'ci-nonproduction-target',
    token: 'deploy:aws:staging',
  })
})

test('rejects missing generated source, broad proxy trust, internal forwarding, and distribution SPA errors', () => {
  const files = {
    ...validFiles,
    'infra/aws/terraform/main.tf': 'TRUSTED_PROXY_CIDRS = var.vpc_cidr',
    'infra/aws/terraform/modules/edge/main.tf': `
      resource "aws_cloudfront_distribution" "this" {
        ordered_cache_behavior { path_pattern = "/internal/*" }
        custom_error_response { error_code = 404 response_code = 200 }
      }
    `,
  }
  const result = auditEnvironmentTopology(files)
  assert.equal(result.valid, false)
  for (const rule of [
    'generated-viewer-source-policy',
    'required-api-cache-behavior',
    'distribution-wide-spa-error',
    'static-only-spa-rewrite',
    'internal-edge-forwarding',
    'narrowed-trusted-proxy-path',
  ]) {
    assert.ok(result.findings.some((item) => item.rule === rule), `missing ${rule}`)
  }
})
