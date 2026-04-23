# Phase 1 Data Model: Azure DI → K1FieldValueRecord Mapping

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)
**Scope**: This feature has **no database schema change**. The "data model" here is the application-level mapping between the Azure DI `AnalyzeResult` and our existing `K1FieldValueRecord` + `K1IssueRecord` entities.

## Existing entities (reused, unchanged)

- `K1FieldValueRecord` — defined in `apps/api/src/modules/review/review.repository.ts`. Fields: `id`, `k1DocumentId`, `fieldName`, `label`, `section` (`entityMapping` | `partnershipMapping` | `core`), `required`, `rawValue`, `originalValue`, `normalizedValue`, `reviewerCorrectedValue`, `confidenceScore`, `sourceLocation`, `reviewStatus`, `updatedAt`.
- `K1IssueRecord` — defined in `apps/api/src/modules/k1/k1.repository.ts`. Fields: `id`, `k1DocumentId`, `issueType`, `severity`, `status`, `message`, `k1FieldValueId?`, etc.
- `K1SourceLocation` — `{ page: number, bbox: [number, number, number, number] }` (PDF points, origin top-left, width/height in points).

## New constant: `azureFieldMap`

A typed array exported from `apps/api/src/modules/k1/extraction/azureFieldMap.ts`. Each entry connects one canonical K-1 field to its Azure DI field path in the `prebuilt-tax.us.1065SchK1` model.

```ts
export type K1FieldSection = 'entityMapping' | 'partnershipMapping' | 'core'

export type K1AzureValueKind =
  | 'string'
  | 'number'     // integers and plain numerics
  | 'currency'   // stored as string with 2-decimal precision (matches DB NUMERIC)
  | 'percentage' // stored as string "99.9999" (matches partner share ending %)
  | 'date'       // ISO YYYY-MM-DD
  | 'boolean'

export interface AzureFieldMapEntry {
  /** Canonical snake_case identifier; unique across the map. */
  canonicalName: string
  /** Human-facing label rendered in the review workspace. */
  label: string
  /** Which review section the field lives in. */
  section: K1FieldSection
  /** Whether the field must be present and non-null before approval. */
  required: boolean
  /** Dotted path into AnalyzeResult.documents[0].fields */
  azurePath: string
  /** How to project the Azure DocumentField into the stored string. */
  valueKind: K1AzureValueKind
}
```

### Coverage (minimum V1 set; matches SC-001)

