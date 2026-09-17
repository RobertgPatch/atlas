# K-1 basis page JSON response fix — 2026-09-04

The live K-1 entry and outside basis page displayed `Unexpected token '<', "<!doctype "... is not valid JSON` after a verified K-1 was applied. This was reproduced in the existing browser tab and a separate tab. The authenticated API independently returned the saved 2025 year and basis data successfully.

CloudFront had distribution-wide 403/404 substitutions that returned `/index.html` with HTTP 200. A read of a missing tracker year reproduced HTTP 200 `text/html` before the fix. Browser reuse of a previous substituted response was consistent with the failing page and absence of corresponding new year requests at the API. The client now explicitly uses `cache: 'no-store'` for mutable authenticated partnership data, bypassing previously cached responses. A malformed successful response becomes a typed error with a plain retry message on the K-1 workspace instead of an exposed JSON parser exception.

## Live changes

- Distribution `E3JSGITQ701ESZ`: removed the two global error substitutions and associated `project-jackson-production-static-spa-rewrite` only with the default static viewer-request behavior. API and health behaviors were preserved.
- The function rewrites extensionless static deep links, including trailing-slash routes, to `/index.html`. It leaves API paths, health, assets, and files alone. Its source matches `infra/aws/terraform/modules/edge/main.tf`. This is a scoped live routing repair, not activation of the other pending Terraform changes.
- Frontend: `assets/index-Blx3oSRB.js`, replacing `assets/index-T8e81Y6w.js`; CSS remains `assets/index-DCabQ5Dp.css`. The verified isolated frontend baseline was extended with only the partnership client and workspace error-message edits. The earlier currency/sign changes remain included.
- The old frontend was confirmed byte-for-byte identical to the live bundle before rebuilding. The new asset was conditionally created and the index conditionally replaced using the previous ETag. Old assets remain available.
- API revision 7 and worker revision 4 are unchanged. No K-1 amounts, calculated basis values, applications, or other financial records were written during this repair.
- Deployment artifacts and the prior frontend index are under `.artifacts/k1-basis-json-20260904/`. The distribution checkpoint retains only the changed fields and API behaviors; the temporary full update payload was removed after deployment.

## Verification

- Ten frontend client/workspace tests passed, covering current-year reads with browser cache bypass, malformed HTML responses, missing-year errors, and existing workspace actions.
- Twelve edge contract tests passed, including execution of the actual function source for static routes, trailing slashes, API paths, and assets.
- AWS's function test passed for both the static workspace deep link and the API year path before publication.
- Live static deep links return HTTP 200 with the new bundle.
- CloudFront reached `Deployed`; the full invalidation completed.
- Live authenticated 2025 and 2024 year requests return HTTP 200 JSON with basis data and private/no-store cache headers.
- A missing year now returns HTTP 404 JSON `TRACKER_NOT_FOUND`, also with private/no-store headers, rather than HTTP 200 HTML.
- Verification API sessions were logged out. Chrome's extension UI blocked the final visual check after the published update; server checks continued independently.

## Rollback

If needed, restore the saved frontend index with an ETag guard against overwriting a later deployment and invalidate CloudFront. Keep the static-only routing repair when rolling back the frontend: restoring the distribution-wide HTML substitutions would reintroduce the error. The saved distribution checkpoint contains the previous error substitutions and default function associations for emergency recovery without replacing unrelated distribution fields.

## AWS references

- [CloudFront custom error responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-response-code.html)
- [CloudFront function request structure and URI behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)
