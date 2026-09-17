import copy
import importlib.util
import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock
from urllib.parse import quote, unquote, urlsplit

spec = importlib.util.spec_from_file_location('credential_sync', Path(__file__).with_name('handler.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.settings = {'database_id': 'db', 'source_secret': 'source', 'target_secret': 'target', 'cluster': 'cluster', 'services': ['api', 'worker']}
        self.password = 'fresh:/@?#%+ pass'
        self.source = {'SecretString': json.dumps({'username': 'app', 'password': self.password}), 'VersionId': 'source-v2'}
        self.target = {'SecretString': 'postgres://app:old@db.internal:5432/atlas?sslmode=require', 'VersionId': 'target-v1', 'CreatedDate': self.now - timedelta(days=2)}
        self.secrets = Mock()
        self.secrets.get_secret_value.side_effect = lambda **kwargs: copy.deepcopy(self.source if kwargs['SecretId'] == 'source' else self.target)
        def put(**kwargs):
            self.target.update(SecretString=kwargs['SecretString'], VersionId=kwargs['ClientRequestToken'], CreatedDate=self.now)
        self.secrets.put_secret_value.side_effect = put
        self.services = [{'serviceName': name, 'status': 'ACTIVE', 'desiredCount': 1, 'taskDefinition': name + ':8', 'deployments': [{'status': 'PRIMARY', 'createdAt': self.now - timedelta(days=1), 'rolloutState': 'COMPLETED'}]} for name in ['api', 'worker']]
        self.ecs = Mock()
        self.ecs.describe_services.side_effect = lambda **kwargs: {'services': copy.deepcopy(self.services)}
        self.ecs.describe_task_definition.return_value = {'taskDefinition': {'containerDefinitions': [{'secrets': [{'name': 'DATABASE_URL', 'valueFrom': 'target'}]}]}}
        def deploy(**kwargs):
            service = next(s for s in self.services if s['serviceName'] == kwargs['service'])
            service['deployments'] = [{'status': 'PRIMARY', 'createdAt': self.now + timedelta(seconds=1), 'rolloutState': 'IN_PROGRESS'}]
        self.deploy = deploy
        self.ecs.update_service.side_effect = deploy
        self.database = {'MasterUserSecret': {'SecretArn': 'source', 'SecretStatus': 'active'}, 'DBInstanceStatus': 'available', 'Endpoint': {'Address': 'db.internal', 'Port': 5432}, 'MasterUsername': 'app'}
        self.rds = Mock()
        self.rds.describe_db_instances.side_effect = lambda **kwargs: {'DBInstances': [copy.deepcopy(self.database)]}

    def run_sync(self):
        return module.reconcile(self.secrets, self.ecs, self.rds, self.settings)

    def test_rotated_password_is_encoded_without_changing_other_fields(self):
        result = self.run_sync()
        parsed = urlsplit(self.target['SecretString'])
        self.assertEqual(unquote(parsed.password), self.password)
        self.assertEqual(parsed.hostname, 'db.internal')
        self.assertEqual(parsed.path, '/atlas')
        self.assertEqual(parsed.query, 'sslmode=require')
        self.assertEqual(result['servicesRefreshed'], ['api', 'worker'])
        self.assertTrue(result['secretUpdated'])

    def test_replay_is_noop_even_while_deployment_in_progress(self):
        self.run_sync()
        self.secrets.put_secret_value.reset_mock()
        self.ecs.update_service.reset_mock()
        self.assertEqual(self.run_sync(), {'status': 'ok', 'secretUpdated': False, 'servicesRefreshed': []})
        self.secrets.put_secret_value.assert_not_called()
        self.ecs.update_service.assert_not_called()

    def test_partial_deployment_failure_retries_only_missing_service(self):
        def fail_worker(**kwargs):
            if kwargs['service'] == 'worker':
                raise RuntimeError('synthetic failure')
            self.deploy(**kwargs)
        self.ecs.update_service.side_effect = fail_worker
        with self.assertRaises(RuntimeError):
            self.run_sync()
        self.ecs.update_service.side_effect = self.deploy
        self.assertEqual(self.run_sync()['servicesRefreshed'], ['worker'])
        self.assertEqual(self.secrets.put_secret_value.call_count, 1)

    def test_existing_matching_secret_still_refreshes_stale_tasks(self):
        self.target.update(SecretString=self.target['SecretString'].replace(':old@', ':' + quote(self.password, safe='') + '@'), CreatedDate=self.now)
        self.assertEqual(self.run_sync()['servicesRefreshed'], ['api', 'worker'])
        self.secrets.put_secret_value.assert_not_called()

    def test_disabled_worker_stays_disabled(self):
        self.services[1]['desiredCount'] = 0
        self.assertEqual(self.run_sync()['servicesRefreshed'], ['api'])

    def test_host_mismatch_fails_before_writes(self):
        self.database['Endpoint']['Address'] = 'other.internal'
        with self.assertRaisesRegex(module.SyncError, 'DATABASE_HOST_MISMATCH'):
            self.run_sync()
        self.secrets.put_secret_value.assert_not_called()
        self.ecs.update_service.assert_not_called()

    def test_user_mismatch_fails_before_writes(self):
        self.database['MasterUsername'] = 'someone_else'
        with self.assertRaisesRegex(module.SyncError, 'DATABASE_USER_MISMATCH'):
            self.run_sync()
        self.secrets.put_secret_value.assert_not_called()

    def test_rotation_in_progress_is_retried(self):
        self.database['MasterUserSecret']['SecretStatus'] = 'rotating'
        with self.assertRaisesRegex(module.SyncError, 'ROTATION_NOT_READY'):
            self.run_sync()
        self.secrets.get_secret_value.assert_not_called()

    def test_wrong_secret_reference_fails_before_writes(self):
        self.ecs.describe_task_definition.return_value['taskDefinition']['containerDefinitions'][0]['secrets'][0]['valueFrom'] = 'wrong'
        with self.assertRaisesRegex(module.SyncError, 'SERVICE_SECRET_MISMATCH'):
            self.run_sync()
        self.secrets.put_secret_value.assert_not_called()

    def test_source_changes_during_sync(self):
        calls = 0
        def get(**kwargs):
            nonlocal calls
            if kwargs['SecretId'] == 'source':
                calls += 1
                return dict(self.source, VersionId=str(calls))
            return copy.deepcopy(self.target)
        self.secrets.get_secret_value.side_effect = get
        with self.assertRaisesRegex(module.SyncError, 'SOURCE_CHANGED_RETRY'):
            self.run_sync()
        self.secrets.put_secret_value.assert_not_called()

    def test_failed_current_deployment_does_not_restart_endlessly(self):
        self.run_sync()
        self.services[0]['deployments'][0]['rolloutState'] = 'FAILED'
        self.ecs.update_service.reset_mock()
        with self.assertRaisesRegex(module.SyncError, 'ECS_DEPLOYMENT_FAILED'):
            self.run_sync()
        self.ecs.update_service.assert_not_called()

    def test_missing_service_fails_closed(self):
        self.ecs.describe_services.side_effect = lambda **kwargs: {'services': [], 'failures': [{'reason': 'MISSING'}]}
        with self.assertRaisesRegex(module.SyncError, 'SERVICE_LOOKUP_FAILED'):
            self.run_sync()
        self.secrets.put_secret_value.assert_not_called()


if __name__ == '__main__':
    unittest.main()