| Canonical name                           | Section            | Required | Azure path (`AnalyzeResult.documents[0].fields.*`)                                   | Value kind   |
| ---------------------------------------- | ------------------ | -------- | ------------------------------------------------------------------------------------ | ------------ |
| `partnership_ein`                        | partnershipMapping | true     | `Partnership.Identifier.Tin`                                                          | string       |
| `partnership_name`                       | partnershipMapping | true     | `Partnership.Name`                                                                    | string       |
| `partnership_address`                    | partnershipMapping | false    | `Partnership.Address`                                                                 | string       |
| `irs_center`                             | partnershipMapping | false    | `Partnership.IRSCenter`                                                               | string       |
| `is_publicly_traded`                     | partnershipMapping | false    | `Partnership.IsPubliclyTradedPartnership`                                             | boolean      |
| `partner_tin`                            | entityMapping      | true     | `Partner.Identifier.Tin`                                                              | string       |
| `partner_name`                           | entityMapping      | true     | `Partner.Name`                                                                        | string       |
| `partner_address`                        | entityMapping      | false    | `Partner.Address`                                                                     | string       |
| `partner_entity_type`                    | entityMapping      | false    | `Partner.EntityType`                                                                  | string       |
| `is_general_partner`                     | entityMapping      | false    | `Partner.IsGeneralPartnerOrLLCMemberManager`                                          | boolean      |
| `is_domestic_partner`                    | entityMapping      | false    | `Partner.IsDomesticPartner`                                                           | boolean      |
| `profit_share_beginning`                 | entityMapping      | false    | `Partner.Profit.Beginning`                                                            | percentage   |
| `profit_share_ending`                    | entityMapping      | true     | `Partner.Profit.Ending`                                                               | percentage   |
| `loss_share_beginning`                   | entityMapping      | false    | `Partner.Loss.Beginning`                                                              | percentage   |
| `loss_share_ending`                      | entityMapping      | true     | `Partner.Loss.Ending`                                                                 | percentage   |
| `capital_share_beginning`                | entityMapping      | false    | `Partner.Capital.Beginning`                                                           | percentage   |
| `capital_share_ending`                   | entityMapping      | true     | `Partner.Capital.Ending`                                                              | percentage   |
| `liab_nonrecourse_beginning`             | entityMapping      | false    | `Partner.Liabilities.Nonrecourse.Beginning`                                           | currency     |
| `liab_nonrecourse_ending`                | entityMapping      | false    | `Partner.Liabilities.Nonrecourse.Ending`                                              | currency     |
| `liab_qualified_nonrecourse_beginning`   | entityMapping      | false    | `Partner.Liabilities.QualifiedNonrecourse.Beginning`                                  | currency     |
| `liab_qualified_nonrecourse_ending`      | entityMapping      | false    | `Partner.Liabilities.QualifiedNonrecourse.Ending`                                     | currency     |
| `liab_recourse_beginning`                | entityMapping      | false    | `Partner.Liabilities.Recourse.Beginning`                                              | currency     |
| `liab_recourse_ending`                   | entityMapping      | false    | `Partner.Liabilities.Recourse.Ending`                                                 | currency     |
| `capital_beginning`                      | entityMapping      | false    | `Partner.CapitalAccount.BeginningCapital`                                             | currency     |
| `capital_contributed`                    | entityMapping      | false    | `Partner.CapitalAccount.CapitalContributed`                                           | currency     |
| `capital_current_year_net_income`        | entityMapping      | false    | `Partner.CapitalAccount.CurrentYearNetIncome`                                         | currency     |
| `capital_other_increase_decrease`        | entityMapping      | false    | `Partner.CapitalAccount.OtherIncreaseOrDecrease`                                      | currency     |
| `capital_withdrawals_distributions`      | entityMapping      | false    | `Partner.CapitalAccount.WithdrawalsAndDistributions`                                  | currency     |
| `capital_ending`                         | entityMapping      | false    | `Partner.CapitalAccount.EndingCapital`                                                | currency     |
| `box_1_ordinary_income`                  | core               | true     | `PartIII.OrdinaryBusinessIncome`                                                      | currency     |
| `box_2_net_rental_real_estate`           | core               | false    | `PartIII.NetRentalRealEstateIncome`                                                   | currency     |
| `box_3_other_net_rental`                 | core               | false    | `PartIII.OtherNetRentalIncome`                                                        | currency     |
| `box_4a_guaranteed_payments_services`    | core               | false    | `PartIII.GuaranteedPaymentsServices`                                                  | currency     |
| `box_4b_guaranteed_payments_capital`     | core               | false    | `PartIII.GuaranteedPaymentsCapital`                                                   | currency     |
| `box_4c_total_guaranteed_payments`       | core               | false    | `PartIII.TotalGuaranteedPayments`                                                     | currency     |
| `box_5_interest_income`                  | core               | false    | `PartIII.InterestIncome`                                                              | currency     |
| `box_6a_ordinary_dividends`              | core               | false    | `PartIII.OrdinaryDividends`                                                           | currency     |
| `box_6b_qualified_dividends`             | core               | false    | `PartIII.QualifiedDividends`                                                          | currency     |
| `box_6c_dividend_equivalents`            | core               | false    | `PartIII.DividendEquivalents`                                                         | currency     |
| `box_7_royalties`                        | core               | false    | `PartIII.Royalties`                                                                   | currency     |
| `box_8_net_short_term_capital_gain`      | core               | false    | `PartIII.NetShortTermCapitalGain`                                                     | currency     |
| `box_9a_net_long_term_capital_gain`      | core               | false    | `PartIII.NetLongTermCapitalGain`                                                      | currency     |
| `box_9b_collectibles_gain`               | core               | false    | `PartIII.CollectiblesGain`                                                            | currency     |
| `box_9c_unrecaptured_1250_gain`          | core               | false    | `PartIII.UnrecapturedSection1250Gain`                                                 | currency     |
| `box_10_net_section_1231_gain`           | core               | false    | `PartIII.NetSection1231Gain`                                                          | currency     |
| `box_11_other_income`                    | core               | false    | `PartIII.OtherIncome`                                                                 | currency     |
| `box_12_section_179_deduction`           | core               | false    | `PartIII.Section179Deduction`                                                         | currency     |
| `box_13_other_deductions`                | core               | false    | `PartIII.OtherDeductions`                                                             | currency     |
| `box_14_self_employment_earnings`        | core               | false    | `PartIII.SelfEmploymentEarnings`                                                      | currency     |
| `box_15_credits`                         | core               | false    | `PartIII.Credits`                                                                     | currency     |
| `box_16_schedule_k3_attached`            | core               | false    | `PartIII.ScheduleK3Attached`                                                          | boolean      |
| `box_17_amt_items`                       | core               | false    | `PartIII.AlternativeMinimumTaxItems`                                                  | currency     |
| `box_18_tax_exempt_income`               | core               | false    | `PartIII.TaxExemptIncomeAndNondeductibleExpenses`                                     | currency     |
| `box_19_distributions`                   | core               | true     | `PartIII.Distributions`                                                               | currency     |
| `box_20_other_information`               | core               | false    | `PartIII.OtherInformation`                                                            | string       |
| `box_21_foreign_taxes`                   | core               | false    | `PartIII.ForeignTaxesPaidOrAccrued`                                                   | currency     |

