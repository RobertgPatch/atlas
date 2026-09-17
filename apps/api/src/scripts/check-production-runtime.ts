// Run as a short-lived ECS task with the candidate image and its real secret
// references. No migrations, bootstrap, provider work, or business reads.
export {}
let database: { end: () => Promise<void> } | undefined
try {
  const { config } = await import('../config.js')
  const { pool } = await import('../infra/db/client.js')
  if (!pool) throw new Error('DATABASE_REQUIRED')
  database = pool
  await pool.query('select 1')
  const migrations = await pool.query<{ filename: string }>('select filename from schema_migrations order by filename')
  console.log(JSON.stringify({ status: 'ready', role: config.processRole, migrations: migrations.rows.map(row => row.filename) }))
} catch (error) {
  const exception = error as { code?: string; message?: string }
  console.error(JSON.stringify({ status: 'failed', code: exception.code ?? 'RUNTIME_CONFIGURATION_FAILED',
    setting: /^Invalid ([A-Z0-9_]+)/.exec(exception.message ?? '')?.[1],
    identity: /bootstrap password|ADMIN_PASSWORD|SUPER_ADMIN_PASSWORD|Production (?:human|primary|super)/.test(exception.message ?? '') ? 'bootstrap-identity-settings' : undefined }))
  process.exitCode = 1
} finally {
  await database?.end()
}
