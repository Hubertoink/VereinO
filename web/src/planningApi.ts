import { api, ApiError } from './api'
export type PlanningBudget = { id: number; name: string; year: number; sphere: 'IDEELL'|'ZWECK'|'VERMOEGEN'|'WGB'; amountPlanned: number; categoryId: null; projectId: null; earmarkId: null; categoryName?: string|null; projectName?:string|null; startDate?: string|null; endDate?:string|null; color?:string|null; isArchived:number; enforceTimeRange:number; version:number }
export type PlanningEarmark = { id:number; code:string; name:string; description?:string|null; budget?:number|null; startDate?:string|null; endDate?:string|null; color?:string|null; isActive:number; enforceTimeRange:number; version:number }
export function createPlanningApi(onSessionExpired:()=>void) {
  const versions = { budgets: new Map<number,number>(), earmarks:new Map<number,number>() }
  const call = async<T,>(path:string,method='GET',data?:unknown):Promise<T> => { try{return await api<T>(path,method,data)}catch(error){if(error instanceof ApiError&&error.status===401)onSessionExpired();throw error} }
  function group(kind:'budgets'|'earmarks') {
    return {
      async list(filter: {includeArchived?:boolean;activeOnly?:boolean}={}) {
        const result=await call<{rows:Array<PlanningBudget|PlanningEarmark>}>(`/planning/${kind}`)
        for(const row of result.rows) versions[kind].set(row.id,row.version)
        return {rows:result.rows.filter(row=>kind==='budgets' ? filter.includeArchived || !(row as PlanningBudget).isArchived : !filter.activeOnly || !!(row as PlanningEarmark).isActive)}
      },
      async upsert(input:Record<string,unknown>) {
        const {id,version:inputVersion,...fields}=input
        const version=id ? inputVersion ?? versions[kind].get(Number(id)) : undefined
        if(id&&!version)throw new Error('Eintrag bitte neu laden.')
        const result=await call<{row:PlanningBudget|PlanningEarmark}>(`/planning/${kind}${id?`/${id}`:''}`,id?'PATCH':'POST',{...fields,...(id?{version}:{} )})
        versions[kind].set(result.row.id,result.row.version)
        return result.row
      },
      async delete({id}:{id:number}) { const version=versions[kind].get(id);if(!version)throw new Error('Eintrag bitte neu laden.');const result=await call(`/planning/${kind}/${id}`,'DELETE',{version});versions[kind].delete(id);return result },
      usage({budgetId,earmarkId,from,to,sphere}:{budgetId?:number;earmarkId?:number;from?:string;to?:string;sphere?:string}) {
        const params=new URLSearchParams();for(const [k,v] of Object.entries({from,to,sphere}))if(v)params.set(k,v)
        return call(`/planning/${kind}/${budgetId??earmarkId}/usage?${params}`)
      }
    }
  }
  return {budgets:group('budgets'),bindings:group('earmarks')}
}
