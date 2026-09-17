# K-1 withdrawal sign and currency display — 2026-09-04

The user reported a 2025 Section L withdrawal of `(255,786)` appearing as positive in the review draft. BDA returned `255,786` without the printed parentheses. Extraction normalization now uses the existing application mapper's negative sign convention for Section L withdrawals. Raw provider evidence is retained; zero and other capital fields are unchanged.

The reported draft was corrected through the authenticated corrections endpoint with an `If-Match` version guard. Its review version advanced from 2 to 3, and the correction is recorded in its audit history. The corrected value is `-255786.00`. No financial application or finalization was performed.

Currency inputs in the review now show thousands separators and at least two decimal places, including code-row amounts. Formatting uses decimal strings to preserve precision. Editing and pasted accounting parentheses produce unformatted values for the API; focusing or leaving an unchanged input does not create a correction.

## Deployment

- Public site: `https://projectjackson.family`.
- The original frontend was reproduced byte-for-byte from commit `45af948` with `VITE_MAGIC_PATTERN_DESIGNS=true` before adding only `CurrencyInput.tsx` and the `ParsedFieldRow.tsx` integration. The unrelated working-tree changes were not published.
- Original JavaScript: `assets/index-DNwZ2qPe.js`. New JavaScript: `assets/index-T8e81Y6w.js`. CSS remains `assets/index-DCabQ5Dp.css`.
- Assets bucket: `project-jackson-production-web-assets`, `us-west-1`. The new asset was conditionally created; `index.html` was conditionally replaced using its original ETag. Old assets remain available.
- CloudFront distribution: `E3JSGITQ701ESZ`; invalidation `IEJ4ZX8OUPSMC5P30I53C3LSS6` completed.
- Worker task definition: `project-jackson-production-k1-worker:4`, previously `:3`, desired count 1. The image extends the current budget-protected API image and replaces only compiled extraction normalization.
- Worker image: `403454291976.dkr.ecr.us-west-1.amazonaws.com/project-jackson-production-api@sha256:5ddba8bff36a1b6c196d72fbae816670a4d7e3f67904ba89a11225bf5666d43a`.
- API remains revision 7. The 2,000-cent daily allowance and Oregon processor configuration are preserved.
- Exact deployment inputs and the original frontend index are retained locally under `.artifacts/k1-sign-format-20260904/`.

## Verification

- 40 focused parser/application-mapper tests passed, including missing parentheses, existing negative signs, numeric provider output, zero, and other positive capital fields.
- Eight currency tests passed, including negative values, pasted separators/parentheses, exact large decimal strings, editing, and absence of commas in emitted values.
- The exact worker image passed offline extraction normalization checks and retained the 2,000-cent daily configuration.
- Worker revision 4 reached `COMPLETED` deployment state with one running task, zero pending tasks, and the expected immutable image digest.
- The public site serves the new JavaScript; the health endpoint returned HTTP 200.
- A separate browser tab confirmed the live 2025 review displays Section L withdrawals as `-255,786.00`, positive capital with commas, and positive Part III distributions as `255,786.00`. No save or apply action was taken in the browser.

## Rollback

Restore the saved original `index.html` to the frontend bucket with a guard against overwriting a later deployment, then invalidate CloudFront. Return the worker service to task definition revision 3 if needed. Both worker revisions retain the daily budget protections. Do not revert the audited user-requested draft correction as part of a code rollback.
