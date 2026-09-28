export type OrganizationStartupPart = 'appearance' | 'bootstrap' | 'profile' | 'navigation'

declare global {
  interface Window {
    organizationTransition?: {
      start(name: string): Promise<void>
      cancel(): void
      ready(part: OrganizationStartupPart): void
    }
  }
}

export function markOrganizationReady(part: OrganizationStartupPart) {
  window.organizationTransition?.ready(part)
}

/** Keep the transition across the full reload required to clear organization state. */
export async function switchOrganizationWithTransition(org: { id: string; name: string }) {
  await window.organizationTransition?.start(org.name)
  try {
    await window.api.organizations.switch({ orgId: org.id })
    window.location.reload()
  } catch (error) {
    window.organizationTransition?.cancel()
    throw error
  }
}
