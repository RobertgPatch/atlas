export interface LiquidityEntityOption { id:string;name:string }

export const liquidityDefaultEntityKey=(userId?:string)=>`atlas-liquidity-default-entity:${userId??'anonymous'}`

export function preferredLiquidityEntityId(entities:readonly LiquidityEntityOption[],requestedId?:string|null):string{
  if(requestedId&&entities.some(entity=>entity.id===requestedId))return requestedId
  const byName=(name:string)=>entities.find(entity=>entity.name.trim().toLocaleLowerCase('en-US')===name.toLocaleLowerCase('en-US'))?.id
  return byName('Garner Family Trust')??byName('Gardner Family Trust')??entities[0]?.id??''
}

export function savedLiquidityEntityId(userId?:string):string{
  try{return window.localStorage.getItem(liquidityDefaultEntityKey(userId))??''}catch{return ''}
}
