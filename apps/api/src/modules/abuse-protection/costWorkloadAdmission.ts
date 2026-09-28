import { randomUUID } from "node:crypto";

import { config } from "../../config.js";
import { admissionService } from "./admission.service.js";
import { idempotencyService } from "./idempotency.service.js";
import { defaultRouteProtectionPolicy } from "./policy.defaults.js";
import {
  fingerprintSubjectAliases,
  fingerprintSubject,
  type CanonicalFingerprintValue,
} from "./subjectFingerprint.js";
import type { HttpMethod } from "./protection.types.js";
import { requireWorkloadAdmission } from "./workloadAdmission.js";
import { cloudWatchAbuseObservability } from "./abuseObservability.js";
import { reserveBdaCostCents } from "./bdaCostReservation.js";
import {
  authorizeSubjectResources,
  createServiceSubjectContext,
  createValidatedSubjectContext,
  type AuthorizedResourceScope,
  type ValidatedSubjectContext,
} from "./subjectContext.js";

export interface CostWorkloadAdmissionInput {
  readonly workloadKey: string;
  readonly method: HttpMethod;
  readonly routePattern: string;
  readonly subjectContext: ValidatedSubjectContext;
  readonly canonicalInputs: CanonicalFingerprintValue;
  readonly globalDailyLimit: number;
  readonly units?: number;
  /** Page count read from the validated, persisted PDF; never request metadata. */
  readonly bdaPageCount?: number | null;
  readonly leaseTtlSeconds?: number;
  readonly controlKey?: string;
  readonly quotas?: readonly {
    readonly workloadKey?: string;
    readonly scopeKind: "account" | "user" | "entity" | "document" | "provider" | "global";
    /** Required only for an authorization-resolved additional resource subject. */
    readonly authorizedScopeValue?: string;
    readonly limit: number;
    readonly units?: number;
    readonly periodKind?: "rolling_hour" | "utc_day" | "billing_month";
  }[];
}

export interface CostWorkloadOperation {
  readonly operationId: string | null;
  readonly fencingToken: bigint | null;
  succeed(resultReference?: string): Promise<void>;
  fail(failureCode?: string): Promise<void>;
}

export const authorizeCostSubjects = (
  context: ValidatedSubjectContext | undefined,
  authorizedResources: Readonly<Partial<Record<AuthorizedResourceScope, string>>> = {},
): ValidatedSubjectContext => {
  if (!context) throw new Error("COST_ADMISSION_VALIDATED_SESSION_SUBJECT_REQUIRED");
  return authorizeSubjectResources(
    context,
    config.abuseProtection.hmac.keyring,
    authorizedResources,
  );
};

export const createServiceCostSubjects = (
  serviceId: string,
  operationId: string,
  authorizedResources: Readonly<Partial<Record<AuthorizedResourceScope, string>>> = {},
): ValidatedSubjectContext => createServiceSubjectContext({
  serviceId,
  operationId,
  deploymentTenantId: config.abuseProtection.deploymentTenantId,
  environment: config.nodeEnv,
  keyring: config.abuseProtection.hmac.keyring,
  authorizedResources,
});

export const createBackgroundCostSubjects = (
  authorizedUserId: string,
  operationId: string,
  authorizedResources: Readonly<Partial<Record<AuthorizedResourceScope, string>>> = {},
): ValidatedSubjectContext => createValidatedSubjectContext({
  userId: authorizedUserId,
  sessionId: `background:${operationId}`,
  deploymentTenantId: config.abuseProtection.deploymentTenantId,
  environment: config.nodeEnv,
  keyring: config.abuseProtection.hmac.keyring,
  authorizedResources,
});

/**
 * Runs synchronous admitted work and always closes its durable operation and
 * capacity lease. Prefer this helper when the work is completed in the same
 * request/process; queued work must carry the returned operation handle to its
 * worker and close it there instead.
 */
export const runCostWorkload = async <T>(
  input: CostWorkloadAdmissionInput,
  work: () => Promise<T>,
): Promise<T> => {
  const operation = await admitCostWorkload(input);
  try {
    const result = await work();
    await operation.succeed();
    return result;
  } catch (error) {
    await operation.fail();
    throw error;
  }
};

const terminalOperation = (
  operationId: string | undefined,
  fencingToken: bigint | undefined,
): CostWorkloadOperation => {
  let started = false;
  let terminal = false;
  const start = async () => {
    if (!operationId || started) return;
    await idempotencyService.markQueued({ operationId });
    await idempotencyService.markRunning({ operationId });
    started = true;
  };
  return {
    operationId: operationId ?? null,
    fencingToken: fencingToken ?? null,
    async succeed(
      resultReference = `operation://${operationId ?? "untracked"}/succeeded`,
    ) {
      if (!operationId || terminal) return;
      await start();
      await idempotencyService.markSucceeded({ operationId, resultReference });
      terminal = true;
    },
    async fail(failureCode = "WORKLOAD_FAILED") {
      if (!operationId || terminal) return;
      await start();
      await idempotencyService.markFailed({ operationId, failureCode });
      terminal = true;
    },
  };
};

