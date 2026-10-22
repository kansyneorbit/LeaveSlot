import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'LeaveSlot', template: '%s · LeaveSlot' },
  description: 'First-come, first-served leave booking for departments.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  )
}
