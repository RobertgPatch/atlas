import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ref = (name) => ({ Ref: name });
const sub = (value) => ({ 'Fn::Sub': value });
const arn = (name) => ({ 'Fn::GetAtt': [name, 'Arn'] });
const serviceArns = [sub('arn:${AWS::Partition}:ecs:${AWS::Region}:${AWS::AccountId}:service/${ClusterName}/${ApiServiceName}'), sub('arn:${AWS::Partition}:ecs:${AWS::Region}:${AWS::AccountId}:service/${ClusterName}/${WorkerServiceName}')];

export function buildTemplate() {
  const parameters = {
    FunctionName: { Type: 'String', Default: 'project-jackson-production-db-credential-sync' },
    DatabaseId: { Type: 'String', Default: 'project-jackson-production-postgres' },
    ClusterName: { Type: 'String', Default: 'project-jackson-production-cluster' },
    ApiServiceName: { Type: 'String', Default: 'project-jackson-production-api' },
    WorkerServiceName: { Type: 'String', Default: 'project-jackson-production-k1-worker' },
    SourceSecretArn: { Type: 'String' }, SourceSecretName: { Type: 'String' },
    TargetSecretArn: { Type: 'String' },
    SourceKmsKeyArn: { Type: 'String' }, TargetKmsKeyArn: { Type: 'String' },
    AlarmTopicArn: { Type: 'String', Default: '' },
  };
  const resources = {
    Logs: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: sub('/aws/lambda/${FunctionName}'), RetentionInDays: 7 } },
    Failures: { Type: 'AWS::SQS::Queue', Properties: { QueueName: sub('${FunctionName}-failures'), SqsManagedSseEnabled: true, MessageRetentionPeriod: 1209600 } },
    Role: { Type: 'AWS::IAM::Role', Properties: {
      AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] },
      Policies: [{ PolicyName: 'only-database-credential-sync', PolicyDocument: { Version: '2012-10-17', Statement: [
        { Effect: 'Allow', Action: ['secretsmanager:GetSecretValue'], Resource: [ref('SourceSecretArn'), ref('TargetSecretArn')] },
        { Effect: 'Allow', Action: ['secretsmanager:PutSecretValue'], Resource: ref('TargetSecretArn') },
        { Effect: 'Allow', Action: ['kms:Decrypt'], Resource: [ref('SourceKmsKeyArn'), ref('TargetKmsKeyArn')], Condition: { StringEquals: { 'kms:ViaService': sub('secretsmanager.${AWS::Region}.amazonaws.com') } } },
        { Effect: 'Allow', Action: ['kms:GenerateDataKey'], Resource: ref('TargetKmsKeyArn'), Condition: { StringEquals: { 'kms:ViaService': sub('secretsmanager.${AWS::Region}.amazonaws.com') } } },
        { Effect: 'Allow', Action: ['rds:DescribeDBInstances'], Resource: sub('arn:${AWS::Partition}:rds:${AWS::Region}:${AWS::AccountId}:db:${DatabaseId}') },
        { Effect: 'Allow', Action: ['ecs:DescribeServices', 'ecs:UpdateService'], Resource: serviceArns },
        // AWS does not support resource-level IAM for DescribeTaskDefinition.
        // All mutation and credential access remains resource-scoped.
        { Effect: 'Allow', Action: ['ecs:DescribeTaskDefinition'], Resource: '*', Condition: { StringEquals: { 'aws:RequestedRegion': ref('AWS::Region') } } },
        { Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: arn('Logs') },
        { Effect: 'Allow', Action: ['sqs:SendMessage'], Resource: arn('Failures') },
      ] } }],
    } },
    Sync: { Type: 'AWS::Lambda::Function', DependsOn: ['Logs'], Properties: {
      FunctionName: ref('FunctionName'), Runtime: 'python3.13', Handler: 'index.handler', Role: arn('Role'),
      Timeout: 120, MemorySize: 128, ReservedConcurrentExecutions: 1,
      Code: { ZipFile: readFileSync(new URL('./handler.py', import.meta.url), 'utf8') },
      Environment: { Variables: { DATABASE_ID: ref('DatabaseId'), SOURCE_SECRET_ARN: ref('SourceSecretArn'), TARGET_SECRET_ARN: ref('TargetSecretArn'), ECS_CLUSTER: ref('ClusterName'), ECS_SERVICES: sub('${ApiServiceName},${WorkerServiceName}') } },
      Description: 'Synchronize RDS-managed password to DATABASE_URL and refresh only stale ECS consumers.',
    } },
    AsyncRetries: { Type: 'AWS::Lambda::EventInvokeConfig', Properties: { FunctionName: ref('Sync'), Qualifier: '$LATEST', MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 3600, DestinationConfig: { OnFailure: { Destination: arn('Failures') } } } },
    RotationRule: { Type: 'AWS::Events::Rule', Properties: {
      Name: sub('${FunctionName}-rotation'), State: 'ENABLED',
      EventPattern: { source: ['aws.secretsmanager'], 'detail-type': ['Secret Label Updated'], account: [ref('AWS::AccountId')], region: [ref('AWS::Region')], detail: { name: [ref('SourceSecretName')], labelUpdated: ['AWSCURRENT'] } },
      Targets: [{ Id: 'sync', Arn: arn('Sync'), RetryPolicy: { MaximumRetryAttempts: 10, MaximumEventAgeInSeconds: 3600 }, DeadLetterConfig: { Arn: arn('Failures') } }],
    } },
    FallbackRule: { Type: 'AWS::Events::Rule', Properties: {
      Name: sub('${FunctionName}-reconcile'), State: 'ENABLED', ScheduleExpression: 'rate(5 minutes)',
      Targets: [{ Id: 'sync', Arn: arn('Sync'), Input: '{"reason":"scheduled-reconciliation"}', RetryPolicy: { MaximumRetryAttempts: 10, MaximumEventAgeInSeconds: 3600 }, DeadLetterConfig: { Arn: arn('Failures') } }],
    } },
    RotationPermission: { Type: 'AWS::Lambda::Permission', Properties: { Action: 'lambda:InvokeFunction', FunctionName: ref('Sync'), Principal: 'events.amazonaws.com', SourceArn: arn('RotationRule'), SourceAccount: ref('AWS::AccountId') } },
    FallbackPermission: { Type: 'AWS::Lambda::Permission', Properties: { Action: 'lambda:InvokeFunction', FunctionName: ref('Sync'), Principal: 'events.amazonaws.com', SourceArn: arn('FallbackRule'), SourceAccount: ref('AWS::AccountId') } },
    FailureQueuePolicy: { Type: 'AWS::SQS::QueuePolicy', Properties: { Queues: [ref('Failures')], PolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'events.amazonaws.com' }, Action: 'sqs:SendMessage', Resource: arn('Failures'), Condition: { ArnEquals: { 'aws:SourceArn': [arn('RotationRule'), arn('FallbackRule')] } } }] } } },
    ErrorAlarm: { Type: 'AWS::CloudWatch::Alarm', Properties: {
      AlarmName: sub('${FunctionName}-errors'), AlarmDescription: 'Database credential synchronization failed. Inspect sanitized Lambda logs and the failure queue.',
      Namespace: 'AWS/Lambda', MetricName: 'Errors', Dimensions: [{ Name: 'FunctionName', Value: ref('Sync') }],
      Statistic: 'Sum', Period: 300, EvaluationPeriods: 1, Threshold: 1, ComparisonOperator: 'GreaterThanOrEqualToThreshold', TreatMissingData: 'notBreaching',
      AlarmActions: { 'Fn::If': ['HasAlarmTopic', [ref('AlarmTopicArn')], []] },
    } },
    FailureAlarm: { Type: 'AWS::CloudWatch::Alarm', Properties: {
      AlarmName: sub('${FunctionName}-undelivered'), AlarmDescription: 'A database synchronization invocation exhausted delivery/execution retries.',
      Namespace: 'AWS/SQS', MetricName: 'ApproximateNumberOfMessagesVisible', Dimensions: [{ Name: 'QueueName', Value: { 'Fn::GetAtt': ['Failures', 'QueueName'] } }],
      Statistic: 'Maximum', Period: 300, EvaluationPeriods: 1, Threshold: 1, ComparisonOperator: 'GreaterThanOrEqualToThreshold', TreatMissingData: 'notBreaching',
      AlarmActions: { 'Fn::If': ['HasAlarmTopic', [ref('AlarmTopicArn')], []] },
    } },
  };
  return { AWSTemplateFormatVersion: '2010-09-09', Description: 'Isolated Project Jackson database credential synchronization; no changes to the existing application or network.', Parameters: parameters, Conditions: { HasAlarmTopic: { 'Fn::Not': [{ 'Fn::Equals': [ref('AlarmTopicArn'), ''] }] } }, Resources: resources, Outputs: { FunctionName: { Value: ref('Sync') }, FailureQueueUrl: { Value: ref('Failures') }, RotationRuleArn: { Value: arn('RotationRule') }, FallbackRuleArn: { Value: arn('FallbackRule') } } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? '.artifacts/database-credential-sync/template.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(buildTemplate(), null, 2) + '\n');
  console.log(output);
}
