# T003 dependency review

Reviewed **2026-09-28** on Windows with **Node 22.20.0 / npm 10.9.3**. This records dependency selection and local compatibility, not completed XLSX security, browser acceptance, or production readiness. No ingestion flag or deployment was changed.

## Selected versions

| Package | Scope / purpose | Exact pin | License / Node requirement | Maintenance observation |
|---|---|---|---|---|
| `yauzl` | API runtime; lazy ZIP entries and bounded entry streams | `3.4.0` | MIT; Node `>=12` | Released 2026-06-07; upstream repository is not archived. |
| `saxes` | API runtime; namespace-aware XML events retaining numeric text | `6.0.0` | ISC; Node `>=12.22.7` | Released 2021-11-07; upstream repository **is archived**, last reported push 2025-12-31. Accepted only with the containment and replacement conditions below. |
| `@types/yauzl` | API development; types for the selected ZIP API | `3.4.0` | MIT; declarations use existing Node types | Released 2026-06-13; DefinitelyTyped package for the matching API version. |
| `@playwright/test` | Web development; official browser test runner | `1.63.0` | Apache-2.0; Node `>=20` | Released 2026-09-04; Microsoft repository is not archived and reports activity on 2026-09-28. |

Version, publication, engine, repository, license and tarball-integrity fields were read directly from the npm registry: [yauzl](https://registry.npmjs.org/yauzl/3.4.0), [saxes](https://registry.npmjs.org/saxes/6.0.0), [yauzl types](https://registry.npmjs.org/@types%2Fyauzl/3.4.0), and [Playwright Test](https://registry.npmjs.org/@playwright%2Ftest/1.63.0). Repository maintenance flags were checked through the official [yauzl repository API](https://api.github.com/repos/thejoshwolfe/yauzl), [saxes repository API](https://api.github.com/repos/lddubeau/saxes), and [Playwright repository API](https://api.github.com/repos/microsoft/playwright). These are dated observations, not promises of future maintenance.

The added runtime closure is `yauzl -> pend 1.2.0` (MIT), plus `saxes -> xmlchars 2.2.0` (MIT, already present). The runner pins `playwright` and `playwright-core` to `1.63.0`, both Apache-2.0. `@types/yauzl` uses the existing Node declaration package. Exact tarball hashes and resolutions are in `package-lock.json`.

License text was checked against upstream and installed packages. Sources: [yauzl MIT license](https://github.com/thejoshwolfe/yauzl/blob/master/LICENSE), [saxes 6.0.0 tagged license](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE), and [Playwright license](https://github.com/microsoft/playwright/blob/main/LICENSE). The saxes source license includes its predecessor's ISC notice and a historical MIT attribution; GitHub's generic `NOASSERTION` classification does not replace this tagged license text. The published saxes tarball has license metadata but no standalone `LICENSE` file. Preserve its upstream notices in any redistributed artifact; release packaging must account for that omission rather than removing attribution.

## Selection and containment decision

Use yauzl's lazy-entry API with strict path handling and declared-size validation, then enforce the feature's own actual inflated-byte, entry, XML, cell and output limits. No archive extraction to filesystem paths is needed. Library validation alone is not a ZIP-bomb defense; the wrapper and terminable worker remain required. [Upstream ZIP API and limits](https://github.com/thejoshwolfe/yauzl)

The archived saxes dependency is a deliberate, limited choice. Its SAX event interface permits incremental namespace-aware parsing and preserves `<v>` content as text. This fits the required exact-number reader without first constructing a complete workbook/DOM or coercing money to JavaScript numbers. An archived repository provides no expectation of future fixes. The application must reject DTDs, propagate malformed-XML errors, impose independent work/size/depth bounds, avoid external resolution, and run the parser behind parent-enforced termination. saxes itself does not provide bounded event payload sizes. [Upstream SAX behavior and limitations](https://github.com/lddubeau/saxes)

Re-evaluate or replace saxes immediately if an affecting advisory appears, a hostile-input/conformance test fails, supported Node compatibility breaks, or a required correctness fix cannot be made available through a reviewed dependency. Keep XLSX ingestion disabled until the reader, worker termination, hostile-input and deployment-sized resource gates pass (T017-T020, T026-T027, T091-T092). A clean audit does not waive those gates. This review adds packages only; it does not claim that the wrapper or worker protections already exist.

Playwright Test is a development-only runner; no new production browser service or application dependency is added. The official installation guidance includes Node 22 and describes separate browser installation. T003 validates package loading/CLI only; T005 owns runner configuration and browser installation, and later tasks own actual upload/review/apply scenarios. [Playwright installation and requirements](https://playwright.dev/docs/intro)

## Advisory review

GitHub's official global advisory API was queried with `ecosystem=npm` and exact `affects` values for `yauzl@3.4.0`, `saxes@6.0.0`, `@playwright/test@1.63.0`, `playwright@1.63.0`, and `playwright-core@1.63.0`. All five returned zero affecting advisories at review time. Full npm audit additionally covers the resolved transitive graph. Query semantics: [GitHub global advisory API](https://docs.github.com/en/rest/security-advisories/global-advisories).

Known earlier issues were checked explicitly: [yauzl CVE-2026-31988](https://github.com/advisories/GHSA-gmq8-994r-jv83) affects 3.2.0 and is fixed from 3.2.1; selected 3.4.0 is outside its affected range. [Playwright CVE-2025-59288](https://github.com/advisories/GHSA-7mvr-c777-76hp) affects versions before 1.55.1; selected 1.63.0 is outside its affected range. No claim is made that absence from current advisories proves absence of vulnerabilities.

Before and after installation, the full workspace audit reports the **same one high-severity finding**: `js-yaml 4.3.1`, [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh), fixed in 4.3.2. `npm explain js-yaml` identifies the existing web development chain `eslint -> @eslint/eslintrc -> js-yaml`. This was not introduced by T003 and is not in the new dependency closure. It remains unresolved here because this task excludes unrelated upgrades. Do not report the full dependency audit as passing; track the existing finding in overall verification.

## Commands and results

| Check | Result |
|---|---|
| Registry metadata, tagged/source license review and GitHub repository/advisory API reads | Completed; maintenance limitation above is explicit. |
| Baseline `npm audit --json` | Exit 1; one existing high `js-yaml` development finding. |
| `npm install --ignore-scripts --no-audit --no-fund` after exact manifest edits | Passed. No lifecycle scripts or browser installer was invoked. |
| Lockfile package-record comparison against `HEAD` | Seven records added; zero existing versions, resolutions or integrity hashes changed; zero package records removed. |
| `npm ls yauzl saxes @types/yauzl @playwright/test playwright playwright-core --all` | Passed; API resolves saxes 6.0.0 while ExcelJS retains its existing saxes 5.0.1. |
| Node ZIP/XML smoke | Passed: API-scoped modules load; saxes preserves `9007199254740993.000000001` exactly as text; yauzl opens and iterates an empty synthetic ZIP with lazy entries, size checks and strict filenames. |
| `node node_modules/@playwright/test/cli.js --version` | Passed; `Version 1.63.0`. No browser journey claimed. |
| `npm run build:api` | Passed. |
| `npm run build:web` | Passed; Vite retains its large-chunk warning. |
| `npm run --workspace=web typecheck` | Failed on source/test diagnostics in unchanged files: missing shared-type imports, incomplete user/report fixtures, unsupported parameter properties under `erasableSyntaxOnly`, and report/review type errors. No diagnostic points to the selected ZIP/XML/Playwright packages. These repository checks are not represented as passing. |
| Post-install `npm audit --json` | Exit 1; the same one existing high `js-yaml` development finding, no added findings. |
| `npm run security:audit:runtime` | Passed; zero API-runtime and zero web-runtime findings. Its API-focused development result does not replace the full-workspace audit above. |

T003 is complete for dependency selection, exact pins and documented evidence. Application parsing, browser fixtures, new XLSX activation, inherited typecheck errors and the unrelated audit finding are separate work and remain subject to their own verification.
