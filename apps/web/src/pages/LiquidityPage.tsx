import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { ConsolidatedHoldingsReport } from '../features/reports/components/ConsolidatedHoldingsReport'
import { entitiesClient } from '../features/partnerships/api/entitiesClient'
import { liquidityDefaultEntityKey,preferredLiquidityEntityId,savedLiquidityEntityId } from '../features/reports/utils/liquidityEntityPreference'

export function LiquidityPage() {
  const { session } = useSession()
  const [params] = useSearchParams()
  const userId=session?.user.id
  const [requestedEntityId,setRequestedEntityId]=useState(()=>params.get('entityId') ?? savedLiquidityEntityId(userId))
  const [savedDefaultId,setSavedDefaultId]=useState(()=>savedLiquidityEntityId(userId))
  const entities=useQuery({queryKey:['entities','liquidity-page'],queryFn:()=>entitiesClient.list()})
  const options=entities.data?.items??[]
  const entityId=preferredLiquidityEntityId(options,requestedEntityId)
  const effectiveDefaultId=preferredLiquidityEntityId(options,savedDefaultId)
  const makeDefault=()=>{if(!entityId)return;try{window.localStorage.setItem(liquidityDefaultEntityKey(userId),entityId)}catch{/* Storage may be disabled. */}setSavedDefaultId(entityId)}

  return (
    <AppShell
      currentPath="/liquidity"
      userRole={session?.role ?? 'User'}
      userAccessLevel={session?.user.accessLevel}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <ConsolidatedHoldingsReport entities={options} entityId={entityId} defaultEntityId={effectiveDefaultId} entitiesLoading={entities.isLoading} onEntityChange={setRequestedEntityId} onMakeDefault={makeDefault}/>
    </AppShell>
  )
}
