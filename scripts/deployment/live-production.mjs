import assert from 'node:assert/strict';

export const requiredJobs = ['Application security gates', 'Terraform security gates'];
export function bootstrapTemplate(target, executionRoleArn) {
  assert.ok(executionRoleArn.startsWith(`arn:aws:iam::${target.accountId}:role/`));
  return { AWSTemplateFormatVersion: '2010-09-09', Resources: {
    SuperAdminPassword: { Type: 'AWS::SecretsManager::Secret', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
      Properties: { Name: target.superAdminSecretName, Description: 'Initial Robert super-admin password; existing user passwords are not reset by secret creation',
        GenerateSecretString: { PasswordLength: 48, ExcludePunctuation: true } } },
    ExecutionAccess: { Type: 'AWS::IAM::Policy', Properties: {
      PolicyName: 'project-jackson-production-super-admin-bootstrap', Roles: [executionRoleArn.split('/').at(-1)],
      PolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['secretsmanager:GetSecretValue'], Resource: { Ref: 'SuperAdminPassword' } }] } } }
  }, Outputs: { SecretArn: { Value: { Ref: 'SuperAdminPassword' } } } };
}
export function releaseEligible({ branch, sha, remoteSha, run }) {
  return branch === 'main' && /^[a-f0-9]{40}$/.test(sha) && sha === remoteSha
    && run?.headSha === sha && run.headBranch === 'main' && run.event === 'push'
    && run.status === 'completed' && run.conclusion === 'success'
    && requiredJobs.every(name => {
      const matches = run.jobs?.filter(job => job.name === name) ?? [];
      return matches.length === 1 && matches[0].status === 'completed' && matches[0].conclusion === 'success';
    });
}

export function candidateTask(task, service, target, image, proxyCidrs) {
  assert.equal(task.family, service.name, 'Unexpected live task family');
  assert.match(image, new RegExp(`^${target.accountId}\\.dkr\\.ecr\\.${target.region}\\.amazonaws\\.com/${target.repository}@sha256:[a-f0-9]{64}$`));
  const fields = ['family', 'taskRoleArn', 'executionRoleArn', 'networkMode', 'containerDefinitions', 'volumes',
    'placementConstraints', 'requiresCompatibilities', 'cpu', 'memory', 'pidMode', 'ipcMode', 'proxyConfiguration',
    'inferenceAccelerators', 'ephemeralStorage', 'runtimePlatform', 'enableFaultInjection'];
  const result = structuredClone(Object.fromEntries(fields.filter(key => task[key] !== undefined).map(key => [key, task[key]])));
  const container = result.containerDefinitions.find(item => item.name === service.container);
  assert.ok(container, 'Expected application container is missing');
  const current = Object.fromEntries((container.environment ?? []).map(item => [item.name, item.value]));
  const environment = { ...target.runtimeDefaults, ...current,
    ATLAS_RUNTIME: 'production', ATLAS_PROCESS_ROLE: service.role, AWS_REGION: target.region,
    ABUSE_VIEWER_ADDRESS_HEADER: 'cloudfront-viewer-address', ABUSE_REQUIRE_GENERATED_VIEWER_ADDRESS: 'true',
    TRUSTED_PROXY_CIDRS: proxyCidrs.join(',') };
  container.environment = Object.entries(environment).map(([name, value]) => ({ name, value }));
  container.image = image;
  if (service.role === 'api') {
    const port = Number(environment.PORT ?? 3000);
    assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
    container.healthCheck = { ...container.healthCheck, interval: 30, timeout: 5, retries: 3, startPeriod: 60,
      command: ['CMD-SHELL', `node -e "fetch('http://127.0.0.1:${port}/internal/readiness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`] };
  }
  return result;
}

export function originRequestPolicy(name, sessionCookie = 'atlas_session') {
  return { Name: name, Comment: 'Generated viewer identity and application request forwarding',
    CookiesConfig: { CookieBehavior: 'whitelist', Cookies: { Quantity: 1, Items: [sessionCookie] } },
    HeadersConfig: { HeaderBehavior: 'whitelist', Headers: { Quantity: 10, Items: [
      'Access-Control-Request-Headers', 'Access-Control-Request-Method', 'CloudFront-Viewer-Address',
      'Content-Type', 'If-Match', 'If-None-Match', 'Origin', 'Range', 'Referer', 'User-Agent'] } },
    QueryStringsConfig: { QueryStringBehavior: 'all' } };
}

export function candidateDistribution(config, target, policyId) {
  assert.ok(config.Aliases.Items?.includes(target.domain), 'CloudFront alias does not match the live site');
  const api = config.Origins.Items.find(origin => origin.Id === target.apiOriginId);
  assert.ok(api?.VpcOriginConfig && api.DomainName.endsWith(`.${target.region}.elb.amazonaws.com`), 'Expected private API origin is missing');
  assert.ok(config.Origins.Items.some(origin => origin.DomainName === `${target.webBucket}.s3.${target.region}.amazonaws.com`), 'Expected web origin is missing');
  assert.ok(config.WebACLId, 'Live WAF association is missing');
  const result = structuredClone(config);
  for (const path of ['/health', '/v1/*']) {
    const behavior = result.CacheBehaviors.Items.find(item => item.PathPattern === path);
    assert.equal(behavior?.TargetOriginId, target.apiOriginId, `Unexpected origin for ${path}`);
    behavior.OriginRequestPolicyId = policyId;
    behavior.CachePolicyId = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'; // AWS managed CachingDisabled
  }
  // Keep the live static-only SPA function, TLS, private origins, and WAF.
  assert.equal(result.CustomErrorResponses?.Quantity ?? 0, 0, 'API errors must not be rewritten into HTML');
  return result;
}

export function serviceReady(service, taskDefinition) {
  const primary = service.deployments?.find(deployment => deployment.status === 'PRIMARY');
  if (primary?.taskDefinition !== taskDefinition || primary.rolloutState === 'FAILED') return false;
  return service.taskDefinition === taskDefinition && service.deployments.length === 1
    && primary.rolloutState === 'COMPLETED' && service.pendingCount === 0
    && service.runningCount === service.desiredCount;
}

export async function waitForService(read, expected, { attempts = 80, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const service = await read();
    const primary = service.deployments?.find(item => item.status === 'PRIMARY');
    if (primary?.taskDefinition !== expected || primary.rolloutState === 'FAILED') {
      throw new Error('ECS rejected or replaced the candidate deployment');
    }
    if (serviceReady(service, expected)) return;
    await pause(15000);
  }
  throw new Error('ECS deployment did not stabilize within 20 minutes');
}
