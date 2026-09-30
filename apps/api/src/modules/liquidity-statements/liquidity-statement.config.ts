export function buildLiquidityCsvConfig(env: Readonly<Record<string, string | undefined>>, production = false) {
  const flag = (name: string, fallback: boolean) => {
    const value = env[name]
    if (value === undefined) return fallback
    if (value !== 'true' && value !== 'false') throw new Error(`${name}: expected true or false`)
    return value === 'true'
  }
  const integer = (name: string, fallback: number, ceiling = fallback) => {
    const value = env[name] ?? String(fallback)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > ceiling) throw new Error(`${name}: invalid bounded integer`)
    return Number(value)
  }
  const uploadsEnabled = flag('LIQUIDITY_CSV_UPLOADS_ENABLED', !production)
  const parsingEnabled = flag('LIQUIDITY_CSV_PARSING_ENABLED', !production)
  const applyEnabled = flag('LIQUIDITY_CSV_APPLY_ENABLED', !production)
  const xlsxEnabled = flag('LIQUIDITY_XLSX_ENABLED', false)
  const objectStore = env.LIQUIDITY_CSV_OBJECT_STORE ?? (production ? 's3' : 'local')
  if (!['local', 's3'].includes(objectStore) || production && objectStore !== 's3' || !production && objectStore !== 'local') throw new Error('LIQUIDITY_CSV_OBJECT_STORE: invalid runtime boundary')
  const bucket = env.LIQUIDITY_CSV_S3_BUCKET ?? ''
  const kmsKeyArn = env.LIQUIDITY_CSV_KMS_KEY_ARN ?? ''
  const region = env.LIQUIDITY_CSV_S3_REGION ?? env.AWS_REGION ?? 'us-west-1'
  if (production && (uploadsEnabled || parsingEnabled) && (!bucket || !kmsKeyArn)) throw new Error('LIQUIDITY_CSV_STORAGE_REQUIRED')
  return { uploadsEnabled, parsingEnabled, applyEnabled, xlsxEnabled, objectStore: objectStore as 'local' | 's3', bucket, kmsKeyArn, region,
    maxBytes: integer('LIQUIDITY_CSV_MAX_BYTES', 10485760),
    maxRows: integer('LIQUIDITY_CSV_MAX_ROWS', 5000),
    maxAccounts: integer('LIQUIDITY_STATEMENT_MAX_ACCOUNTS',100),
    maxColumns: integer('LIQUIDITY_CSV_MAX_COLUMNS', 128),
    maxRecordBytes: integer('LIQUIDITY_CSV_MAX_RECORD_BYTES', 65536),
    maxFieldBytes: integer('LIQUIDITY_CSV_MAX_FIELD_BYTES', 16384),
    maxMetadataRecords: integer('LIQUIDITY_CSV_MAX_METADATA_RECORDS', 100),
    maxTotalRecords: integer('LIQUIDITY_STATEMENT_MAX_RECORDS',10_000),
    maxInflatedBytes: integer('LIQUIDITY_XLSX_MAX_INFLATED_BYTES',64*1024*1024),
    maxXmlEntryBytes: integer('LIQUIDITY_XLSX_MAX_XML_ENTRY_BYTES',32*1024*1024),
    maxZipEntries: integer('LIQUIDITY_XLSX_MAX_ZIP_ENTRIES',256),
    maxWorksheets: integer('LIQUIDITY_XLSX_MAX_WORKSHEETS',16),
    maxPopulatedCells: integer('LIQUIDITY_XLSX_MAX_POPULATED_CELLS',250_000),
    maxSharedStrings: integer('LIQUIDITY_XLSX_MAX_SHARED_STRINGS',100_000),
    maxDecodedStringBytes: integer('LIQUIDITY_XLSX_MAX_DECODED_STRING_BYTES',16*1024*1024),
    maxStyles: integer('LIQUIDITY_XLSX_MAX_STYLES',10_000),
    maxRelationships: integer('LIQUIDITY_XLSX_MAX_RELATIONSHIPS',2_000),
    maxXmlDepth: integer('LIQUIDITY_XLSX_MAX_XML_DEPTH',64),
    maxXmlAttributes: integer('LIQUIDITY_XLSX_MAX_XML_ATTRIBUTES',64),
    maxXmlNameBytes: integer('LIQUIDITY_XLSX_MAX_XML_NAME_BYTES',256),
    maxWorkerOutputBytes: integer('LIQUIDITY_STATEMENT_MAX_WORKER_OUTPUT_BYTES',32*1024*1024),
    workerOldGenerationMb: integer('LIQUIDITY_STATEMENT_WORKER_OLD_GENERATION_MB',256),
    maxDecimalTokenBytes: integer('LIQUIDITY_STATEMENT_MAX_DECIMAL_TOKEN_BYTES',256),
    maxDecimalExponent: integer('LIQUIDITY_STATEMENT_MAX_DECIMAL_EXPONENT',100),
    parseConcurrency: integer('LIQUIDITY_CSV_PARSE_CONCURRENCY', 1), parseTimeoutMs: integer('LIQUIDITY_CSV_PARSE_TIMEOUT_MS', 30000), maxRetries: integer('LIQUIDITY_CSV_MAX_RETRIES', 2), filesPer30Days: integer('LIQUIDITY_CSV_FILES_PER_30_DAYS', 200, 1000), capabilitiesPerHour: integer('LIQUIDITY_CSV_CAPABILITIES_PER_HOUR', 10, 100), maxQueuedJobs: integer('LIQUIDITY_CSV_MAX_QUEUED_JOBS', 20, 100), maxOutstandingCapabilities: integer('LIQUIDITY_CSV_MAX_OUTSTANDING_CAPABILITIES', 10, 100), capabilityTtlSeconds: 900, previewTtlSeconds: 900,
  }
}
