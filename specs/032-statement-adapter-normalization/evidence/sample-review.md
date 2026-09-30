# Authorized sample structure review

On 2026-09-28, the three user-authorized local examples were passed through the bounded reader, structural registry, adapter, normalization, and reconciliation path. No statement was applied and no source contents, filenames, identifiers, values, screenshots, or raw rows were added to Git.

| Sample | Structural result |
|---|---|
| Authorized sample 1 | CSV; Merrill adapter; one complete account; 5 positions; all 6 records accounted; no blocking finding |
| Authorized sample 2 | CSV; Schwab adapter; one complete account; 20 positions; all 24 records accounted; incomplete-basis/partial-control warnings only; no blocking finding |
| Authorized sample 3 | XLSX; Morgan Stanley adapter; one complete account; 9 positions; all 32 records accounted; missing-basis/partial-control warnings only; no blocking finding |

The review found two correctness defects before the final result: XLSX source numeric lexemes with more precision than the displayed format were being rejected, and an undeclared partial Schwab footer was being treated as a proven subset. The implementation now performs exact lexical quantization using the workbook display scale and treats an undeclared partial footer as informational/unknown rather than a blocking known-subset mismatch. Synthetic regressions cover both behaviors.
