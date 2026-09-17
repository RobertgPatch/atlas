import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTemplate } from '../../infra/aws/database-credential-sync/template.mjs';

const profile = 'atlas-production';
const region = 'us-west-1';
const account = '403454291976';
const cluster = 'project-jackson-production-cluster';
const serviceNames = ['project-jackson-production-api', 'project-jackson-production-k1-worker'];
const stack = 'project-jackson-production-db-credential-sync';
const cli = process.platform === 'win32' ? 'aws.exe' : 'aws';
const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
function aws(...command) {
  try {
    return JSON.parse(execFileSync(cli, [...command, '--profile', profile, '--region', region, '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch {
    throw new Error(`AWS ${command[0]} ${command[1]} failed. Verify the approved AWS login and permissions. No secret values were requested.`);
  }
}
function require(condition, message) { if (!condition) throw new Error(message); }

function main() {
  require(aws('sts', 'get-caller-identity').Account === account, 'Wrong AWS account');
  const database = aws('rds', 'describe-db-instances', '--db-instance-identifier', 'project-jackson-production-postgres').DBInstances[0];
  require(database.DBInstanceStatus === 'available' && database.MasterUserSecret?.SecretStatus === 'active', 'Database/managed secret is not ready');
  const source = aws('secretsmanager', 'describe-secret', '--secret-id', database.MasterUserSecret.SecretArn);
  const target = aws('secretsmanager', 'describe-secret', '--secret-id', 'project-jackson-production/DATABASE_URL');
  require(source.ARN.startsWith(`arn:aws:secretsmanager:${region}:${account}:`), 'Source secret region/account mismatch');
  require(target.ARN.startsWith(`arn:aws:secretsmanager:${region}:${account}:`), 'Target secret region/account mismatch');
  const services = aws('ecs', 'describe-services', '--cluster', cluster, '--services', ...serviceNames);
  require(!services.failures?.length && services.services.length === 2, 'Expected services were not found');
  for (const service of services.services) {
    const task = aws('ecs', 'describe-task-definition', '--task-definition', service.taskDefinition).taskDefinition;
    const references = task.containerDefinitions.flatMap(c => c.secrets ?? []).filter(s => s.name === 'DATABASE_URL');
    require(serviceNames.includes(task.family), 'Unexpected task-definition family');
    require(references.length > 0 && references.every(s => s.valueFrom === target.ARN), 'Service is not using the expected database secret');
  }
  const keyArn = (id) => aws('kms', 'describe-key', '--key-id', id).KeyMetadata.Arn;
  const parameters = {
    SourceSecretArn: source.ARN,
    SourceSecretName: source.Name,
    TargetSecretArn: target.ARN,
    SourceKmsKeyArn: keyArn(source.KmsKeyId ?? database.MasterUserSecret.KmsKeyId),
    TargetKmsKeyArn: keyArn(target.KmsKeyId ?? 'alias/aws/secretsmanager'),
    AlarmTopicArn: option('--alarm-topic-arn') ?? '',
  };
  if (parameters.AlarmTopicArn) require(parameters.AlarmTopicArn.startsWith(`arn:aws:sns:${region}:${account}:`), 'Alarm topic must be in the approved account and region');
  const artifactDirectory = resolve('.artifacts/database-credential-sync');
  mkdirSync(artifactDirectory, { recursive: true });
  const templatePath = resolve(artifactDirectory, 'template.json');
  // Generated deployment artifacts contain source and resource identifiers only.
  writeFileSync(templatePath, JSON.stringify(buildTemplate(), null, 2) + '\n');
  writeFileSync(resolve(artifactDirectory, 'parameters.json'), JSON.stringify(parameters, null, 2) + '\n');
  aws('cloudformation', 'validate-template', '--template-body', `file://${templatePath}`);
  console.log(JSON.stringify({ account, region, stack, mode: args.includes('--apply') ? 'apply' : 'plan', resources: Object.keys(buildTemplate().Resources), services: serviceNames, notificationsConfigured: Boolean(parameters.AlarmTopicArn) }, null, 2));
  if (!args.includes('--apply')) return;
  execFileSync(cli, ['cloudformation', 'deploy', '--profile', profile, '--region', region, '--stack-name', stack,
    '--template-file', templatePath, '--capabilities', 'CAPABILITY_IAM', '--no-fail-on-empty-changeset',
    '--parameter-overrides', ...Object.entries(parameters).map(([key, value]) => `${key}=${value}`),
    '--tags', 'Application=project-jackson', 'Purpose=database-credential-sync'], { stdio: 'inherit', windowsHide: true });
  console.log(JSON.stringify(aws('cloudformation', 'describe-stacks', '--stack-name', stack).Stacks.map(s => ({ status: s.StackStatus, outputs: s.Outputs })), null, 2));
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
