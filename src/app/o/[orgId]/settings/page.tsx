import { Banner, Card, Field, Input, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/submit-button'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/session'
import { fmtDay } from '@/lib/dates'
import type { DayLimit } from '@/lib/types'
import { removeDayLimit, saveSettings, setDayLimit } from './actions'

export const metadata = { title: 'Settings' }

export default async function SettingsPage({ params, searchParams }: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const { orgId } = await params
  const { error, notice } = await searchParams
  const { org } = await requireAdmin(orgId)
  const supabase = await createClient()
  const { data } = await supabase.from('ls_day_limits').select('day, max_slots, note')
    .eq('org_id', orgId).gte('day', new Date().toISOString().slice(0, 10)).order('day')
  const limits = (data ?? []) as DayLimit[]

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      {error && <Banner>{error}</Banner>}
      {notice && !error && <Banner tone="info">{notice}</Banner>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-ink">Booking rules</h2>
          <form action={saveSettings.bind(null, orgId)} className="space-y-4">
            <Field label="Department name"><Input name="name" defaultValue={org.name} required maxLength={120} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Number of employees" hint="Seats for active people.">
                <Input name="seat_limit" type="number" min={1} max={1000} defaultValue={org.seat_limit} required />
              </Field>
              <Field label="People on leave per day" hint="Raising it confirms waitlisted people.">
                <Input name="daily_limit" type="number" min={1} max={100} defaultValue={org.daily_limit} required />
              </Field>
              <Field label="Booking opens on day" hint="Of the previous month (1–28).">
                <Input name="booking_day" type="number" min={1} max={28} defaultValue={org.booking_day} required />
              </Field>
              <Field label={`At (${org.timezone})`}>
                <Input name="opens_at" type="time" defaultValue={org.opens_at.slice(0, 5)} required />
              </Field>
              <Field label="Max days per person per month" hint="Leave empty for no limit.">
                <Input name="monthly_cap" type="number" min={1} max={31} defaultValue={org.monthly_cap ?? ''} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="allow_waitlist" defaultChecked={org.allow_waitlist} />
              Allow a waitlist when a day is full
            </label>
            <SubmitButton pendingText="Saving…">Save</SubmitButton>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold text-ink">Special days</h2>
          <p className="mb-4 text-sm text-soft">Change the slots for one date — 0 blocks leave (audits, camps, short staff).</p>
          <form action={setDayLimit.bind(null, orgId)} className="grid gap-3 sm:grid-cols-[1fr_90px]">
            <Field label="Date"><Input name="day" type="date" required /></Field>
            <Field label="Slots"><Input name="max_slots" type="number" min={0} max={100} defaultValue={0} required /></Field>
            <div className="sm:col-span-2"><Field label="Reason (optional)"><Input name="note" maxLength={100} placeholder="NABH audit" /></Field></div>
            <div className="sm:col-span-2"><SubmitButton variant="secondary" pendingText="Saving…">Set</SubmitButton></div>
          </form>
          <ul className="mt-4 divide-y divide-line">
            {limits.map((l) => (
              <li key={l.day} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{fmtDay(l.day)} · {l.max_slots === 0 ? 'No leave' : `${l.max_slots} slots`}{l.note ? ` · ${l.note}` : ''}</span>
                <form action={removeDayLimit.bind(null, orgId)}>
                  <input type="hidden" name="day" value={l.day} />
                  <button className="text-xs text-soft hover:underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
