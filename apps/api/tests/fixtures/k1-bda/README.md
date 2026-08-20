# Sanitized K-1 extraction fixtures

This directory is owned by the API ingestion test suite. It contains only
synthetic PDFs, fully sanitized samples approved for source control, recorded
provider output with no real taxpayer data, and expected canonical JSON.

Never add production K-1s, real names, addresses, TINs, EINs, account numbers,
or unreviewed Bedrock output. Large or access-controlled evaluation PDFs belong
in the approved non-production artifact store and are referenced by opaque
fixture IDs from the manifest.

The fixture manifest is introduced with the extraction mapper tests. It must
cover supported form revisions, scans, negative formats, checkboxes, repeated
code rows, continuation statements, unknown forms, corrupt/encrypted files,
duplicates, ambiguous matches, existing values, and dated capital activity.

Run the sanitized metric report with:

```powershell
npm run --workspace=api evaluate:k1-bda
```

The runner rejects cases not explicitly marked `containsProductionData: false` and reports source-field accounting, normalized exact match, issue recall, false-safe count, matcher accuracy, page grounding, and apply equivalence. Use `-- --case=<approved-json>` for an access-controlled staging result exported without raw taxpayer fields.
