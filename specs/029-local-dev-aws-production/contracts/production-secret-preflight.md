# Production Secret Preflight Contract

## Sources and ownership

`infra/aws/terraform/production-secrets.contract.json` is the committed non-secret topology source. It contains one row per runtime key with:

- canonical environment key;
- Secrets Manager name suffix;
- consumers from `api`, `plaid-scheduler`, `market-scheduler`, and `k1-worker`;
- required condition tied to a Terraform feature flag;
- whether the value is persistence-critical for rollback compatibility.

It contains no secret ARN with an account ID, secret value, default credential, VersionId, or value-derived hash. Terraform creates/references secret metadata from this matrix; deployment tooling evaluates the same file. `PLAID_ENV` is configuration rather than a secret and belongs in the task's non-secret environment map.

## Terraform wiring policy

The production plan policy must prove:

- every currently required key appears in the expected ECS task/scheduler `secrets` collection;
- no required key appears in plaintext `environment`;
- each reference resolves to the canonical secret name in the target account and `us-west-2`;
- task execution roles can read only the required secret ARNs and decrypt only the required KMS key;
- every declared consumer is wired and retired aliases, including `ATLAS_SCHEDULER_TOKEN`, are absent;
- conditionally disabled consumers do not create unnecessary secrets, tasks, or alarms unless another active consumer needs the key.

Plan policy never calls Secrets Manager and never attempts to inspect a value.

## Live verification

Prepare and Apply perform live verification after AWS identity/region checks and before application activation. For every currently required row, the helper must:

1. resolve exactly one canonical secret in the expected account and region;
2. reject a secret pending deletion;
3. require exactly one version with stage `AWSCURRENT`;
4. request that exact version and keep the result in process memory only;
5. require a present VersionId and a nonempty `SecretString` or `SecretBinary`;
6. discard the value immediately after the boolean test;
7. record the redacted attestation fields.

Prepare records:

```json
{
  "contractSha256": "<64 lowercase hex>",
  "verifiedAt": "<RFC3339 UTC>",
  "secrets": [
    {
      "key": "PROJECT_JACKSON_SCHEDULER_TOKEN",
      "secretArn": "<canonical ARN, no value>",
      "versionId": "<provider version identifier>",
      "consumers": ["plaid-scheduler"],
      "exists": true,
      "currentVersionUnique": true,
      "nonempty": true,
      "wiringVerified": true
    }
  ]
}
```

Apply repeats every check and requires the same contract hash, secret identity, and `AWSCURRENT` VersionId. Any drift invalidates the release and requires Prepare again.

## Output and error safety

The helper must not emit or persist:

- secret string/binary values;
- value length or hash;
- AWS CLI/SDK raw JSON;
- process command lines containing values;
- database URLs, auth credentials, session tokens, or cookies;
- provider exceptions before redaction.

Shared logs may record only the logical key, consumer, pass/fail rule ID, and redacted canonical identifier. Tests inject sentinel values and prove they never appear in stdout, stderr, result files, or exceptions.

## Required negative fixtures

- canonical name missing or duplicated;
- pending deletion;
- no `AWSCURRENT` or multiple current versions;
- empty string and empty binary;
- missing VersionId;
- wrong account or region ARN;
- Prepare/Apply VersionId drift;
- plaintext ECS environment wiring;
- missing consumer wiring or overly broad IAM;
- retired scheduler-token alias;
- malformed provider error containing a sentinel secret;
- disabled feature incorrectly requiring or provisioning a secret.

There is no arbitrary age-based failure for long-lived persistence keys. Rotation policy may be added later; for this feature, stale means unavailable, lacks one current version, or changed since Prepare.

