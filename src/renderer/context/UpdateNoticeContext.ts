import { createContext, useContext } from 'react'

export type UpdateNotice = {
  version: string | null
  openUpdate?: () => void
}

export const UpdateNoticeContext = createContext<UpdateNotice>({ version: null })

export function useUpdateNotice() {
  return useContext(UpdateNoticeContext)
}