interface MonthlyCostProfile {
  readonly familyKey: string;
  readonly familyLimit: number;
  readonly maximumCentsPerUnit: number;
}

const monthlyCostProfile = (workloadKey: string, bdaPageCount?: number | null): MonthlyCostProfile | null => {
  const monthly = config.abuseProtection.quotas.monthlyCost;
  const attempts = config.abuseProtection.retryBudgets;
  switch (workloadKey) {
    case "k1_bda_provider_call":
      return {
        familyKey: "k1_bda_document",
        familyLimit: monthly.k1BdaProviderCalls,
        maximumCentsPerUnit: reserveBdaCostCents(
          bdaPageCount,
          config.k1Ingestion.uploadMaxPages,
          attempts.bdaMaximumAttempts,
        ),
      };
    case "k1_bedrock_checkbox":
      return {
        familyKey: "k1_bedrock_checkbox",
        familyLimit: monthly.k1CheckboxCalls,
        maximumCentsPerUnit: 25 * attempts.bedrockCheckboxMaximumAttempts,
      };
    case "market_data_closing_prices":
      return {
        familyKey: "market_provider_call",
        familyLimit: monthly.marketProviderCalls,
        maximumCentsPerUnit: 5 * attempts.marketDataMaximumAttempts,
      };
    case "report_export":
    case "consolidated_holdings_export":
    case "k1_csv_export":
      return {
        familyKey: "report_export",
        familyLimit: monthly.reportExports,
        maximumCentsPerUnit: 5,
      };
    case "market_price_backfill":
      return {
        familyKey: "market_price_backfill",
        familyLimit: monthly.backfillRuns,
        maximumCentsPerUnit: 200,
      };
    default:
      return null;
  }
};

const providerSubjectRequired = (workloadKey: string): boolean =>
  /(?:bda|bedrock|market_data|market_provider)/.test(workloadKey);

const requireSubjectHash = (
  context: ValidatedSubjectContext,
  scope: "user" | "session" | "tenant" | "account" | "entity" | "document" | "provider" | "global",
): Uint8Array => {
  const hash = context.activeHashes[scope];
  if (!hash) throw new Error(`COST_ADMISSION_${scope.toUpperCase()}_SUBJECT_REQUIRED`);
  return hash;
};

