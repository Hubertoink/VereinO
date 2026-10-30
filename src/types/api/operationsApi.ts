import type {
    TAdvanceCreateInput,
    TAdvanceCreateOutput,
    TAdvanceDeleteInput,
    TAdvanceDeleteOutput,
    TAdvanceGetInput,
    TAdvanceGetOutput,
    TAdvancePurchaseCreateInput,
    TAdvancePurchaseCreateOutput,
    TAdvancePurchaseDeleteInput,
    TAdvancePurchaseDeleteOutput,
    TAdvancePurchaseUpdateInput,
    TAdvancePurchaseUpdateOutput,
    TAdvanceResolveInput,
    TAdvanceResolveOutput,
    TAdvancesListInput,
    TAdvancesListOutput,
    TAdvanceSettleInput,
    TAdvanceSettleOutput,
} from '../../../electron/main/ipc/schemas'

export interface OperationsApi {
    advances: {
        list: (payload?: TAdvancesListInput) => Promise<TAdvancesListOutput>
        create: (payload: TAdvanceCreateInput) => Promise<TAdvanceCreateOutput>
        get: (payload: TAdvanceGetInput) => Promise<TAdvanceGetOutput>
        settle: (payload: TAdvanceSettleInput) => Promise<TAdvanceSettleOutput>
        delete: (payload: TAdvanceDeleteInput) => Promise<TAdvanceDeleteOutput>
        purchases: {
            create: (payload: TAdvancePurchaseCreateInput) => Promise<TAdvancePurchaseCreateOutput>
            update: (payload: TAdvancePurchaseUpdateInput) => Promise<TAdvancePurchaseUpdateOutput>
            delete: (payload: TAdvancePurchaseDeleteInput) => Promise<TAdvancePurchaseDeleteOutput>
        }
        resolve: (payload: TAdvanceResolveInput) => Promise<TAdvanceResolveOutput>
    }
}
