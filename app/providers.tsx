'use client'

import { HeroUIProvider } from '@heroui/react'
import { ToastProvider } from '@heroui/toast'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <HeroUIProvider>
        <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <ToastProvider />
        </NextThemesProvider>
      </HeroUIProvider>
    </SessionProvider>
  )
}
