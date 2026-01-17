import React, { createContext, useContext, useState, useEffect, useRef } from 'react'

type NavLayout = 'top' | 'left'
type ColorTheme = 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones' | 'monochrome-harmony' | 'vintage-charm'
type NavIconColorMode = 'color' | 'mono'
type DateFormat = 'de' | 'iso'
type JournalRowStyle = 'both' | 'lines' | 'zebra' | 'none'
type JournalRowDensity = 'normal' | 'compact'
type BackgroundImage = 'none' | 'cherry-blossom' | 'foggy-forest' | 'mountain-snow' | 'custom'

const VALID_BACKGROUNDS: BackgroundImage[] = ['none', 'cherry-blossom', 'foggy-forest', 'mountain-snow', 'custom']

// Glassmorphism: transparent modals with blur

const VALID_THEMES: ColorTheme[] = ['default', 'fiery-ocean', 'peachy-delight', 'pastel-dreamland', 'ocean-breeze', 'earthy-tones', 'monochrome-harmony', 'vintage-charm']

function isValidTheme(theme: string | null | undefined): theme is ColorTheme {
  return !!theme && VALID_THEMES.includes(theme as ColorTheme)
}

interface UIPreferencesContextValue {
  navLayout: NavLayout
  setNavLayout: (val: NavLayout) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (val: boolean) => void
  colorTheme: ColorTheme
  setColorTheme: (val: ColorTheme) => void
  navIconColorMode: NavIconColorMode
  setNavIconColorMode: (val: NavIconColorMode) => void
  dateFormat: DateFormat
  setDateFormat: (val: DateFormat) => void
  journalRowStyle: JournalRowStyle
  setJournalRowStyle: (val: JournalRowStyle) => void
  journalRowDensity: JournalRowDensity
  setJournalRowDensity: (val: JournalRowDensity) => void
  showSubmissionBadge: boolean
  setShowSubmissionBadge: (val: boolean) => void
  backgroundImage: BackgroundImage
  setBackgroundImage: (val: BackgroundImage) => void
  customBackgroundImage: string | null
  setCustomBackgroundImage: (val: string | null) => void
  glassModals: boolean
  setGlassModals: (val: boolean) => void
}

const UIPreferencesContext = createContext<UIPreferencesContextValue | null>(null)

