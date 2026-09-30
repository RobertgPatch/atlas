import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseEligible, requiredJobs, candidateTask, candidateDistribution, originRequestPolicy, waitForService, bootstrapTemplate, liquidityCsvTemplate } from './live-production.mjs';
const target = JSON.parse(readFileSync(new URL('../../infra/aws/live-production-target.json', import.meta.url), 'utf8'));
const sha = 'a'.repeat(40);
const image = `${target.accountId}.dkr.ecr.${target.region}.amazonaws.com/${target.repository}@sha256:${'b'.repeat(64)}`;
test('production runtime image includes compiled shared workspace modules', () => {
  const dockerfile = readFileSync(new URL('../../apps/api/Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /COPY --from=build --chown=node:node \/app\/packages\/types\/dist packages\/types\/dist/);
});
test('CSV storage and price flag use the live API defaults and preserve intentional overrides', () => {
  const storage = { bucket: target.liquidityCsv.bucket, kmsKeyArn: `arn:aws:kms:${target.region}:${target.accountId}:key/test` };
  for (const spec of target.services) for (const value of [undefined, 'true', 'false']) {
    const task = { family: spec.name, containerDefinitions: [{ name: spec.container, environment: value ? [{ name: 'REAL_TIME_EQUITIES_ENABLED', value }] : [] }] };
    const result = candidateTask(task, spec, target, image, [], storage);
    const env = Object.fromEntries(result.containerDefinitions[0].environment.map(item => [item.name, item.value]));
    assert.equal(env.REAL_TIME_EQUITIES_ENABLED, value ?? 'false');
    assert.equal(env.LIQUIDITY_CSV_PARSING_ENABLED, spec.role === 'api' ? 'true' : 'false');
    if (spec.role === 'api') { assert.equal(env.LIQUIDITY_CSV_S3_BUCKET, storage.bucket); assert.equal(env.LIQUIDITY_CSV_S3_REGION, 'us-west-1'); }
    if (value !== 'true') assert.equal(env.MARKET_PRICE_SCHEDULER_ENABLED, 'false');
  }
  const template = liquidityCsvTemplate(target, `arn:aws:iam::${target.accountId}:role/api`);
  const resources = template.Resources;
  assert.equal(resources.CsvBucket.Properties.VersioningConfiguration.Status, 'Enabled');
  assert.equal(resources.CsvBucket.DeletionPolicy, 'Retain');
  assert.deepEqual(resources.CsvAccess.Properties.Roles, ['api']);
  assert.ok(resources.CsvAccess.Properties.PolicyDocument.Statement[0].Resource.endsWith('/liquidity-csv/*'));
  assert.ok(!JSON.stringify(template).includes('bedrock'));
  assert.ok(!JSON.stringify(template).includes('DeleteObject'));
});
test('only the current main push with both completed named jobs is eligible', () => {
  const input = { branch: 'main', sha, remoteSha: sha, run: { headSha: sha, headBranch: 'main', event: 'push',
    status: 'completed', conclusion: 'success', jobs: requiredJobs.map(name => ({ name, status: 'completed', conclusion: 'success' })) } };
  assert.equal(releaseEligible(input), true);
  for (const altered of [{ branch: 'feature' }, { remoteSha: 'c'.repeat(40) },
    { run: { ...input.run, event: 'pull_request' } }, { run: { ...input.run, jobs: input.run.jobs.slice(0, 1) } },
    { run: { ...input.run, jobs: [...input.run.jobs.slice(0, 1), { ...input.run.jobs[1], conclusion: 'skipped' }] } }]) {
    assert.equal(releaseEligible({ ...input, ...altered }), false);
  }
});
test('candidate task preserves split-region K-1, paid limits, roles, and secret references', () => {
  for (const spec of target.services) {
    const task = { family: spec.name, revision: 8, taskDefinitionArn: 'old', status: 'ACTIVE', taskRoleArn: 'task-role', executionRoleArn: 'execution-role',
      cpu: '512', memory: '1024', containerDefinitions: [{ name: spec.container, image: 'old-image',
        command: ['node', spec.role === 'api' ? 'dist/server.js' : 'dist/workers/k1-extraction-worker.js'],
        environment: [{ name: 'K1_S3_REGION', value: 'us-west-2' }, { name: 'K1_BDA_REGION', value: 'us-west-2' },
          { name: 'ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS', value: '62000' }, { name: 'ABUSE_HMAC_KEY_ID', value: 'existing-v1' },
          { name: 'PLAID_ENV', value: 'production' }, { name: 'ABUSE_PLAID_TIMEOUT_MS', value: '10000' }],
        secrets: [{ name: 'DATABASE_URL', valueFrom: 'existing-secret-arn' }, { name: 'PLAID_SECRET', valueFrom: 'retired-secret-arn' }] }] };
    const result = candidateTask(task, spec, target, image, ['10.42.10.0/24']);
    const container = result.containerDefinitions[0];
    const env = Object.fromEntries(container.environment.map(item => [item.name, item.value]));
    assert.equal(env.ATLAS_RUNTIME, 'production');
    assert.equal(env.ATLAS_PROCESS_ROLE, spec.role);
    assert.equal(env.AWS_REGION, 'us-west-1');
    assert.equal(env.K1_S3_REGION, 'us-west-2');
    assert.equal(env.K1_BDA_REGION, 'us-west-2');
    assert.equal(env.ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS, '62000');
    assert.equal(env.ABUSE_HMAC_KEY_ID, 'existing-v1');
    assert.deepEqual(container.secrets, [{ name: 'DATABASE_URL', valueFrom: 'existing-secret-arn' }]);
    assert.equal(env.PLAID_ENV, undefined);
    assert.equal(env.ABUSE_PLAID_TIMEOUT_MS, undefined);
    assert.deepEqual(container.command, task.containerDefinitions[0].command);
    assert.equal(result.revision, undefined);
    assert.equal(result.taskRoleArn, task.taskRoleArn);
    assert.equal(task.containerDefinitions[0].image, 'old-image');
    if (spec.role === 'api') assert.match(container.healthCheck.command[1], /\/internal\/readiness/);
    assert.throws(() => candidateTask(task, spec, target, image.replace('@sha256:', ':tag-'), []));
  }
});
test('CloudFront change binds the live site and preserves WAF, origins and SPA isolation', () => {
  const config = { Aliases: { Items: [target.domain] }, WebACLId: 'existing-waf',
    Origins: { Items: [{ Id: target.apiOriginId, DomainName: `internal-api.${target.region}.elb.amazonaws.com`, VpcOriginConfig: { VpcOriginId: 'private-origin' } },
      { DomainName: `${target.webBucket}.s3.${target.region}.amazonaws.com` }] },
    CustomErrorResponses: { Quantity: 0 }, DefaultCacheBehavior: { FunctionAssociations: { Items: ['existing-spa-function'] } },
    CacheBehaviors: { Items: ['/health', '/v1/*'].map(PathPattern => ({ PathPattern, TargetOriginId: target.apiOriginId, CachePolicyId: 'old' })) } };
  const result = candidateDistribution(config, target, 'generated-viewer-policy');
  assert.deepEqual(result.Origins, config.Origins);
  assert.deepEqual(result.DefaultCacheBehavior, config.DefaultCacheBehavior);
  assert.equal(result.WebACLId, config.WebACLId);
  assert.ok(result.CacheBehaviors.Items.every(item => item.OriginRequestPolicyId === 'generated-viewer-policy' && item.CachePolicyId !== 'old'));
  assert.throws(() => candidateDistribution({ ...config, Aliases: { Items: ['another.example'] } }, target, 'policy'));
  const policy = originRequestPolicy('policy');
  assert.ok(policy.HeadersConfig.Headers.Items.includes('CloudFront-Viewer-Address'));
  assert.equal(policy.HeadersConfig.Headers.Items.length, policy.HeadersConfig.Headers.Quantity);
  assert.ok(policy.HeadersConfig.Headers.Quantity <= 10, 'Must fit the default AWS origin-request header quota');
});
test('ECS wait rejects a rolled-back revision even if the service is stable', async () => {
  const ready = { taskDefinition: 'candidate', desiredCount: 1, runningCount: 1, pendingCount: 0,
    deployments: [{ status: 'PRIMARY', taskDefinition: 'candidate', rolloutState: 'COMPLETED' }] };
  await waitForService(async () => ready, 'candidate', { attempts: 1, pause: async () => {} });
  await assert.rejects(waitForService(async () => ({ ...ready, deployments: [{ ...ready.deployments[0], taskDefinition: 'old' }] }), 'candidate'), /rejected or replaced/);
  await assert.rejects(waitForService(async () => ({ ...ready, runningCount: 0 }), 'candidate', { attempts: 1, pause: async () => {} }), /did not stabilize/);
});
test('bootstrap password is generated only in AWS and granted only to the execution role', () => {
  const template = bootstrapTemplate(target, `arn:aws:iam::${target.accountId}:role/ecs-execution`);
  assert.equal(template.Resources.SuperAdminPassword.Properties.SecretString, undefined);
  assert.equal(template.Resources.SuperAdminPassword.Properties.GenerateSecretString.PasswordLength, 48);
  assert.equal(template.Resources.SuperAdminPassword.DeletionPolicy, 'Retain');
  assert.deepEqual(template.Resources.ExecutionAccess.Properties.PolicyDocument.Statement[0].Resource, { Ref: 'SuperAdminPassword' });
  assert.throws(() => bootstrapTemplate(target, 'arn:aws:iam::999999999999:role/another'));
});
