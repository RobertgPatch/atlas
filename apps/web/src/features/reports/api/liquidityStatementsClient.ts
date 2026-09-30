import { authenticatedFetch } from '../../../auth/authenticatedFetch'
import type { AccountBinding,ApplicationPreview,CsvDetail,CsvRecord,CsvSummary,CustodianSummary,ExcludedAccountDecision,MappingProfile,ReviewChange,SourceAccount,StatementFileKind,StatementStoredRecord,UploadCapability,UploadRequest } from '../../../../../../packages/types/src/liquidity-statements'
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
  custodians:(entityId:string)=>request<{items:CustodianSummary[]}>(`/liquidity-custodians?entityId=${encodeURIComponent(entityId)}`),
  archiveCustodian:(entityId:string,custodian:string)=>request<void>('/liquidity-custodians','DELETE',{entityId,custodian}),
  renameCustodian:(entityId:string,currentName:string,newName:string)=>request<CustodianSummary>('/liquidity-custodians','PATCH',{entityId,currentName,newName}),
  createAccount:(body:{entityId:string;custodian:string;name:string;currency:string;cadence:SourceAccount['cadence'];accountMask?:string})=>request<SourceAccount>('/liquidity-source-accounts','POST',body),
  updateAccount:(id:string,body:{expectedVersion:number;name?:string;accountMask?:string|null;included?:boolean;cadence?:SourceAccount['cadence']})=>request<SourceAccount>(`/liquidity-source-accounts/${id}`,'PATCH',body),
  list:(entityId?:string,options:{cursor?:string;limit?:number;custodians?:string[]}={})=>{const query=new URLSearchParams();if(entityId)query.set('entityId',entityId);if(options.cursor)query.set('cursor',options.cursor);query.set('limit',String(options.limit??25));for(const custodian of options.custodians??[])query.append('custodian',custodian);return request<{items:CsvSummary[];nextCursor:string|null}>(`/liquidity-statements?${query.toString()}`)},
  detail:(id:string)=>request<CsvDetail>(`/liquidity-statements/${id}`),
  records:(id:string,cursor?:string)=>request<{items:Array<CsvRecord|StatementStoredRecord>;nextCursor:string|null}>(`/liquidity-statements/${id}/records?limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`),
  capability:(body:UploadRequest)=>request<UploadCapability>('/liquidity-statements/upload-capability','POST',body),
  async upload(file:File,entityId:string,custodian:string,onProgress?:(stage:string)=>void){
    const fileKind:StatementFileKind|undefined=/\.xlsx$/i.test(file.name)?'XLSX':/\.csv$/i.test(file.name)?'CSV':undefined
    if(!fileKind||file.size<1||file.size>10485760)throw new Error('Choose a CSV or XLSX statement up to 10 MiB.')
    const contentType=fileKind==='XLSX'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv'
    onProgress?.('Checking file…')
    const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
    const cap=await this.capability({entityId,custodian,fileName:file.name,sizeBytes:file.size,sha256,contentType,fileKind})
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
  reprocess:(id:string,expectedVersion:number,reason:string,adapter?:{id:string;version:string})=>request<CsvSummary>(`/liquidity-statements/${id}/reprocess`,'POST',{expectedVersion,reason,...(adapter?{adapter}:{})}),
  abandon:(id:string,expectedVersion:number)=>request<void>(`/liquidity-statements/${id}?expectedVersion=${expectedVersion}`,'DELETE'),
  cancel:(id:string,expectedVersion:number)=>request<void>(`/liquidity-statements/${id}?expectedVersion=${expectedVersion}`,'DELETE'),
  archive:(id:string,expectedVersion:number)=>request<void>(`/liquidity-statements/${id}/archive`,'POST',{expectedVersion}),
  mapping:(id:string,expectedVersion:number,profile:MappingProfile)=>request<CsvSummary>(`/liquidity-statements/${id}/mapping`,'PUT',{expectedVersion,profile}),
  review:(id:string,expectedVersion:number,changes:ReviewChange[],accountBindings:AccountBinding[],excludedAccounts:ExcludedAccountDecision[]=[])=>request<CsvDetail>(`/liquidity-statements/${id}/review`,'PATCH',{expectedVersion,changes,accountBindings,excludedAccounts}),
  preview:(id:string,expectedVersion:number,accountBindings:AccountBinding[],excludedAccounts:ExcludedAccountDecision[]=[])=>request<ApplicationPreview>(`/liquidity-statements/${id}/application-preview`,'POST',{expectedVersion,accountBindings,excludedAccounts}),
  apply:(id:string,preview:ApplicationPreview,idempotencyKey:string)=>request<{applicationId:string;snapshotIds:string[]}>(`/liquidity-statements/${id}/apply`,'POST',{previewId:preview.id,expectedVersion:preview.expectedVersion,summaryHash:preview.summaryHash,idempotencyKey}),
  source:(id:string)=>request<{url:string;expiresAt:string}>(`/liquidity-statements/${id}/source-download`,'POST'),
}