**Notes**:

- Azure field names listed above follow Microsoft's `tax.us.1065SchK1` schema naming. If any name drifts between API versions, the contract test will fail loudly because the mapper returns `rawValue: null` for unknown paths.
- Fields marked `required: true` participate in the approve-readiness gate already enforced by `session.handler.ts` (which checks `f.required && !(reviewerCorrectedValue ?? normalizedValue ?? rawValue)`).

## Mapping rules (implemented in `mapAzureAnalyzeResult`)

Input: `AnalyzeResult` (Azure DI SDK type), plus `ctx = { k1DocumentId }`.
Output: `ExtractResult` matching the existing `K1Extractor` interface.

### For each `AzureFieldMapEntry`:

1. Resolve `documentField = get(AnalyzeResult.documents[0].fields, entry.azurePath)`. If unresolved: treat as missing (step 3).
2. Project the `DocumentField` into a string based on `entry.valueKind`:
    - `string` → `documentField.valueString ?? documentField.content ?? null`
    - `number` → `String(documentField.valueNumber)` or null
    - `currency` → format `documentField.valueCurrency.amount` to exactly 2 decimals: `Number(amount).toFixed(2)`
    - `percentage` → `Number(documentField.valueNumber).toFixed(6)` (matches the six-decimal precision shown on the K-1 sample: `3.032900`)
    - `date` → ISO-8601 `YYYY-MM-DD` from `documentField.valueDate`
    - `boolean` → `documentField.valueBoolean ? 'true' : 'false'`
3. Compute `confidenceScore = documentField?.confidence ?? null`.
4. Compute `sourceLocation`:
    - If `documentField?.boundingRegions?.length > 0`:
      - `page = boundingRegions[0].pageNumber`
      - Convert polygon (inches) to bbox (points): multiply each polygon value by 72, take `[minX, minY, maxX-minX, maxY-minY]`.
    - Else `null`.
5. Compose `K1FieldValueRecord` insert payload:
    - `fieldName = entry.canonicalName`
    - `label = entry.label`
    - `section = entry.section`
    - `required = entry.required`
    - `rawValue = originalValue = normalizedValue = <projected string or null>`
    - `reviewerCorrectedValue = null`
    - `confidenceScore`, `sourceLocation` as above
    - `reviewStatus = 'PENDING'`
6. If `entry.required && rawValue == null`: append `MISSING_FIELD` issue (severity `MEDIUM`, message `Required field "{label}" was not extracted from the PDF.`).
7. If `confidenceScore != null && confidenceScore < 0.5`: append `LOW_CONFIDENCE` issue (severity `LOW`, message `Field "{label}" extracted with low confidence (score = {score}).`).

### `nextStatus` logic

```text
nextStatus = (issues.length > 0 || any required rawValue == null) ? 'NEEDS_REVIEW' : 'READY_FOR_APPROVAL'
```

Matches the existing stub contract exactly.

## Validation invariants (invariant asserts inside `mapAzureAnalyzeResult`)

- Every returned `fieldValues[i].fieldName` MUST be unique within the call (enforced by a `Set<string>` during mapping).
- Every returned `fieldValues[i].section` MUST be one of the three allowed values.
- Every `confidenceScore` MUST be `null | [0, 1]`.
- Every `sourceLocation` MUST be `null | { page ≥ 1, bbox: [x≥0, y≥0, w>0, h>0] }`.

## Out of scope for the data model

- Storing the raw `AnalyzeResult` JSON. V1 stores only mapped field records; re-extraction requires re-submission to Azure DI.
- Azure DI's unstructured "statements" (the attached-statement references like `SEE STMT`). These surface as the field's raw content string (e.g., `"SEE STMT"`) and are carried through as-is; the reviewer edits them manually.
- Multi-PDF batch attachments. Only the first document in `AnalyzeResult.documents[0]` is mapped.
