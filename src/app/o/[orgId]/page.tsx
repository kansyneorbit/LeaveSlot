import Link from 'next/link'
import { Banner, Card, PageHeader } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { requireMember } from '@/lib/session'
import { loadMonth } from '@/lib/board'
import { fmtDateTime, fmtDay, fmtMonth, leadingBlanks, ordinal } from '@/lib/dates'
import type { Booking } from '@/lib/types'
import { BookingBoard } from './booking-board'
import { bookDays, cancelBooking, markRead } from './actions'

export const metadata = { title: 'Book leave' }

export default async function BookPage({ params, searchParams }: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ m?: string; error?: string; notice?: string }>
}) {
  const { orgId } = await params
  const { m, error, notice } = await searchParams
  const { member, org } = await requireMember(orgId)
  const board = await loadMonth(org, m)
  const supabase = await createClient()

  const [{ data: mine }, { data: waiting }, { data: notes }] = await Promise.all([
    supabase.from('ls_bookings').select('id, seq, member_id, leave_date, status, booked_at')
      .eq('member_id', member.id).gt('leave_date', board.today).neq('status', 'cancelled').order('leave_date'),
    supabase.from('ls_bookings').select('id, seq, leave_date')
      .eq('org_id', orgId).gt('leave_date', board.today).eq('status', 'waitlisted'),
    supabase.from('ls_notifications').select('id, message, created_at')
      .eq('member_id', member.id).eq('is_read', false).order('created_at', { ascending: false }).limit(5),
  ])
  const wlPos = (b: Booking) =>
    (waiting ?? []).filter((w) => w.leave_date === b.leave_date && w.seq <= b.seq).length

  const months = [board.thisMonth, board.nextMonth]
  const back = `/o/${orgId}?m=${board.month.slice(0, 7)}`
  const rules = [
    `${org.daily_limit} ${org.daily_limit === 1 ? 'person' : 'people'} on leave per day`,
    `booking opens on the ${ordinal(org.booking_day)} at ${org.opens_at.slice(0, 5)} for the next month`,
    org.monthly_cap ? `up to ${org.monthly_cap} day(s) each per month` : null,
    org.allow_waitlist ? 'waitlist when full' : 'no waitlist',
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-6">
      <PageHeader title="Book leave">
        {months.map((mo) => (
          <Link key={mo} href={`/o/${orgId}?m=${mo.slice(0, 7)}`}
            className={`rounded-md px-3 py-1.5 text-sm ${mo === board.month ? 'bg-brand text-white' : 'border border-line bg-surface text-ink hover:bg-muted'}`}>
            {fmtMonth(mo)}
          </Link>
        ))}
      </PageHeader>

      {error && <Banner>{error}</Banner>}
      {notice && !error && <Banner tone="info">{notice}</Banner>}
      {(notes ?? []).length > 0 && (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <ul className="space-y-1 text-sm text-ink">
              {notes!.map((n) => <li key={n.id}>🔔 {n.message}</li>)}
            </ul>
            <form action={markRead.bind(null, orgId)}><button className="whitespace-nowrap text-xs text-soft underline">Mark read</button></form>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-ink">{fmtMonth(board.month)}</h2>
            <p className="text-xs text-soft">{rules}</p>
          </div>
          <BookingBoard
            days={board.days}
            blanks={leadingBlanks(board.month)}
            today={board.today}
            meId={member.id}
            isOpen={board.isOpen}
            opens={board.opens}
            opensLabel={fmtDateTime(board.opens, org.timezone).replace(/:\d\d(?=\s|$)/, '')}
            serverNow={board.serverNow}
            allowWaitlist={org.allow_waitlist}
            action={bookDays.bind(null, orgId, board.month)}
          />
        </Card>

        <Card className="h-fit p-4">
          <h2 className="mb-3 font-semibold text-ink">My upcoming leave</h2>
          {(mine ?? []).length === 0 && <p className="text-sm text-soft">Nothing booked yet.</p>}
          <ul className="divide-y divide-line">
            {(mine as Booking[] ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-ink">{fmtDay(b.leave_date)}</p>
                  <p className={b.status === 'confirmed' ? 'text-xs text-emerald-700 dark:text-emerald-400' : 'text-xs text-amber-700 dark:text-amber-300'}>
                    {b.status === 'confirmed' ? 'Confirmed' : `Waitlist #${wlPos(b)}`}
                    <span className="text-faint"> · booked {fmtDateTime(b.booked_at, org.timezone)}</span>
                  </p>
                </div>
                <form action={cancelBooking.bind(null, orgId, back)}>
                  <input type="hidden" name="booking" value={b.id} />
                  <button className="text-xs text-red-600 hover:underline dark:text-red-400">Cancel</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
