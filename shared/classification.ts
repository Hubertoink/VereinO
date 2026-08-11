/**
 * The primary financial classification of a record.
 *
 * A non-profit organisation presents it as a "Sphäre"; a general organisation
 * presents exactly the same concept as a user-defined "Kategorie".  Keep the
 * stable keys separate from visible labels so reports never depend on a rename.
 */
export const ORGANIZATION_PROFILES = ['NONPROFIT', 'GENERAL'] as const
export type OrganizationProfile = (typeof ORGANIZATION_PROFILES)[number]

export const NONPROFIT_SPHERE_KEYS = ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const
export type NonprofitSphereKey = (typeof NONPROFIT_SPHERE_KEYS)[number]

export const CLASSIFICATION_SCHEME_KEYS = {
  nonprofit: 'nonprofit-spheres',
  general: 'general-categories'
} as const

export type ClassificationSchemeKey =
  (typeof CLASSIFICATION_SCHEME_KEYS)[keyof typeof CLASSIFICATION_SCHEME_KEYS]

export interface OrganizationProfileDefinition {
  profile: OrganizationProfile
  primarySchemeKey: ClassificationSchemeKey
  primaryLabel: string
  primaryLabelPlural: string
  supportsTaxSpheres: boolean
  supportsDonationReceipts: boolean
  supportsNonprofitFiscalReport: boolean
}

export const ORGANIZATION_PROFILE_DEFINITIONS: Record<OrganizationProfile, OrganizationProfileDefinition> = {
  NONPROFIT: {
    profile: 'NONPROFIT',
    primarySchemeKey: CLASSIFICATION_SCHEME_KEYS.nonprofit,
    primaryLabel: 'Sphäre',
    primaryLabelPlural: 'Sphären',
    supportsTaxSpheres: true,
    supportsDonationReceipts: true,
    supportsNonprofitFiscalReport: true
  },
  GENERAL: {
    profile: 'GENERAL',
    primarySchemeKey: CLASSIFICATION_SCHEME_KEYS.general,
    primaryLabel: 'Kategorie',
    primaryLabelPlural: 'Kategorien',
    supportsTaxSpheres: false,
    supportsDonationReceipts: false,
    supportsNonprofitFiscalReport: false
  }
}

export interface ClassificationScheme {
  id: number
  key: ClassificationSchemeKey
  label: string
  labelPlural: string
  description: string | null
  required: boolean
  isSystem: boolean
  isActive: boolean
}

export interface ClassificationValue {
  id: number
  schemeId: number
  stableKey: string
  name: string
  color: string | null
  icon: string | null
  description: string | null
  sortOrder: number
  isSystem: boolean
  isActive: boolean
}
