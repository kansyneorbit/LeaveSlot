import { redirect } from 'next/navigation'
import { Banner, Card, Field, Input } from '@/components/ui'
import { SubmitButton } from '@/components/submit-button'
import { getUser } from '@/lib/session'
import { setNewPassword } from '../actions'

export const metadata = { title: 'Set a new password' }

// Reached from the reset email via /auth/callback, which signs the user in first.
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const user = await getUser()
  if (!user) redirect('/forgot?error=' + encodeURIComponent('Open the link from your reset email to set a new password.'))
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Set a new password</h1>
      <p className="mb-5 text-sm text-soft">For {user.email}. This also changes it for Kansyne Orbit.</p>
      <form action={setNewPassword} className="space-y-4">
        {error && <Banner>{error}</Banner>}
        <Field label="New password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Repeat it">
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <SubmitButton className="w-full" pendingText="Saving…">Save and continue</SubmitButton>
      </form>
    </Card>
  )
}
