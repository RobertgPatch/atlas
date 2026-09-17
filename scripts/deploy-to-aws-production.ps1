# Routine releases use the existing live stack. The separate planned Terraform
# topology has not been imported/reconciled with that stack.
[CmdletBinding()]
param(
  [ValidateSet('Deploy', 'Plan')]
  [string] $Mode = 'Deploy',
  [string] $AwsProfile = 'atlas-production'
)
$previousProfile = $env:ATLAS_DEPLOY_AWS_PROFILE
try {
  $env:ATLAS_DEPLOY_AWS_PROFILE = $AwsProfile
  $arguments = @((Join-Path $PSScriptRoot 'deployment\deploy-live-production.mjs'))
  if ($Mode -eq 'Plan') { $arguments += '--plan' }
  & node @arguments
  exit $LASTEXITCODE
}
finally { $env:ATLAS_DEPLOY_AWS_PROFILE = $previousProfile }
