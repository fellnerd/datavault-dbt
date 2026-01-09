'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// Helper to get initial theme without hydration issues
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const savedTheme = localStorage.getItem('mds-theme') as Theme | null
  if (savedTheme) return savedTheme
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Use lazy initializer to avoid calling setState in useEffect
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
  }, [])

  useEffect(() => {
    // Apply theme to body - Blueprint 6 uses both bp5-dark AND bp6-dark
    const isDark = theme === 'dark'
    document.body.classList.toggle('bp5-dark', isDark)
    document.body.classList.toggle('bp6-dark', isDark)
    localStorage.setItem('mds-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light')
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
