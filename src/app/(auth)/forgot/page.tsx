import Link from 'next/link'
import { Banner, Card, Field, Input } from '@/components/ui'
import { SubmitButton } from '@/components/submit-button'
import { requestReset } from '../actions'

export const metadata = { title: 'Forgot password' }

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams
  if (sent) {
    return (
      <Card className="p-6">
        <h1 className="mb-2 text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-soft">
          If that email has a login, we&apos;ve sent it a link to set a new password.
          Open it on this device. Nothing after a few minutes? Check spam.
        </p>
      </Card>
    )
  }
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Forgot password</h1>
      <p className="mb-5 text-sm text-soft">We&apos;ll email you a link to set a new one.</p>
      <form action={requestReset} className="space-y-4">
        {error && <Banner>{error}</Banner>}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-soft">
        <Link href="/login" className="font-medium text-brand hover:underline">Back to sign in</Link>
      </p>
    </Card>
  )
}
