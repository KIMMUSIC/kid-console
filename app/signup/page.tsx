import type { Metadata } from 'next'
import PlayncSignup from './PlayncSignup'

export const metadata: Metadata = {
  title: 'Sign Up · plaync',
  description:
    'plaync-style signup whose guardian-consent step runs real k-ID Age Assurance & Verifiable Parental Consent, with a live HTTP inspector.',
}

export default function SignupPage() {
  return <PlayncSignup />
}