export const UIPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navLayout, setNavLayout] = useState<NavLayout>(() => {
    const stored = localStorage.getItem('ui.navLayout')
    return stored === 'left' || stored === 'top' ? stored : 'left'
  })

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebarCollapsed')
    return stored === 'true'
  })

  const [colorTheme, setColorThemeState] = useState<ColorTheme>('default')
  const [backgroundImage, setBackgroundImageState] = useState<BackgroundImage>('none')
  const [customBackgroundImage, setCustomBackgroundImageState] = useState<string | null>(null)
  const [glassModals, setGlassModalsState] = useState<boolean>(false)
  
  // Track current org ID for appearance persistence
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const appearanceInitializedRef = useRef(false)
  
  // Load appearance settings from organization on mount
  useEffect(() => {
    const applyAppearance = (appearance: any) => {
      // Apply color theme
      if (isValidTheme(appearance?.colorTheme)) {
        setColorThemeState(appearance.colorTheme)
        localStorage.setItem('ui.colorTheme', appearance.colorTheme)
        document.documentElement.setAttribute('data-color-theme', appearance.colorTheme)
      }
      // Apply custom background image payload (data URL)
      if (typeof appearance?.customBackgroundImage === 'string' && appearance.customBackgroundImage) {
        setCustomBackgroundImageState(appearance.customBackgroundImage)
        localStorage.setItem('ui.customBackgroundImage', appearance.customBackgroundImage)
        document.documentElement.style.setProperty('--custom-background-image', `url(\"${appearance.customBackgroundImage}\")`)
      }
      // Apply background image
      if (appearance?.backgroundImage && VALID_BACKGROUNDS.includes(appearance.backgroundImage)) {
        setBackgroundImageState(appearance.backgroundImage)
        localStorage.setItem('ui.backgroundImage', appearance.backgroundImage)
        document.documentElement.setAttribute('data-background-image', appearance.backgroundImage)
      }
      // Apply glass modals
      if (typeof appearance?.glassModals === 'boolean') {
        setGlassModalsState(appearance.glassModals)
        localStorage.setItem('ui.glassModals', String(appearance.glassModals))
        document.documentElement.setAttribute('data-glass-modals', String(appearance.glassModals))
      }
    }

    async function loadOrgAppearance() {
      try {
        // Get active organization
        const orgResult = await (window as any).api?.organizations?.active?.()
        const orgId = orgResult?.organization?.id
        if (orgId) {
          setCurrentOrgId(orgId)
          // Get saved appearance for this org
          const appearance = await (window as any).api?.organizations?.activeAppearance?.()
          if (appearance) {
            applyAppearance(appearance)
            appearanceInitializedRef.current = true
            return
          }
        }
        // Fallback to localStorage if no org appearance found
        const storedTheme = localStorage.getItem('ui.colorTheme')
        if (isValidTheme(storedTheme)) {
          setColorThemeState(storedTheme)
          document.documentElement.setAttribute('data-color-theme', storedTheme)
        }
        const storedBg = localStorage.getItem('ui.backgroundImage')
        if (storedBg && VALID_BACKGROUNDS.includes(storedBg as BackgroundImage)) {
          setBackgroundImageState(storedBg as BackgroundImage)
          document.documentElement.setAttribute('data-background-image', storedBg)
        }
        const storedCustomBg = localStorage.getItem('ui.customBackgroundImage')
        if (storedCustomBg) {
          setCustomBackgroundImageState(storedCustomBg)
          document.documentElement.style.setProperty('--custom-background-image', `url("${storedCustomBg}")`)
        }
        const storedGlass = localStorage.getItem('ui.glassModals')
        setGlassModalsState(storedGlass === 'true')
        document.documentElement.setAttribute('data-glass-modals', storedGlass === 'true' ? 'true' : 'false')
        appearanceInitializedRef.current = true
      } catch (e) {
        console.warn('Failed to load org appearance:', e)
        // Fallback to localStorage
        const storedTheme = localStorage.getItem('ui.colorTheme')
        if (isValidTheme(storedTheme)) {
          setColorThemeState(storedTheme)
          document.documentElement.setAttribute('data-color-theme', storedTheme)
        }
        appearanceInitializedRef.current = true
      }
    }
    loadOrgAppearance()

    const off = (window as any).api?.organizations?.onSwitched?.(async (org: { id: string }) => {
      try {
        setCurrentOrgId(org?.id || null)
        appearanceInitializedRef.current = false
        const appearance = await (window as any).api?.organizations?.activeAppearance?.()
        if (appearance) applyAppearance(appearance)
      } finally {
        appearanceInitializedRef.current = true
      }
    })

    return () => {
      if (typeof off === 'function') off()
    }
  }, [])
  
  // Helper to save appearance to organization
  const saveAppearanceToOrg = (updates: { colorTheme?: string; backgroundImage?: string; customBackgroundImage?: string | null; glassModals?: boolean }) => {
    if (currentOrgId && appearanceInitializedRef.current) {
      ;(window as any).api?.organizations?.setAppearance?.({ orgId: currentOrgId, ...updates }).catch(() => {})
    }
  }
  
  // Wrapper to save theme to organization when changed
  const setColorTheme = (val: ColorTheme) => {
    setColorThemeState(val)
    saveAppearanceToOrg({ colorTheme: val })
  }
  
  // Wrapper to save background image to organization when changed
  const setBackgroundImage = (val: BackgroundImage) => {
    setBackgroundImageState(val)
    saveAppearanceToOrg({ backgroundImage: val })
  }

  const setCustomBackgroundImage = (val: string | null) => {
    setCustomBackgroundImageState(val)
    saveAppearanceToOrg({ customBackgroundImage: val })
  }
  
  // Wrapper to save glass modals to organization when changed
  const setGlassModals = (val: boolean) => {
    setGlassModalsState(val)
    saveAppearanceToOrg({ glassModals: val })
  }

  const [navIconColorMode, setNavIconColorMode] = useState<NavIconColorMode>(() => {
    const stored = localStorage.getItem('navIconColorMode')
    return stored === 'mono' ? 'mono' : 'color'
  })

  const [dateFormat, setDateFormat] = useState<DateFormat>(() => {
    const stored = localStorage.getItem('dateFormat')
    return stored === 'iso' ? 'iso' : 'de'
  })

  const [journalRowStyle, setJournalRowStyle] = useState<JournalRowStyle>(() => {
    const stored = localStorage.getItem('ui.journalRowStyle')
    return (stored === 'both' || stored === 'lines' || stored === 'zebra' || stored === 'none') ? stored : 'both'
  })

  const [journalRowDensity, setJournalRowDensity] = useState<JournalRowDensity>(() => {
    const stored = localStorage.getItem('ui.journalRowDensity')
    return stored === 'compact' ? 'compact' : 'normal'
  })

  const [showSubmissionBadge, setShowSubmissionBadge] = useState<boolean>(() => {
    const stored = localStorage.getItem('ui.showSubmissionBadge')
    return stored !== 'false' // default true
  })

  useEffect(() => {
    localStorage.setItem('ui.navLayout', navLayout)
  }, [navLayout])

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem('ui.colorTheme', colorTheme)
    document.documentElement.setAttribute('data-color-theme', colorTheme)
  }, [colorTheme])

  useEffect(() => {
    localStorage.setItem('navIconColorMode', navIconColorMode)
  }, [navIconColorMode])

  useEffect(() => {
    localStorage.setItem('dateFormat', dateFormat)
  }, [dateFormat])

  useEffect(() => {
    localStorage.setItem('ui.journalRowStyle', journalRowStyle)
    document.documentElement.setAttribute('data-journal-row-style', journalRowStyle)
  }, [journalRowStyle])

  useEffect(() => {
    localStorage.setItem('ui.journalRowDensity', journalRowDensity)
    document.documentElement.setAttribute('data-journal-row-density', journalRowDensity)
  }, [journalRowDensity])

  useEffect(() => {
    localStorage.setItem('ui.showSubmissionBadge', String(showSubmissionBadge))
  }, [showSubmissionBadge])

  useEffect(() => {
    localStorage.setItem('ui.backgroundImage', backgroundImage)
    document.documentElement.setAttribute('data-background-image', backgroundImage)
  }, [backgroundImage])

  useEffect(() => {
    if (customBackgroundImage) {
      localStorage.setItem('ui.customBackgroundImage', customBackgroundImage)
      document.documentElement.style.setProperty('--custom-background-image', `url("${customBackgroundImage}")`)
    } else {
      localStorage.removeItem('ui.customBackgroundImage')
      document.documentElement.style.removeProperty('--custom-background-image')
    }
  }, [customBackgroundImage])

  useEffect(() => {
    localStorage.setItem('ui.glassModals', String(glassModals))
    document.documentElement.setAttribute('data-glass-modals', String(glassModals))
  }, [glassModals])

  return (
    <UIPreferencesContext.Provider
      value={{
        navLayout,
        setNavLayout,
        sidebarCollapsed,
        setSidebarCollapsed,
        colorTheme,
        setColorTheme,
        navIconColorMode,
        setNavIconColorMode,
        dateFormat,
        setDateFormat,
        journalRowStyle,
        setJournalRowStyle,
        journalRowDensity,
        setJournalRowDensity,
        showSubmissionBadge,
        setShowSubmissionBadge,
        backgroundImage,
        setBackgroundImage,
        customBackgroundImage,
        setCustomBackgroundImage,
        glassModals,
        setGlassModals
      }}
    >
      {children}
    </UIPreferencesContext.Provider>
  )
}

export const useUIPreferences = () => {
  const ctx = useContext(UIPreferencesContext)
  if (!ctx) throw new Error('useUIPreferences must be used within UIPreferencesProvider')
  return ctx
}
