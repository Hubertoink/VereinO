import type { CoreApi } from './coreApi'
import type { FinanceApi } from './financeApi'
import type { ImportsApi } from './importsApi'
import type { InvoicesApi } from './invoicesApi'
import type { MembersApi } from './membersApi'
import type { OperationsApi } from './operationsApi'
import type { ReportsApi } from './reportsApi'
import type { SystemApi } from './systemApi'
import type { BankImportsApi } from './bankImportsApi'

export interface RendererApi
    extends CoreApi,
        BankImportsApi,
        FinanceApi,
        ImportsApi,
        InvoicesApi,
        MembersApi,
        OperationsApi,
        ReportsApi,
        SystemApi {}
