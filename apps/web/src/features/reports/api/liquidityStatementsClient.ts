import { authenticatedFetch } from '../../../auth/authenticatedFetch'
import type { AccountBinding,ApplicationPreview,CsvDetail,CsvSummary,MappingProfile,ReviewChange,SourceAccount,UploadCapability,UploadRequest } from '../../../../../../packages/types/src/liquidity-statements'
const base=(import.meta.env.VITE_API_BASE_URL as string|undefined)?.replace(/\/$/,'')??'/v1'
export class LiquidityCsvApiError extends Error {
  readonly code:string
  readonly status:number
  constructor(code:string,status:number,message:string){super(message);this.code=code;this.status=status}
}
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await authenticatedFetch(`${base}${path}`,{method,credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new LiquidityCsvApiError(error.error??'REQUEST_FAILED',response.status,error.message??'The request failed. Please try again.')}
  return response.status===204?undefined as T:response.json() as Promise<T>
}
export const liquidityStatementsClient={
  accounts:(entityId?:string)=>request<{items:SourceAccount[]}>(`/liquidity-source-accounts${entityId?`?entityId=${encodeURIComponent(entityId)}`:''}`),
  createAccount:(body:{entityId:string;custodian:string;name:string;currency:string;cadence:SourceAccount['cadence'];accountMask?:string})=>request<SourceAccount>('/liquidity-source-accounts','POST',body),
  updateAccount:(id:string,body:{expectedVersion:number;name?:string;included?:boolean;cadence?:SourceAccount['cadence']})=>request<SourceAccount>(`/liquidity-source-accounts/${id}`,'PATCH',body),
  list:(entityId?:string)=>request<{items:CsvSummary[];nextCursor:string|null}>(`/liquidity-statements${entityId?`?entityId=${encodeURIComponent(entityId)}`:''}`),
  detail:(id:string)=>request<CsvDetail>(`/liquidity-statements/${id}`),
  capability:(body:UploadRequest)=>request<UploadCapability>('/liquidity-statements/upload-capability','POST',body),
  async upload(file:File,entityId:string,custodian:string,onProgress?:(stage:string)=>void){
    if(!/\.csv$/i.test(file.name)||file.size<1||file.size>10485760)throw new Error('Choose a CSV file up to 10 MiB.')
    onProgress?.('Checking file…')
    const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
    const cap=await this.capability({entityId,custodian,fileName:file.name,sizeBytes:file.size,sha256,contentType:'text/csv'})
    if(cap.duplicate)return cap.statementId
    onProgress?.('Uploading…')
    const local=cap.url.startsWith('/v1/')
    const url=local?`${base}${cap.url.slice(3)}`:cap.url
    const response=await (local?authenticatedFetch:fetch)(url,{method:'PUT',headers:cap.requiredHeaders,body:bytes,...(local?{credentials:'include' as const}:{credentials:'omit' as const})})
    if(!response.ok)throw new Error('The upload did not finish. Start a new upload or reopen the draft.')
    const storageVersionId=local?(await response.json()).storageVersionId:response.headers.get('x-amz-version-id')
    if(!storageVersionId)throw new Error('The file store did not provide an immutable version. Contact your administrator.')
    onProgress?.('Validating…')
    await request(`/liquidity-statements/${cap.statementId}/complete`,'POST',{expectedVersion:cap.version,storageVersionId,sha256})
    return cap.statementId
  },
  retry:(id:string,expectedVersion:number)=>request<CsvSummary>(`/liquidity-statements/${id}/retry`,'POST',{expectedVersion}),
  cancel:(id:string,expectedVersion:number)=>request<void>(`/liquidity-statements/${id}?expectedVersion=${expectedVersion}`,'DELETE'),
  mapping:(id:string,expectedVersion:number,profile:MappingProfile)=>request<CsvSummary>(`/liquidity-statements/${id}/mapping`,'PUT',{expectedVersion,profile}),
  review:(id:string,expectedVersion:number,changes:ReviewChange[],accountBindings:AccountBinding[])=>request<CsvDetail>(`/liquidity-statements/${id}/review`,'PATCH',{expectedVersion,changes,accountBindings}),
  preview:(id:string,expectedVersion:number,accountBindings:AccountBinding[])=>request<ApplicationPreview>(`/liquidity-statements/${id}/application-preview`,'POST',{expectedVersion,accountBindings}),
  apply:(id:string,preview:ApplicationPreview,idempotencyKey:string)=>request<{applicationId:string;snapshotIds:string[]}>(`/liquidity-statements/${id}/apply`,'POST',{previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey}),
  source:(id:string)=>request<{url:string;expiresAt:string}>(`/liquidity-statements/${id}/source-download`,'POST'),
}
