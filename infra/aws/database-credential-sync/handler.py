"""Reconcile a copied DATABASE_URL after RDS-managed credential rotation.

No passwords, URLs, request events, or SDK exception text are logged. Re-reading
deployment creation times makes partial failures/replayed events safe without a
second checkpoint database. Lambda reserved concurrency must remain one.
"""
import hashlib
import json
import os
from urllib.parse import quote, unquote, urlsplit, urlunsplit


class SyncError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise SyncError(code)


def reconcile(secrets, ecs, rds, settings):
    database = rds.describe_db_instances(
        DBInstanceIdentifier=settings['database_id'])['DBInstances'][0]
    managed = database.get('MasterUserSecret', {})
    require(managed.get('SecretArn') == settings['source_secret'], 'SOURCE_IDENTITY_MISMATCH')
    require(managed.get('SecretStatus') == 'active', 'ROTATION_NOT_READY')
    require(database['DBInstanceStatus'] == 'available', 'DATABASE_NOT_READY')

    source = secrets.get_secret_value(SecretId=settings['source_secret'], VersionStage='AWSCURRENT')
    target = secrets.get_secret_value(SecretId=settings['target_secret'], VersionStage='AWSCURRENT')
    credentials = json.loads(source['SecretString'])
    connection = urlsplit(target['SecretString'])
    require(connection.scheme in ('postgres', 'postgresql'), 'INVALID_CONNECTION_SCHEME')
    require(connection.hostname == database['Endpoint']['Address'], 'DATABASE_HOST_MISMATCH')
    require(connection.port in (None, database['Endpoint']['Port']), 'DATABASE_PORT_MISMATCH')
    require(unquote(connection.username or '') == credentials.get('username') == database['MasterUsername'], 'DATABASE_USER_MISMATCH')
    require(isinstance(credentials.get('password'), str) and len(credentials['password']) > 0, 'EMPTY_PASSWORD')
    require(connection.password is not None, 'MISSING_PASSWORD')

    # Validate both consumers before writing the shared credential.
    services = ecs.describe_services(cluster=settings['cluster'], services=settings['services'])
    require(not services.get('failures'), 'SERVICE_LOOKUP_FAILED')
    require({s['serviceName'] for s in services['services']} == set(settings['services']), 'SERVICE_IDENTITY_MISMATCH')
    for service in services['services']:
        require(service['status'] == 'ACTIVE', 'SERVICE_NOT_ACTIVE')
        task = ecs.describe_task_definition(taskDefinition=service['taskDefinition'])['taskDefinition']
        references = [secret['valueFrom'] for container in task['containerDefinitions']
                      for secret in container.get('secrets', []) if secret['name'] == 'DATABASE_URL']
        require(references and all(ref == settings['target_secret'] for ref in references), 'SERVICE_SECRET_MISMATCH')

    changed = unquote(connection.password) != credentials['password']
    if changed:
        # Preserve the original username encoding, host, database and query.
        authority = connection.netloc.rsplit('@', 1)
        user = authority[0].split(':', 1)[0]
        updated = urlunsplit(connection._replace(netloc=user + ':' + quote(credentials['password'], safe='') + '@' + authority[1]))
        latest = secrets.get_secret_value(SecretId=settings['source_secret'], VersionStage='AWSCURRENT')
        current_target = secrets.get_secret_value(SecretId=settings['target_secret'], VersionStage='AWSCURRENT')
        require(latest['VersionId'] == source['VersionId'], 'SOURCE_CHANGED_RETRY')
        require(current_target['VersionId'] == target['VersionId'], 'TARGET_CHANGED_RETRY')
        token = hashlib.sha256((source['VersionId'] + '\n' + updated).encode()).hexdigest()
        secrets.put_secret_value(SecretId=settings['target_secret'], ClientRequestToken=token, SecretString=updated)
        target = secrets.get_secret_value(SecretId=settings['target_secret'], VersionStage='AWSCURRENT')
        require(target['SecretString'] == updated, 'SECRET_READBACK_FAILED')

    refreshed = []
    for service in services['services']:
        if service['desiredCount'] == 0:
            continue  # Never turn on intentionally disabled processing.
        primary = [d for d in service['deployments'] if d['status'] == 'PRIMARY']
        require(len(primary) == 1, 'PRIMARY_DEPLOYMENT_MISSING')
        deployment = primary[0]
        if deployment['createdAt'] >= target['CreatedDate']:
            require(deployment.get('rolloutState') != 'FAILED', 'ECS_DEPLOYMENT_FAILED')
            continue
        ecs.update_service(cluster=settings['cluster'], service=service['serviceName'], forceNewDeployment=True)
        refreshed.append(service['serviceName'])

    return {'status': 'ok', 'secretUpdated': changed, 'servicesRefreshed': refreshed}


def handler(event, context):
    # The payload is deliberately not used for resource selection. Only the
    # fixed deployment configuration can select credentials or ECS services.
    import boto3
    from botocore.config import Config
    try:
        settings = {
            'database_id': os.environ['DATABASE_ID'],
            'source_secret': os.environ['SOURCE_SECRET_ARN'],
            'target_secret': os.environ['TARGET_SECRET_ARN'],
            'cluster': os.environ['ECS_CLUSTER'],
            'services': os.environ['ECS_SERVICES'].split(','),
        }
        config = Config(connect_timeout=3, read_timeout=8, retries={'mode': 'standard', 'total_max_attempts': 3})
        result = reconcile(boto3.client('secretsmanager', config=config),
                           boto3.client('ecs', config=config),
                           boto3.client('rds', config=config), settings)
        if result['secretUpdated'] or result['servicesRefreshed']:
            print(json.dumps(result))
        return result
    except SyncError as error:
        raise RuntimeError(str(error)) from None
    except Exception:
        # SDK errors can contain request/response details; keep failures finite.
        raise RuntimeError('DATABASE_CREDENTIAL_SYNC_FAILED') from None
