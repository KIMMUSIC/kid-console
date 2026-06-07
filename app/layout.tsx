import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'K-ID VPC Console · Age Assurance & Verifiable Parental Consent',
  description:
    'A developer console for the k-ID API: run Age Assurance and VPC flows and watch every HTTP request and response between the browser, the Next.js proxy, and the k-ID API.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
