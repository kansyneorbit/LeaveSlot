import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Banner, Card, Field, Input, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/submit-button'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/session'
import { signOut } from '../(auth)/actions'
import { createOrg } from './actions'

export const metadata = { title: 'Your departments' }

export default async function AppHome({ searchParams }: { searchParams: Promise<{ error?: string; new?: string }> }) {
  const { error, new: wantsNew } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()
  await supabase.rpc('ls_accept_invites')
  const { data } = await supabase
    .from('ls_members')
    .select('org_id, role, ls_orgs!inner(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
  const orgs = (data ?? []) as unknown as { org_id: string; role: string; ls_orgs: { name: string } }[]
  if (orgs.length === 1 && !wantsNew && !error) redirect(`/o/${orgs[0].org_id}`)

  const name = (user.user_metadata?.full_name as string | undefined) ?? ''
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <PageHeader title="Your departments">
        <form action={signOut}><button className="text-sm text-soft hover:text-ink">Sign out</button></form>
      </PageHeader>
      {orgs.length > 0 ? (
        <Card className="mb-8 divide-y divide-line">
          {orgs.map((o) => (
            <Link key={o.org_id} href={`/o/${o.org_id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted">
              <span className="font-medium text-ink">{o.ls_orgs.name}</span>
              <span className="text-xs uppercase text-faint">{o.role}</span>
            </Link>
          ))}
        </Card>
      ) : (
        <div className="mb-6">
          <Banner tone="info">
            You&apos;re signed in as <strong>{user.email}</strong>, but no department has added this email yet.
            Ask your admin to add it, or set up a new department below.
          </Banner>
        </div>
      )}
      <Card className="p-6">
        <h2 className="mb-1 font-semibold text-ink">Set up a department</h2>
        <p className="mb-5 text-sm text-soft">You&apos;ll be its admin. You can change all of this later in Settings.</p>
        <form action={createOrg} className="space-y-4">
          {error && <Banner>{error}</Banner>}
          <Field label="Department / organisation name">
            <Input name="name" required maxLength={120} placeholder="Rajagiri Hospital — PMR" />
          </Field>
          <Field label="Your name">
            <Input name="admin_name" required maxLength={100} defaultValue={name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Number of employees" hint="Seats, including you.">
              <Input name="seats" type="number" min={1} max={1000} defaultValue={30} required />
            </Field>
            <Field label="People on leave per day">
              <Input name="daily_limit" type="number" min={1} max={100} defaultValue={2} required />
            </Field>
            <Field label="Booking opens on day" hint="Of the month before (1–28).">
              <Input name="booking_day" type="number" min={1} max={28} defaultValue={20} required />
            </Field>
            <Field label="At (IST)">
              <Input name="opens_at" type="time" defaultValue="09:00" required />
            </Field>
          </div>
          <SubmitButton className="w-full" pendingText="Creating…">Create department</SubmitButton>
        </form>
      </Card>
    </main>
  )
}