export const admitCostWorkload = async (
  input: CostWorkloadAdmissionInput,
): Promise<CostWorkloadOperation> => {
  const basePolicy = defaultRouteProtectionPolicy(
    input.method,
    input.routePattern,
  );
  // Upload completion already reserves the document-admission daily rate.
  // Provider stages retain the same ceiling, but must not consume that same
  // counter again (the last admitted document would otherwise never run).
  const providerRateKey = input.workloadKey === "k1_bda_provider_call"
    ? "k1.bda-provider.global"
    : input.workloadKey === "k1_bedrock_checkbox"
      ? "k1.checkbox-provider.global"
      : null;
  const workloadPolicy = providerRateKey === null ? basePolicy : {
    ...basePolicy,
    durableRates: basePolicy.durableRates.map(rate =>
      rate.policyLimitKey === "k1.extraction.global"
        ? { ...rate, policyLimitKey: providerRateKey }
        : rate),
  };
  const policy =
    input.controlKey === undefined
      ? workloadPolicy
      : { ...workloadPolicy, killSwitch: input.controlKey };
  const subject = (
    scope:
      | "user"
      | "session"
      | "account"
      | "tenant"
      | "entity"
      | "document"
      | "provider"
      | "operation"
      | "global",
    value: string,
  ) =>
    fingerprintSubject(config.abuseProtection.hmac.activeKey, { scope, value });
  const aliasesFor = (
    scope: "account" | "user" | "entity" | "document" | "provider" | "global",
    authorizedScopeValue?: string,
  ) => {
    const aliases = authorizedScopeValue
      ? fingerprintSubjectAliases(config.abuseProtection.hmac.keyring, {
          scope,
          value: authorizedScopeValue,
        })
      : input.subjectContext.aliases[scope]
    if (!aliases?.[0]) throw new Error(`COST_ADMISSION_${scope.toUpperCase()}_SUBJECT_REQUIRED`);
    return aliases;
  };
  const principalHash = requireSubjectHash(input.subjectContext, "user");
  const sessionHash = requireSubjectHash(input.subjectContext, "session");
  const tenantHash = requireSubjectHash(input.subjectContext, "tenant");
  const globalHash = requireSubjectHash(input.subjectContext, "global");
  if (providerSubjectRequired(input.workloadKey)) {
    requireSubjectHash(input.subjectContext, "provider");
  }
  const units = input.units ?? 1;
  const costProfile = monthlyCostProfile(input.workloadKey, input.bdaPageCount);
  const monthlyCostQuotas =
    costProfile === null
      ? []
      : [
          {
            workloadKey: `cost-family:${costProfile.familyKey}`,
            scopeKind: "global" as const,
            periodKind: "billing_month" as const,
            units,
            limit: costProfile.familyLimit,
          },
          {
            workloadKey: "cost-budget:paid-workload-cents",
            scopeKind: "global" as const,
            periodKind: "utc_day" as const,
            units: costProfile.maximumCentsPerUnit * units,
            limit: config.abuseProtection.quotas.dailyCost.maximumCents,
          },
          {
            workloadKey: "cost-budget:paid-workload-cents",
            scopeKind: "global" as const,
            periodKind: "billing_month" as const,
            units: costProfile.maximumCentsPerUnit * units,
            limit: config.abuseProtection.quotas.monthlyCost.maximumCents,
          },
        ];
  const reservedUnits = Object.fromEntries(
    policy.costUnits.map((unit) => [unit, units]),
  );
  const decision = await admissionService.admit({
    policy,
    requestId: `cost-${randomUUID()}`,
    subjectHashes: {
      user: principalHash,
      session: sessionHash,
      tenant: tenantHash,
      ...(input.subjectContext.activeHashes.account
        ? { account: input.subjectContext.activeHashes.account }
        : {}),
      ...(input.subjectContext.activeHashes.entity
        ? { entity: input.subjectContext.activeHashes.entity }
        : {}),
      ...(input.subjectContext.activeHashes.provider
        ? { provider: input.subjectContext.activeHashes.provider }
        : {}),
      operation: subject("operation", JSON.stringify(input.canonicalInputs)),
      global: globalHash,
    },
    subjectHashAliases: Object.fromEntries(Object.entries(input.subjectContext.aliases).map(
      ([scope, aliases]) => [scope, aliases?.slice(1).map((alias) => alias.digest)],
    )),
    workload: {
      workloadKey: input.workloadKey,
      idempotency: {
        principalHash,
        previousPrincipalHashes: input.subjectContext.aliases.user
          ?.slice(1)
          .map((alias) => alias.digest),
        canonicalRequest: {
          policyKey: policy.policyKey,
          method: policy.method,
          routePattern: policy.routePattern,
          inputs: input.canonicalInputs,
        },
        reservedUnits,
      },
      quotas: [
        ...(input.quotas ?? [
          {
            scopeKind: "global" as const,
            limit: input.globalDailyLimit,
          },
        ]),
        ...monthlyCostQuotas,
      ].map((quota) => {
        const authorizedScopeValue = "authorizedScopeValue" in quota
          ? quota.authorizedScopeValue
          : undefined;
        const aliases = aliasesFor(quota.scopeKind, authorizedScopeValue);
        return {
          workloadKey: quota.workloadKey,
          scopeKind: quota.scopeKind,
          scopeHash: aliases[0]!.digest,
          scopeHashAliases: aliases.slice(1).map((alias) => alias.digest),
          periodKind: quota.periodKind ?? "utc_day",
          units: quota.units ?? units,
          limit: quota.limit,
        };
      }),
      leaseScopeKind: "global",
      leaseScopeHash: globalHash,
      leaseTtlSeconds: input.leaseTtlSeconds ?? 60,
      backlogLimit:
        policy.backlogLimit ?? Math.max(policy.concurrencyLimit ?? 1, 1),
    },
  });

  cloudWatchAbuseObservability.record({
    decision:
      decision.decision === "quota_rejected"
        ? "quota_rejected"
        : decision.decision === "protection_unavailable"
          ? "failed"
          : decision.decision,
    policyKey: policy.policyKey,
    routeClass: policy.routeClass,
    scopeKind: "user",
    workloadKey: input.workloadKey,
    reasonCode: "reasonCode" in decision ? decision.reasonCode : undefined,
    environment: config.nodeEnv,
    units,
    requestId: decision.requestId,
  });

  // Existing unit tests intentionally run without PostgreSQL. Production paid
  // work remains fail-closed, while that isolated test configuration can keep
  // exercising provider adapters without an admission database.
  const admissionWasTestMocked = Boolean(
    (
      admissionService.admit as typeof admissionService.admit & {
        _isMockFunction?: boolean;
      }
    )._isMockFunction,
  );
  if (
    config.nodeEnv === "test" &&
    decision.decision === "protection_unavailable" &&
    !admissionWasTestMocked
  )
    return terminalOperation(undefined, undefined);
  const allowed = requireWorkloadAdmission(decision);
  return terminalOperation(allowed.operationId, allowed.fencingToken);
};
