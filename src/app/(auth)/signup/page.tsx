import Link from 'next/link'
import { Banner, Card, Field, Input } from '@/components/ui'
import { SubmitButton } from '@/components/submit-button'
import { signUp } from '../actions'

export const metadata = { title: 'Create login' }

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams
  if (sent) {
    return (
      <Card className="p-6">
        <h1 className="mb-2 text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-soft">
          We sent a confirmation link to <strong className="text-ink">{sent}</strong>. Open it, then{' '}
          <Link href="/login" className="font-medium text-brand hover:underline">sign in</Link>.
        </p>
      </Card>
    )
  }
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Create your login</h1>
      <p className="mb-5 text-sm text-soft">
        Employees: sign up with the email your department admin added and you&apos;ll join automatically.
        Setting up a new department? Sign up, then create it.
      </p>
      <form action={signUp} className="space-y-4">
        {error && <Banner>{error}</Banner>}
        <Field label="Your name">
          <Input name="name" autoComplete="name" required maxLength={100} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <SubmitButton className="w-full" pendingText="Creating login…">Create login</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-soft">
        Already have a login? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
      </p>
    </Card>
  )
}
