import React, { createContext, useContext, useState, useEffect } from 'react'

type NavLayout = 'top' | 'left'
type ColorTheme = 'light' | 'dark'
type NavIconColorMode = 'color' | 'mono'
type DateFormat = 'de' | 'iso'
type JournalRowStyle = 'standard' | 'compact' | 'spacious'
type JournalRowDensity = 'normal' | 'dense'

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
}

const UIPreferencesContext = createContext<UIPreferencesContextValue | null>(null)

export const UIPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navLayout, setNavLayout] = useState<NavLayout>(() => {
    const stored = localStorage.getItem('navLayout')
    return stored === 'left' || stored === 'top' ? stored : 'top'
  })

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebarCollapsed')
    return stored === 'true'
  })

  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    const stored = localStorage.getItem('colorTheme')
    return stored === 'dark' ? 'dark' : 'light'
  })

  const [navIconColorMode, setNavIconColorMode] = useState<NavIconColorMode>(() => {
    const stored = localStorage.getItem('navIconColorMode')
    return stored === 'mono' ? 'mono' : 'color'
  })

  const [dateFormat, setDateFormat] = useState<DateFormat>(() => {
    const stored = localStorage.getItem('dateFormat')
    return stored === 'iso' ? 'iso' : 'de'
  })

  const [journalRowStyle, setJournalRowStyle] = useState<JournalRowStyle>(() => {
    const stored = localStorage.getItem('journalRowStyle')
    return stored === 'compact' || stored === 'spacious' ? stored : 'standard'
  })

  const [journalRowDensity, setJournalRowDensity] = useState<JournalRowDensity>(() => {
    const stored = localStorage.getItem('journalRowDensity')
    return stored === 'dense' ? 'dense' : 'normal'
  })

  useEffect(() => {
    localStorage.setItem('navLayout', navLayout)
  }, [navLayout])

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem('colorTheme', colorTheme)
    document.documentElement.setAttribute('data-theme', colorTheme)
  }, [colorTheme])

  useEffect(() => {
    localStorage.setItem('navIconColorMode', navIconColorMode)
  }, [navIconColorMode])

  useEffect(() => {
    localStorage.setItem('dateFormat', dateFormat)
  }, [dateFormat])

  useEffect(() => {
    localStorage.setItem('journalRowStyle', journalRowStyle)
    document.documentElement.setAttribute('data-journal-row-style', journalRowStyle)
  }, [journalRowStyle])

  useEffect(() => {
    localStorage.setItem('journalRowDensity', journalRowDensity)
    document.documentElement.setAttribute('data-journal-row-density', journalRowDensity)
  }, [journalRowDensity])

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
        setJournalRowDensity
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
