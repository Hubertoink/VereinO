import { AI_MASTER_DATA_SETTING, normalizeMasterDataPermissions } from '../../../shared/aiMasterDataPolicy'
import { getSetting } from './settings'

export const getAiMasterDataPermissions = () => normalizeMasterDataPermissions(getSetting(AI_MASTER_DATA_SETTING))
