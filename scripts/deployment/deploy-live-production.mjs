import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { releaseEligible, candidateTask, candidateDistribution, originRequestPolicy, waitForService, bootstrapTemplate, liquidityCsvTemplate } from './live-production.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let target = JSON.parse(readFileSync(resolve(root, 'infra/aws/live-production-target.json'), 'utf8'));
const options = process.argv.slice(2);
assert.ok(options.every(item => item === '--plan'), 'Supported option: --plan (read-only live inspection). Omit to deploy.');
const planOnly = options.includes('--plan');
const profile = process.env.ATLAS_DEPLOY_AWS_PROFILE ?? target.awsProfile;
const awsCli = process.platform === 'win32' ? 'aws.exe' : 'aws';
const pause = ms => new Promise(done => setTimeout(done, ms));
const hash = value => createHash('sha256').update(value).digest('hex');
function command(executable, args, { cwd = root, input, inherit = false, env = process.env } = {}) {
  try {
    return execFileSync(executable, args, { cwd, input, env, encoding: 'utf8', windowsHide: true,
      maxBuffer: 20 * 1024 * 1024, stdio: inherit ? ['pipe', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'] })?.trim() ?? '';
  } catch {
    throw new Error(`${executable} ${args.slice(0, 2).join(' ')} failed. No command output containing configuration or credentials was logged.`);
  }
}
function aws(...args) {
  const value = command(awsCli, [...args, '--profile', profile, '--region', target.region, '--output', 'json', '--no-cli-pager']);
  return value ? JSON.parse(value) : {};
}
const gh = args => JSON.parse(command('gh', args));
const git = (...args) => command('git', args);
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
function eligibility() {
  const branch = git('branch', '--show-current');
  const sha = git('rev-parse', 'HEAD');
  const remoteSha = git('ls-remote', 'https://github.com/RobertgPatch/atlas.git', 'refs/heads/main').split(/\s+/)[0];
  const runs = gh(['run', 'list', '--repo', 'RobertgPatch/atlas', '--workflow', 'security-ci.yml', '--branch', 'main',
    '--commit', sha, '--event', 'push', '--limit', '20', '--json', 'databaseId,headSha,headBranch,event,status,conclusion']);
  for (const run of runs.filter(item => item.conclusion === 'success')) {
    run.jobs = gh(['run', 'view', String(run.databaseId), '--repo', 'RobertgPatch/atlas', '--json', 'jobs']).jobs;
    if (releaseEligible({ branch, sha, remoteSha, run })) return { sha, runId: run.databaseId };
  }
  throw new Error('Deploy from current main after Application security gates and Terraform security gates pass for its exact push commit.');
}
function describeServices() {
  const response = aws('ecs', 'describe-services', '--cluster', target.cluster, '--services', ...target.services.map(item => item.name));
  assert.equal(response.failures?.length ?? 0, 0, 'Live ECS services not found');
  return response.services;
}
function inspect() {
  assert.equal(aws('sts', 'get-caller-identity').Account, target.accountId, 'AWS login points to a different account');
  const edge = aws('cloudfront', 'get-distribution-config', '--id', target.distributionId);
  candidateDistribution(edge.DistributionConfig, target, 'inspection-only');
  const services = describeServices();
  const definitions = Object.fromEntries(services.map(service => [service.serviceName,
    aws('ecs', 'describe-task-definition', '--task-definition', service.taskDefinition).taskDefinition]));
  const loadBalancer = aws('elbv2', 'describe-load-balancers', '--names', target.services[0].name).LoadBalancers[0];
  assert.equal(loadBalancer.Scheme, 'internal', 'API load balancer must be private');
  const subnets = aws('ec2', 'describe-subnets', '--subnet-ids', ...loadBalancer.AvailabilityZones.map(zone => zone.SubnetId)).Subnets;
  const proxyCidrs = subnets.map(subnet => subnet.CidrBlock).sort();
  const targetGroupArn = services.find(service => service.serviceName === target.services[0].name).loadBalancers[0].targetGroupArn;
  const targetGroup = aws('elbv2', 'describe-target-groups', '--target-group-arns', targetGroupArn).TargetGroups[0];
  assert.ok(['/health', '/internal/readiness'].includes(targetGroup.HealthCheckPath), 'Unexpected load-balancer health path');
  const database = aws('rds', 'describe-db-instances', '--db-instance-identifier', target.database).DBInstances[0];
  assert.equal(database.DBInstanceStatus, 'available', 'Live database is unavailable');
  assert.ok(database.StorageEncrypted && !database.PubliclyAccessible, 'Unexpected database target');
  const repository = aws('ecr', 'describe-repositories', '--repository-names', target.repository).repositories[0];
  assert.equal(repository.registryId, target.accountId);
  for (const spec of target.services) {
    const service = services.find(item => item.serviceName === spec.name);
    assert.ok(service && service.runningCount === service.desiredCount && service.deployments.length === 1, 'A previous deployment is still in progress');
  }
  return { edge, services, definitions, proxyCidrs, targetGroup, repository: repository.repositoryUri };
}
async function until(label, read, ready, attempts = 80) {
  for (let count = 0; count < attempts; count++) {
    const value = read();
    if (ready(value)) return value;
    if (count % 4 === 0) console.log(`Waiting for ${label}...`);
    await pause(15000);
  }
  throw new Error(`${label} timed out`);
}
async function checkTask(spec, taskDefinition, service, releaseDirectory, candidate) {
  const overrides = resolve(releaseDirectory, `check-${spec.role}.json`);
  save(overrides, { containerOverrides: [{ name: spec.container, command: ['node', 'dist/scripts/check-production-runtime.js'] }] });
  const network = resolve(releaseDirectory, `network-${spec.role}.json`);
  save(network, service.networkConfiguration);
  const response = aws('ecs', 'run-task', '--cluster', target.cluster, '--launch-type', 'FARGATE',
    '--task-definition', taskDefinition, '--network-configuration', `file://${network}`, '--overrides', `file://${overrides}`);
  assert.equal(response.failures?.length ?? 0, 0, 'Runtime verification task could not start');
  const taskArn = response.tasks[0]?.taskArn;
  assert.ok(taskArn);
  let task;
  try {
    task = await until(`${spec.role} runtime/database check`,
      () => aws('ecs', 'describe-tasks', '--cluster', target.cluster, '--tasks', taskArn).tasks[0],
      item => item.lastStatus === 'STOPPED', 40);
  } catch (error) {
    aws('ecs', 'stop-task', '--cluster', target.cluster, '--task', taskArn, '--reason', 'Deployment runtime check timed out');
    throw error;
  }
  const logOptions = candidate.containerDefinitions.find(item => item.name === spec.container).logConfiguration.options;
  const stream = `${logOptions['awslogs-stream-prefix']}/${spec.container}/${taskArn.split('/').at(-1)}`;
  let report;
  for (let count = 0; count < 6 && !report; count++) {
    try {
      const events = aws('logs', 'get-log-events', '--log-group-name', logOptions['awslogs-group'], '--log-stream-name', stream, '--start-from-head').events;
      for (const event of events) {
        try { const value = JSON.parse(event.message); if (['ready', 'failed'].includes(value.status)) report = value; } catch { /* ignore unrelated log lines */ }
      }
    } catch { /* log stream may still be propagating */ }
    if (!report) await pause(5000);
  }
  save(resolve(releaseDirectory, `runtime-${spec.role}.json`), { taskArn, report,
    exitCodes: task.containers.map(item => ({ name: item.name, exitCode: item.exitCode })) });
  assert.equal(task.containers.find(item => item.name === spec.container)?.exitCode, 0,
    `${spec.role} runtime/database check failed: ${report?.setting ?? report?.identity ?? report?.code ?? taskArn.split('/').at(-1)}`);
  assert.equal(report?.status, 'ready', 'Runtime check did not publish readiness evidence');
  return report;
}
async function invalidate() {
  const response = aws('cloudfront', 'create-invalidation', '--distribution-id', target.distributionId, '--paths', '/*');
  await until('CloudFront invalidation', () => aws('cloudfront', 'get-invalidation', '--distribution-id', target.distributionId,
    '--id', response.Invalidation.Id).Invalidation, item => item.Status === 'Completed');
}
async function smoke(sha) {
  const request = (path, options = {}) => fetch(`https://${target.domain}${path}`, { ...options, signal: AbortSignal.timeout(20000) });
  const home = await request('/');
  assert.equal(home.status, 200, 'Web homepage failed');
  const html = await home.text();
  const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map(match => match[1]);
  assert.ok(assets.length, 'Built web assets missing from homepage');
  for (const asset of assets) assert.equal((await request(asset)).status, 200, 'Web asset failed');
  const health = await request(`/health?release=${sha}`);
  assert.equal(health.status, 200, 'API health failed');
  assert.match(health.headers.get('content-type') ?? '', /json/, 'API health was rewritten to HTML');
  const anonymous = await request('/v1/auth/session');
  assert.equal(anonymous.status, 401, 'Anonymous API session must be rejected');
  assert.match(anonymous.headers.get('content-type') ?? '', /json/, 'Anonymous API error was rewritten to HTML');
  // A single nonexistent-account login detects the prior DATABASE_URL rotation
  // failure without real passwords, a session, or a human MFA prompt.
  const login = await request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `release-${sha.slice(0, 12)}@example.invalid`, password: randomUUID() }) });
  assert.equal(login.status, 401, 'Database-backed login check failed');
  const release = await request(`/release.json?release=${sha}`);
  assert.equal(release.status, 200);
  assert.equal((await release.json()).commit, sha, 'CloudFront is not serving the released main commit');
}

