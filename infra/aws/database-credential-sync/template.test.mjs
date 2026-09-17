import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplate } from './template.mjs';

test('sync has one execution at a time and no secret values in configuration', () => {
  const t = buildTemplate();
  const f = t.Resources.Sync.Properties;
  assert.equal(f.ReservedConcurrentExecutions, 1);
  assert.equal(f.Timeout, 120);
  assert.equal(f.Runtime, 'python3.13');
  assert.equal(f.VpcConfig, undefined);
  assert.deepEqual(Object.keys(f.Environment.Variables).sort(), ['DATABASE_ID', 'ECS_CLUSTER', 'ECS_SERVICES', 'SOURCE_SECRET_ARN', 'TARGET_SECRET_ARN']);
  assert.match(f.Code.ZipFile, /def handler\(event, context\)/);
});

test('rotation only matches current label on the approved source secret', () => {
  const pattern = buildTemplate().Resources.RotationRule.Properties.EventPattern;
  assert.deepEqual(pattern['detail-type'], ['Secret Label Updated']);
  assert.deepEqual(pattern.detail, { name: [{ Ref: 'SourceSecretName' }], labelUpdated: ['AWSCURRENT'] });
  assert.deepEqual(pattern.account, [{ Ref: 'AWS::AccountId' }]);
});

test('permissions cannot mutate the managed master secret or database', () => {
  const statements = buildTemplate().Resources.Role.Properties.Policies[0].PolicyDocument.Statement;
  const write = statements.find(s => s.Action.includes('secretsmanager:PutSecretValue'));
  assert.deepEqual(write.Resource, { Ref: 'TargetSecretArn' });
  assert.ok(!JSON.stringify(statements).includes('ModifyDB'));
  assert.ok(!JSON.stringify(statements).includes('RotateSecret'));
  assert.deepEqual(statements.filter(s => s.Resource === '*').map(s => s.Action), [['ecs:DescribeTaskDefinition']]);
  assert.ok(statements.find(s => s.Resource === '*').Condition.StringEquals['aws:RequestedRegion']);
  assert.deepEqual(statements.find(s => s.Action.includes('ecs:UpdateService')).Action, ['ecs:DescribeServices', 'ecs:UpdateService']);
});

test('fallback, retry delivery, retention, and bounded logs are defined', () => {
  const r = buildTemplate().Resources;
  assert.equal(r.FallbackRule.Properties.ScheduleExpression, 'rate(5 minutes)');
  assert.equal(r.AsyncRetries.Properties.MaximumRetryAttempts, 2);
  assert.equal(r.Failures.Properties.MessageRetentionPeriod, 1209600);
  assert.equal(r.Failures.Properties.SqsManagedSseEnabled, true);
  assert.equal(r.Logs.Properties.RetentionInDays, 7);
  for (const name of ['RotationRule', 'FallbackRule']) assert.ok(r[name].Properties.Targets[0].DeadLetterConfig);
  assert.ok(r.ErrorAlarm && r.FailureAlarm);
});

test('stack cannot change the app, network, database, or existing secrets', () => {
  const types = Object.values(buildTemplate().Resources).map(r => r.Type);
  assert.ok(types.every(t => !['AWS::ECS::Service', 'AWS::ECS::TaskDefinition', 'AWS::RDS::DBInstance', 'AWS::SecretsManager::Secret', 'AWS::EC2::SecurityGroup'].includes(t)));
  assert.ok(JSON.stringify(buildTemplate()).length < 51200);
});
