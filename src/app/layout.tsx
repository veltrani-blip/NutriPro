import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'NutriPro', template: '%s · NutriPro' },
  description: 'Gestão profissional para nutricionistas e clínicas de nutrição.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