async function main() {
  const source = planOnly ? { sha: git('rev-parse', 'HEAD') } : eligibility();
  if (!planOnly) target = JSON.parse(git('show', `${source.sha}:infra/aws/live-production-target.json`));
  const live = inspect();
  console.log(JSON.stringify({ mode: planOnly ? 'plan' : 'deploy', ...source, region: target.region, site: target.domain,
    services: live.services.map(service => ({ name: service.serviceName, task: service.taskDefinition, desired: service.desiredCount })),
    proxyCidrs: live.proxyCidrs, dataMigrationBetweenRegions: false }, null, 2));
  if (planOnly) return;
  const releaseDirectory = resolve(root, '.artifacts/live-production-releases', `${new Date().toISOString().replace(/[:.]/g, '-')}-${source.sha.slice(0, 12)}`);
  mkdirSync(releaseDirectory, { recursive: true });
  const checkpoint = { source, target, services: live.services.map(service => ({ name: service.serviceName,
    task: service.taskDefinition, desired: service.desiredCount, deploymentConfiguration: service.deploymentConfiguration })),
    edge: live.edge, targetGroup: live.targetGroup, candidateTasks: {}, updatedServices: [], webActivated: false };
  const checkpointPath = resolve(releaseDirectory, 'checkpoint.json');
  const record = () => save(checkpointPath, checkpoint);
  record();

  // Build the approved commit itself. Local edits/untracked files never enter
  // the release and do not require a separate clean-worktree approval.
  const archive = resolve(releaseDirectory, 'source.tar');
  const buildRoot = resolve(releaseDirectory, 'source');
  mkdirSync(buildRoot);
  git('archive', '--format=tar', `--output=${archive}`, source.sha);
  command('tar', ['-xf', archive, '-C', buildRoot]);
  console.log('Building API image and web assets from the approved main commit...');
  const imageTag = `${live.repository}:${source.sha}`;
  command('docker', ['build', '--platform', 'linux/amd64', '-f', 'apps/api/Dockerfile',
    '--label', `org.opencontainers.image.revision=${source.sha}`, '-t', imageTag, '.'], { cwd: buildRoot, inherit: true });
  const web = resolve(releaseDirectory, 'web');
  command('docker', ['build', '--platform', 'linux/amd64', '-f', 'apps/api/Dockerfile', '--target', 'web-artifact',
    '--output', `type=local,dest=${web}`, '.'], { cwd: buildRoot, inherit: true });
  save(resolve(web, 'release.json'), { commit: source.sha });
  const loginPassword = command(awsCli, ['ecr', 'get-login-password', '--profile', profile, '--region', target.region]);
  command('docker', ['login', '--username', 'AWS', '--password-stdin', live.repository.split('/')[0]], { input: loginPassword });
  command('docker', ['push', imageTag], { inherit: true });
  const digest = aws('ecr', 'describe-images', '--repository-name', target.repository, '--image-ids', `imageTag=${source.sha}`).imageDetails[0].imageDigest;
  const image = `${live.repository}@${digest}`;
  checkpoint.image = image;
  record();

  console.log('Provisioning the dedicated admin bootstrap secret in Secrets Manager...');
  const bootstrapFile = resolve(releaseDirectory, 'bootstrap.json');
  save(bootstrapFile, bootstrapTemplate(target, live.definitions[target.services[0].name].executionRoleArn));
  command(awsCli, ['cloudformation', 'deploy', '--profile', profile, '--region', target.region,
    '--stack-name', target.bootstrapStack, '--template-file', bootstrapFile, '--capabilities', 'CAPABILITY_NAMED_IAM',
    '--no-fail-on-empty-changeset'], { inherit: true });
  const bootstrap = aws('cloudformation', 'describe-stacks', '--stack-name', target.bootstrapStack).Stacks[0];
  const superAdminSecretArn = bootstrap.Outputs.find(item => item.OutputKey === 'SecretArn')?.OutputValue;
  assert.ok(superAdminSecretArn?.startsWith(`arn:aws:secretsmanager:${target.region}:${target.accountId}:secret:${target.superAdminSecretName}-`));
  const runtimeReports = [];

  const csvFile = resolve(releaseDirectory, 'liquidity-csv.json');
  save(csvFile, liquidityCsvTemplate(target, live.definitions[target.services[0].name].taskRoleArn));
  command(awsCli, ['cloudformation', 'deploy', '--profile', profile, '--region', target.region,
    '--stack-name', target.liquidityCsv.stack, '--template-file', csvFile, '--capabilities', 'CAPABILITY_NAMED_IAM',
    '--no-fail-on-empty-changeset'], { inherit: true });
  const csvOutputs = aws('cloudformation', 'describe-stacks', '--stack-name', target.liquidityCsv.stack).Stacks[0].Outputs;
  const csvStorage = { bucket: csvOutputs.find(item => item.OutputKey === 'Bucket')?.OutputValue,
    kmsKeyArn: csvOutputs.find(item => item.OutputKey === 'KmsKeyArn')?.OutputValue };
  assert.equal(csvStorage.bucket, target.liquidityCsv.bucket);
  assert.ok(csvStorage.kmsKeyArn?.startsWith(`arn:aws:kms:${target.region}:${target.accountId}:key/`));

  for (const spec of target.services) {
    const task = candidateTask(live.definitions[spec.name], spec, target, image, live.proxyCidrs, csvStorage);
    if (spec.role === 'api') {
      const container = task.containerDefinitions.find(item => item.name === spec.container);
      container.secrets = [...(container.secrets ?? []).filter(item => item.name !== 'SUPER_ADMIN_PASSWORD'),
        { name: 'SUPER_ADMIN_PASSWORD', valueFrom: superAdminSecretArn }];
    }
    const taskFile = resolve(releaseDirectory, `task-${spec.role}.json`);
    save(taskFile, task);
    const registered = aws('ecs', 'register-task-definition', '--cli-input-json', `file://${taskFile}`).taskDefinition.taskDefinitionArn;
    checkpoint.candidateTasks[spec.name] = registered;
    record();
    runtimeReports.push(await checkTask(spec, registered, live.services.find(item => item.serviceName === spec.name), releaseDirectory, task));
  }
  assert.equal(eligibility().sha, source.sha, 'Main changed during preparation; rerun to release the new commit');
  console.log('Runtime checks passed. Saving web and database rollback checkpoints...');
  const backup = resolve(releaseDirectory, 'previous-web');
  checkpoint.previousIndexETag = aws('s3api', 'head-object', '--bucket', target.webBucket, '--key', 'index.html').ETag;
  aws('s3', 'sync', `s3://${target.webBucket}`, backup, '--only-show-errors');
  assert.equal(aws('s3api', 'head-object', '--bucket', target.webBucket, '--key', 'index.html').ETag,
    checkpoint.previousIndexETag, 'Web release changed during backup');
  const migrations = readdirSync(resolve(buildRoot, 'apps/api/src/infra/db/migrations')).filter(name => name.endsWith('.sql'));
  checkpoint.pendingMigrations = migrations.filter(name => runtimeReports.some(report => !report.migrations.includes(name)));
  if (checkpoint.pendingMigrations.length) {
    checkpoint.snapshot = `release-${source.sha.slice(0, 12)}-${Date.now()}`;
    aws('rds', 'create-db-snapshot', '--db-instance-identifier', target.database, '--db-snapshot-identifier', checkpoint.snapshot);
    record();
    await until('database snapshot', () => aws('rds', 'describe-db-snapshots', '--db-snapshot-identifier', checkpoint.snapshot).DBSnapshots[0], item => item.Status === 'available', 120);
  }
  assert.equal(eligibility().sha, source.sha, 'Main changed before activation; rerun to release the new commit');

  try {
    console.log('Updating API forwarding for the required generated CloudFront viewer address...');
    const policies = aws('cloudfront', 'list-origin-request-policies', '--type', 'custom').OriginRequestPolicyList.Items ?? [];
    const apiTask = live.definitions[target.services[0].name].containerDefinitions.find(item => item.name === target.services[0].container);
    const cookie = apiTask.environment?.find(item => item.name === 'SESSION_COOKIE_NAME')?.value ?? 'atlas_session';
    const policy = originRequestPolicy(target.originRequestPolicyName, cookie);
    const existing = policies.find(item => item.OriginRequestPolicy.OriginRequestPolicyConfig.Name === policy.Name)?.OriginRequestPolicy;
    let policyId = existing?.Id;
    if (existing) {
      // A shared policy is never overwritten as part of an application release.
      const normalize = config => ({ headers: [...config.HeadersConfig.Headers.Items].sort(),
        cookies: [...config.CookiesConfig.Cookies.Items].sort(), headerMode: config.HeadersConfig.HeaderBehavior,
        cookieMode: config.CookiesConfig.CookieBehavior, queryMode: config.QueryStringsConfig.QueryStringBehavior });
      assert.deepEqual(normalize(existing.OriginRequestPolicyConfig), normalize(policy), 'Existing origin request policy differs from the release contract');
    } else {
      const policyFile = resolve(releaseDirectory, 'origin-policy.json');
      save(policyFile, policy);
      policyId = aws('cloudfront', 'create-origin-request-policy', '--origin-request-policy-config', `file://${policyFile}`).OriginRequestPolicy.Id;
    }
    const edge = aws('cloudfront', 'get-distribution-config', '--id', target.distributionId);
    assert.equal(edge.ETag, live.edge.ETag, 'CloudFront changed during preparation');
    const config = candidateDistribution(edge.DistributionConfig, target, policyId);
    checkpoint.candidateEdgeHash = hash(JSON.stringify(config));
    const edgeFile = resolve(releaseDirectory, 'edge.json');
    save(edgeFile, config);
    aws('cloudfront', 'update-distribution', '--id', target.distributionId, '--if-match', edge.ETag, '--distribution-config', `file://${edgeFile}`);
    checkpoint.edgeUpdated = true;
    record();
    await until('CloudFront deployment', () => aws('cloudfront', 'get-distribution', '--id', target.distributionId).Distribution, item => item.Status === 'Deployed');

    // This private endpoint exists in the currently deployed API as well as
    // the candidate, and does not require a public CloudFront viewer identity.
    aws('elbv2', 'modify-target-group', '--target-group-arn', live.targetGroup.TargetGroupArn, '--health-check-path', '/internal/readiness');
    await until('database-aware ALB readiness', () => aws('elbv2', 'describe-target-health', '--target-group-arn', live.targetGroup.TargetGroupArn).TargetHealthDescriptions,
      items => items.length > 0 && items.every(item => item.TargetHealth.State === 'healthy'));

    for (const spec of target.services) {
      console.log(`Releasing ${spec.name}...`);
      const current = describeServices().find(item => item.serviceName === spec.name);
      assert.equal(current.taskDefinition, live.services.find(item => item.serviceName === spec.name).taskDefinition, 'ECS service changed during preparation');
      // Record intent before the request so a timeout after an accepted update
      // still triggers restoration of the captured service revision.
      checkpoint.updatedServices.push(spec.name);
      record();
      aws('ecs', 'update-service', '--cluster', target.cluster, '--service', spec.name,
        '--task-definition', checkpoint.candidateTasks[spec.name], '--deployment-configuration',
        'deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100');
      await waitForService(() => describeServices().find(item => item.serviceName === spec.name), checkpoint.candidateTasks[spec.name]);
      const tasks = aws('ecs', 'list-tasks', '--cluster', target.cluster, '--service-name', spec.name, '--desired-status', 'RUNNING').taskArns;
      if (current.desiredCount > 0) {
        assert.ok(tasks.length, 'No running candidate tasks');
        const running = aws('ecs', 'describe-tasks', '--cluster', target.cluster, '--tasks', ...tasks).tasks;
        assert.ok(running.every(task => task.taskDefinitionArn === checkpoint.candidateTasks[spec.name]
          && task.containers.find(item => item.name === spec.container)?.imageDigest === digest), 'Running image differs from the released digest');
      }
    }
    console.log('Publishing web assets and verifying the public site...');
    checkpoint.webUploaded = true;
    record();
    aws('s3', 'sync', web, `s3://${target.webBucket}`, '--exclude', 'index.html', '--only-show-errors');
    // Old hashed assets stay available to existing tabs and for rollback.
    checkpoint.webActivated = true;
    record();
    const index = aws('s3api', 'put-object', '--bucket', target.webBucket, '--key', 'index.html', '--body', resolve(web, 'index.html'),
      '--content-type', 'text/html', '--cache-control', 'no-cache', '--if-match', checkpoint.previousIndexETag);
    checkpoint.candidateIndexETag = index.ETag;
    record();
    await invalidate();
    await smoke(source.sha);
    checkpoint.outcome = 'deployed';
    record();
    console.log(`Deployed main ${source.sha} to https://${target.domain} in ${target.region}. Checkpoint: ${releaseDirectory}`);
  } catch (error) {
    console.error(`Release failed: ${error.message}. Restoring prior application revisions...`);
    const failures = [];
    for (const name of checkpoint.updatedServices.toReversed()) {
      try {
        const previous = checkpoint.services.find(item => item.name === name);
        const current = describeServices().find(item => item.serviceName === name);
        assert.ok([checkpoint.candidateTasks[name], previous.task].includes(current.taskDefinition), 'Concurrent ECS release detected');
        aws('ecs', 'update-service', '--cluster', target.cluster, '--service', name, '--task-definition', previous.task);
        await waitForService(() => describeServices().find(item => item.serviceName === name), previous.task);
      } catch { failures.push(name); }
    }
    if (checkpoint.webUploaded) {
      try {
        const currentIndex = aws('s3api', 'head-object', '--bucket', target.webBucket, '--key', 'index.html').ETag;
        assert.ok([checkpoint.previousIndexETag, checkpoint.candidateIndexETag].includes(currentIndex), 'Concurrent web release detected');
        if (checkpoint.candidateIndexETag) {
          aws('s3api', 'put-object', '--bucket', target.webBucket, '--key', 'index.html', '--body', resolve(backup, 'index.html'),
            '--content-type', 'text/html', '--cache-control', 'no-cache', '--if-match', checkpoint.candidateIndexETag);
        }
        // Restore non-hashed public files as well; never remove assets.
        if (!existsSync(resolve(backup, 'release.json'))) {
          save(resolve(backup, 'release.json'), { commit: null, status: 'application-rolled-back' });
        }
        aws('s3', 'sync', backup, `s3://${target.webBucket}`, '--exclude', 'index.html', '--only-show-errors');
        await invalidate();
      } catch { failures.push('web'); }
    }
    // Generated viewer forwarding is compatible with both old and new API
    // revisions, so retain it on rollback instead of racing an edge update.
    checkpoint.outcome = failures.length ? 'rollback-incomplete' : 'application-rolled-back';
    checkpoint.rollbackFailures = failures;
    record();
    throw new Error(`${error.message}. ${checkpoint.outcome}; database migrations are not rewound. Snapshot: ${checkpoint.snapshot}. Checkpoint: ${releaseDirectory}`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
