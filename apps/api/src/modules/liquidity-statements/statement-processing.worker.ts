import { parentPort } from 'node:worker_threads'

interface WorkerRequest {
  source: Uint8Array
  sourceHash: string
  recipe: Record<string, any>
  limits?: Record<string, string>
  config?: Record<string, number>
  mappingProfile?: unknown
  testBehavior?: 'STALL' | 'ECHO'
}

const readerIdentities = new Set(['bounded_csv@1.0.0', 'bounded_ooxml_xlsx@1.0.0', 'legacy_csv@1.3.0'])

parentPort?.once('message', async (request: WorkerRequest) => {
  try {
    if (request.testBehavior === 'STALL') {
      // Deliberately uncooperative for the parent termination contract.
      while (true) Math.imul(17, 31)
    }
    const identity = `${request.recipe.reader?.id}@${request.recipe.reader?.version}`
    if (request.testBehavior === 'ECHO') {
      if (identity !== 'test-reader@1.0.0') return parentPort?.postMessage({ error: { code: 'RECIPE_VERSION_UNAVAILABLE', retryable: true } })
      return parentPort?.postMessage({ result: { source: Buffer.from(request.source).toString('base64'), recipe: request.recipe } })
    }
    if (!readerIdentities.has(identity)) return parentPort?.postMessage({ error: { code: 'RECIPE_VERSION_UNAVAILABLE', retryable: true } })
    const sourceRuntime = import.meta.url.endsWith('.ts')
    const load = async (sourcePath: string, runtimePath: string) => sourceRuntime
      ? (await import('tsx/esm/api')).tsImport(sourcePath, { parentURL: import.meta.url })
      : import(new URL(runtimePath, import.meta.url).href)
    if (identity === 'legacy_csv@1.3.0') {
      const [profiles, normalization, reconciliation] = await Promise.all([
        load('./csv/profiles.ts', './csv/profiles.js'),
        load('./csv/normalize.ts', './csv/normalize.js'),
        load('./csv/reconcile.ts', './csv/reconcile.js'),
      ])
      const parsed = await profiles.parseCsv(Buffer.from(request.source), request.config ?? {}, request.mappingProfile)
      const result = parsed.draft ? reconciliation.reconcileDraft(normalization.normalizeDraft(parsed.draft, new Date(), true), true) : null
      return parentPort?.postMessage({ result: { parsed, result } })
    }
    const [{ buildLiquidityCsvConfig }, readerModule, registryModule, detectionModule, sectionModule, normalization, reconciliation] = await Promise.all([
      load('./liquidity-statement.config.ts', './liquidity-statement.config.js'),
      identity.startsWith('bounded_csv') ? load('./readers/csv.reader.ts', './readers/csv.reader.js') : load('./readers/xlsx.reader.ts', './readers/xlsx.reader.js'),
      load('./adapters/registry.ts', './adapters/registry.js'),
      load('./adapters/detect.ts', './adapters/detect.js'),
      load('./adapters/account-sections.ts', './adapters/account-sections.js'),
      load('./csv/normalize.ts', './csv/normalize.js'),
      load('./csv/reconcile.ts', './csv/reconcile.js'),
    ])
    const reader = identity.startsWith('bounded_csv') ? readerModule.readCsvStatement : readerModule.readXlsxStatement
    const config = request.config ?? buildLiquidityCsvConfig(request.limits ?? {})
    const document = await reader(Buffer.from(request.source), request.sourceHash, config)
    let registry=registryModule.createInitialStatementAdapterRegistry()
    if(request.mappingProfile){
      const mapped=await load('./adapters/mapped-csv.ts','./adapters/mapped-csv.js')
      registry=new registryModule.StatementAdapterRegistry([
        ...registryModule.initialStatementAdapters.filter((adapter:any)=>adapter.id!=='mapped_csv'),
        mapped.createMappedCsvAdapter(request.mappingProfile),
      ])
    }
    const requested=request.recipe.adapters?.length===1?{id:request.recipe.adapters[0].id,version:request.recipe.adapters[0].version}:undefined
    const detection=detectionModule.detectStatementAdapters(document,registry,{hint:requested})
    const storedRecords=document.records.map((record:any)=>({
      ordinal:record.ordinal,
      lineStart:record.location.kind==='CSV'?record.location.lineStart:null,
      lineEnd:record.location.kind==='CSV'?record.location.lineEnd:null,
      cells:record.cells.map((cell:any)=>cell.lexical??''),
      role:record.role,
      sourceKind:document.kind,
      sourceLocation:record.location,
    }))
    if(detection.outcome!=='MATCHED')return parentPort?.postMessage({result:{document:{reader:document.reader,records:[]},detection,parsed:{draft:null,records:storedRecords},result:null}})
    const parsed=detection.matches.map((match:any)=>{
      const adapter=registry.get(match.adapterId,match.adapterVersion)
      if(!adapter)throw Object.assign(new Error('RECIPE_VERSION_UNAVAILABLE'),{code:'RECIPE_VERSION_UNAVAILABLE'})
      return {match,adapter,result:adapter.parse(document,match)}
    })
    const unclaimed=sectionModule.classifyUnclaimedSections(document,detection.matches)
    const disposition=new Map<number,{role:string;rule:string}>()
    for(const item of parsed)for(const source of item.result.dispositions){
      if(disposition.has(source.recordOrdinal))throw Object.assign(new Error('AMBIGUOUS_LAYOUT'),{code:'AMBIGUOUS_LAYOUT'})
      disposition.set(source.recordOrdinal,{role:source.role,rule:source.rule})
    }
    for(const source of unclaimed.dispositions){
      if(disposition.has(source.recordOrdinal))throw Object.assign(new Error('AMBIGUOUS_LAYOUT'),{code:'AMBIGUOUS_LAYOUT'})
      disposition.set(source.recordOrdinal,{role:source.role,rule:source.rule})
    }
    for(const record of storedRecords){const selected=disposition.get(record.ordinal);if(selected)record.role=selected.role}
    const count=(role:string)=>storedRecords.filter((record:any)=>record.role===role).length
    const actualRecipe={...request.recipe,adapters:parsed.map((item:any)=>({id:item.adapter.id,version:item.adapter.version,regionId:item.match.regionId}))}
    const adapterIdentity=parsed.length===1?{id:parsed[0].adapter.id,version:parsed[0].adapter.version}:{id:'composite_statement',version:'1.0.0'}
    const draft={
      schemaVersion:'3.0.0',adapter:adapterIdentity,sourceHash:request.sourceHash,recipe:actualRecipe,
      recordCounts:{total:storedRecords.length,positions:count('POSITION'),controls:count('TOTAL')+count('SUBTOTAL'),metadata:count('METADATA'),headers:count('HEADER'),blanks:count('BLANK'),unsupported:count('UNSUPPORTED')},
      accounts:parsed.flatMap((item:any)=>item.result.accounts),controls:parsed.flatMap((item:any)=>item.result.controls),
      issues:[...parsed.flatMap((item:any)=>item.result.findings),...unclaimed.findings].map((finding:any)=>({code:finding.code,severity:finding.severity,accountOccurrenceId:null,fieldPath:null,sourceRecords:finding.sourceRecords})),
    }
    const normalized=normalization.normalizeDraft(draft,new Date(),true)
    for(const account of normalized.accounts){
      for(const name of ['displayName','accountMask','currency','asOfDate','asOfAt','sourceZone'])if(account[name]&&!('interpretation' in account[name]))account[name].interpretation=null
      for(const position of account.positions)for(const value of Object.values(position))if(value&&typeof value==='object'&&'availability' in value&&!('interpretation' in value))(value as any).interpretation=null
    }
    const reconciled=reconciliation.reconcileDraft(normalized,true)
    const identityEvidence=(reconciled.draft.accounts as any[]).filter(account=>account.identifierQuality==='FULL_RELIABLE').flatMap(account=>account.accountMask?.evidence??[])
    const identityRecords=document.records.filter((record:any)=>identityEvidence.some((evidence:any)=>
      evidence.kind==='CSV'?record.ordinal===evidence.record
        :record.location.kind==='XLSX'&&record.location.sheetName===evidence.sheetName&&record.location.row===evidence.row))
    parentPort?.postMessage({ result: { document:{reader:document.reader,records:identityRecords},detection,parsed:{draft:null,records:storedRecords},result:reconciled } })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'WORKER_PARSE_FAILED'
    parentPort?.postMessage({ error: { code, retryable: false } })
  }
})
