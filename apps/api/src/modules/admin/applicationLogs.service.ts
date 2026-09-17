import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  type FilteredLogEvent,
} from '@aws-sdk/client-cloudwatch-logs'
import { config } from '../../config.js'

export interface ApplicationLogEvent {
  readonly id: string
  readonly source: string
  readonly timestamp: string
  readonly ingestedAt: string | null
  readonly message: string
}

export interface ApplicationLogResult {
  readonly available: boolean
  readonly source: 'cloudwatch' | 'unavailable'
  readonly events: readonly ApplicationLogEvent[]
  readonly failures: readonly string[]
  readonly checkedAt: string
  readonly refreshAfterSeconds: number
}

export interface ApplicationLogsClient {
  send(command: FilterLogEventsCommand): Promise<{
    events?: FilteredLogEvent[]
    nextToken?: string
  }>
}

const sensitiveKey = /authorization|cookie|password|secret|token|mfa|totp|email|ip(address)?|session|csrf|idempotency|presign|credential/i
const sensitiveValue = /(?:\bBearer\s+\S+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|X-Amz-(?:Algorithm|Credential|Date|Expires|Security-Token|Signature)|atlas_session=\S*)/gi

const redactStructuredValue = (value: unknown, depth = 0): unknown => {
  if (depth >= 5) return '[TRUNCATED]'
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.replace(sensitiveValue, '[REDACTED]').slice(0, 2_000)
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactStructuredValue(item, depth + 1))
  if (typeof value !== 'object') return String(value).slice(0, 2_000)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, item]) => [
        key.slice(0, 80),
        sensitiveKey.test(key) ? '[REDACTED]' : redactStructuredValue(item, depth + 1),
      ]),
  )
}

export const redactApplicationLogMessage = (message: string): string => {
  const bounded = message.slice(0, 8_000)
  try {
    return JSON.stringify(redactStructuredValue(JSON.parse(bounded))).slice(0, 4_000)
  } catch {
    return bounded.replace(sensitiveValue, '[REDACTED]').slice(0, 4_000)
  }
}

const sourceLabel = (logGroupName: string): string =>
  logGroupName.split('/').filter(Boolean).slice(-1)[0] ?? 'application'

let defaultClient: CloudWatchLogsClient | undefined
const clientForRuntime = (): CloudWatchLogsClient => {
  defaultClient ??= new CloudWatchLogsClient({ region: config.aws.region })
  return defaultClient
}

export const applicationLogsService = {
  async list(input: {
    sinceMinutes: number
    limit: number
    client?: ApplicationLogsClient
    now?: Date
    enabled?: boolean
    logGroups?: readonly string[]
  }): Promise<ApplicationLogResult> {
    const checkedAt = input.now ?? new Date()
    const logGroups = (input.logGroups ?? config.aws.applicationLogGroups).slice(0, 8)
    const enabled = input.enabled ?? config.aws.applicationLogViewEnabled
    if (!enabled || logGroups.length === 0) {
      return {
        available: false,
        source: 'unavailable',
        events: [],
        failures: [],
        checkedAt: checkedAt.toISOString(),
        refreshAfterSeconds: 15,
      }
    }

    const sinceMinutes = Math.min(60, Math.max(1, Math.floor(input.sinceMinutes)))
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit)))
    const perGroupLimit = Math.min(100, Math.max(10, Math.ceil(limit / logGroups.length)))
    const client = input.client ?? clientForRuntime()
    const responses = await Promise.all(logGroups.map(async (logGroupName) => {
      try {
        const response = await client.send(new FilterLogEventsCommand({
          logGroupName,
          startTime: checkedAt.getTime() - sinceMinutes * 60_000,
          endTime: checkedAt.getTime(),
          limit: perGroupLimit,
          startFromHead: false,
        }))
        return {
          logGroupName,
          events: response.events ?? [],
          failed: false,
        }
      } catch {
        return { logGroupName, events: [], failed: true }
      }
    }))

    const events = responses
      .flatMap(({ logGroupName, events: groupEvents }) => groupEvents.map((event, index) => ({
        id: event.eventId ?? `${sourceLabel(logGroupName)}-${event.timestamp ?? 0}-${index}`,
        source: sourceLabel(logGroupName),
        timestamp: new Date(event.timestamp ?? checkedAt.getTime()).toISOString(),
        ingestedAt: event.ingestionTime ? new Date(event.ingestionTime).toISOString() : null,
        message: redactApplicationLogMessage(event.message ?? ''),
      })))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, limit)

    return {
      available: true,
      source: 'cloudwatch',
      events,
      failures: responses.filter((response) => response.failed).map((response) => sourceLabel(response.logGroupName)),
      checkedAt: checkedAt.toISOString(),
      refreshAfterSeconds: 15,
    }
  },
}
