import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { K1TrackerImportDecision, K1TrackerImportPreview } from '../../../../../packages/types/src/k1-tracker'
import { K1TrackerApiError } from '../api/k1TrackerClient'
import { useK1TrackerActions } from '../hooks/useK1Tracker'

const describe = (error: unknown) => error instanceof K1TrackerApiError && error.isExpiredImport ? 'This preview expired. Upload the workbook again.' : error instanceof K1TrackerApiError && error.isConflict ? 'The tracker changed while this import was open. Refresh the partnership and choose a new decision.' : error instanceof Error ? error.message : 'Unable to import workbook.'

export function ImportWorkbookDialog({ partnershipId, onClose, onCompleted }: { partnershipId: string; onClose: () => void; onCompleted: (summary: string) => void }) {
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState<K1TrackerImportPreview>()
  const [actionsByYear, setActionsByYear] = useState<Record<string, K1TrackerImportDecision['action']>>({})
  const [error, setError] = useState<string>()
  const [progress, setProgress] = useState<number | undefined>()
  const actions = useK1TrackerActions()
  const years = useMemo(() => preview?.sheets.flatMap((sheet) => sheet.years.map((year) => ({ sheetName: sheet.sheetName, ...year }))) ?? [], [preview])
  const previewFile = async () => {
    if (!file) return
    try {
      setError(undefined); setProgress(0)
      setPreview(await actions.previewImport.mutateAsync({ file, id: partnershipId, onProgress: setProgress }))
    } catch (reason) { setError(describe(reason)) } finally { setProgress(undefined) }
  }
  const commit = async () => {
    if (!preview) return
    const decisions = years.map((year) => ({ sheetName: year.sheetName, taxYear: year.taxYear, action: actionsByYear[`${year.sheetName}-${year.taxYear}`] ?? (year.state === 'POPULATED' ? 'MERGE' : 'SKIP') }))
    try {
      setError(undefined)
      const result = await actions.commitImport.mutateAsync({ batch: preview.importBatchId, id: partnershipId, decisions })
      onCompleted(`Imported ${result.importedTaxYears.length} year(s); skipped ${result.skippedTaxYears.length}.`)
    } catch (reason) { setError(describe(reason)) }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4" role="dialog" aria-modal="true" aria-label="Import K1 workbook"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4"><div><h2 className="text-lg font-semibold text-gray-950">Import K1 basis workbook</h2><p className="text-sm text-gray-500">Preview mappings before any tracker records are changed.</p></div><button type="button" onClick={onClose} aria-label="Close import dialog" className="rounded-md p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5">{error && <div role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}<label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-7 text-sm text-gray-700 hover:border-jackson-gold"><Upload className="h-5 w-5" /><span>{file?.name ?? 'Choose an .xlsx workbook'}</span><input className="sr-only" type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0]); setPreview(undefined); setError(undefined) }} /></label>{file && !preview && <><button type="button" onClick={() => void previewFile()} disabled={actions.previewImport.isPending} className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{actions.previewImport.isPending ? `Preparing preview${progress == null ? '' : ` (${progress}%)`}` : 'Preview workbook'}</button>{actions.previewImport.isPending && <div aria-live="polite" className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-jackson-gold transition-all" style={{ width: `${progress ?? 0}%` }} /></div>}</>}{preview && <><div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><div className="flex gap-2 font-medium"><FileSpreadsheet className="h-4 w-4" />Preview ready</div><p className="mt-1">No years have been changed. The preview expires at {new Date(preview.expiresAt).toLocaleTimeString()}.</p>{preview.warnings.map((warning) => <p key={warning} className="mt-1 text-xs">{warning}</p>)}</div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="p-2">Sheet</th><th className="p-2">Year</th><th className="p-2">Detected</th><th className="p-2">Action</th></tr></thead><tbody>{years.map((year) => { const key = `${year.sheetName}-${year.taxYear}`; const action = actionsByYear[key] ?? (year.state === 'POPULATED' ? 'MERGE' : 'SKIP'); return <tr key={key} className="border-b border-gray-100"><td className="p-2">{year.sheetName}</td><td className="p-2">{year.taxYear}</td><td className="p-2">{year.state} - {year.mappedFieldCount} values{year.warnings.length ? ` - ${year.warnings.join(' ')}` : ''}</td><td className="p-2"><select aria-label={`${year.taxYear} import action`} value={action} onChange={(event) => setActionsByYear((current) => ({ ...current, [key]: event.target.value as K1TrackerImportDecision['action'] }))} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="SKIP">Skip</option><option value="MERGE" disabled={year.state !== 'POPULATED'}>Merge</option><option value="REPLACE" disabled={year.state !== 'POPULATED'}>Replace</option></select></td></tr> })}</tbody></table></div></>}</div>{preview && <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-white px-5 py-4"><button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button><button type="button" onClick={() => void commit()} disabled={actions.commitImport.isPending} className="inline-flex items-center gap-2 rounded-md bg-jackson-gold px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{actions.commitImport.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Commit selected years</button></div>}</div></div>
}
