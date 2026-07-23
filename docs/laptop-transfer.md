# Current-branch laptop transfer and AWS staging deployment

This kit is generated from the live Atlas repository branch. It includes an exact Git bundle, every uncommitted source change, required ignored runtime files, Terraform state and staging variables, local document storage, the optional `atlas-staging` AWS profile sections, and an optional PostgreSQL dump. Unrelated AWS profiles are not copied.

Treat the entire kit as secret. Use an encrypted, healthy USB drive and keep its recovery key elsewhere.

## Prerequisites on the laptop

Install:

1. Git.
2. Node.js 22 or newer.
3. Docker Desktop with Linux containers and Docker Compose.
4. AWS CLI v2.
5. Terraform 1.14.1, matching the current local-state writer.
6. PowerShell.

## Restore the laptop

Replace `E:` if the encrypted USB receives another drive letter:

Stop any locally running API first. The restore refuses to replace PostgreSQL data while port 3000 is in use.

```powershell
powershell -ExecutionPolicy Bypass -File E:\deploy_files\restore-atlas.ps1 `
  -RepoPath 'C:\Users\rober\Documents\Projects\atlas' `
  -InstallAwsCredentials `
  -InstallDependencies `
  -RestoreDatabase `
  -VerifyBuilds `
  -VerifyStagingPlan
```

The restore script verifies every SHA-256 hash, uses the included Git bundle rather than assuming GitHub is unchanged, preserves prior laptop changes in a stash and backup branch, backs up ignored app/storage/Terraform files beside the project, switches to the transferred branch, restores exact relative paths, backs up existing AWS files and PostgreSQL data, installs dependencies, builds both workspaces, and runs a read-only Terraform staging plan.

## Run locally

```powershell
Set-Location 'C:\Users\rober\Documents\Projects\atlas'
npm.cmd run dev:local
```

- Web: `http://localhost:5173`
- API health: `http://127.0.0.1:3000/health`

## Deploy to AWS staging

The default command is plan-only and does not change AWS:

```powershell
Set-Location 'C:\Users\rober\Documents\Projects\atlas'
npm.cmd run deploy:aws:staging
```

Review the account identity and Terraform plan. Stop if it proposes broad creation, replacement, or destruction.

For a live deployment, use the staging account ID you personally verified:

```powershell
npm.cmd run deploy:aws:staging -- `
  -Apply `
  -ExpectedAccountId 'YOUR-STAGING-AWS-ACCOUNT-ID'
```

The live command builds the API and web app, builds a Linux/AMD64 API container, pushes a unique ECR tag, creates an exact saved plan, requires you to type `DEPLOY-STAGING`, applies Terraform, aligns `staging.tfvars` with the deployed image tag, uploads web assets to S3, invalidates CloudFront, waits for ECS stability, checks the API health endpoint, and writes pre/post state backups beside the project.

To place state backups directly on encrypted removable storage, add:

```powershell
-StateBackupDirectory 'E:\atlas-staging-state-backups'
```

Only one laptop may perform Terraform applies while state remains local. After every apply, preserve the newest `terraform.tfstate`, `terraform.tfstate.backup`, and `staging.tfvars`. A versioned, encrypted remote backend with locking remains the proper long-term fix.

## Files that must never be committed

- `apps/api/.env`
- `.aws/`
- `.storage/` and `apps/api/.storage/`
- `*.tfvars`
- `*.tfstate*`
- database dumps
- checksum manifests containing the private bundle inventory

The Terraform module under `infra/aws/terraform/modules/secrets/*.tf` is source code, not a secret value. The transfer includes a `.gitignore` correction so those module files can be reviewed and committed normally.

## After restoration

1. Run `git status --short` and review the transfer-created source changes.
2. Commit the deployment/transfer scripts, package command, `.gitignore` correction, and Terraform module source files when satisfied.
3. Do not add ignored runtime or credential files.
4. Rotate transferred static AWS access keys when replacement credentials are available.
5. Securely erase obsolete unencrypted transfer copies.
