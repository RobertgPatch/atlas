# Bedrock Data Automation assets

This directory owns the source-controlled Amazon Bedrock Data Automation
configuration for Schedule K-1 (Form 1065) extraction.

The API ingestion maintainers own blueprint schema changes and the mapping
schema. A blueprint change is a model release: evaluate it against the
sanitized fixture manifest in `apps/api/tests/fixtures/k1-bda/` before
promoting an immutable version from DEVELOPMENT to LIVE.

Do not store PDFs, taxpayer names, TINs, EINs, addresses, extracted values,
provider results, ARNs containing account-specific secrets, or credentials in
this directory. Blueprints contain field definitions only.

## Layout

- `blueprints/` contains version-controlled K-1 and fallback blueprints.
- `mapping-schema.json` pins the provider-neutral draft and mapping versions.
- Terraform under `infra/aws/terraform/modules/k1_ingestion/` deploys the AWS
  resources; promotion remains an explicit, evaluated release step.
