import { useEffect,useRef,type ReactNode } from 'react'
export const csvInput='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
export const csvButton='rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50'
export function LiquidityCsvDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null
    ref.current?.focus()
    return ()=>previous?.focus()
  },[])
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onKeyDown={event=>{
    if(event.key==='Escape')onClose()
    if(event.key==='Tab'){
      const targets=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')??[])
      const first=targets[0],last=targets.at(-1)
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }
  }}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-6 shadow-xl outline-none">
    <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-gray-900">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">Close</button></div>{children}
  </div></div>
}
