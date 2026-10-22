import Link from 'next/link'
import { Banner, Card, PageHeader } from '@/components/ui'
import { requireMember } from '@/lib/session'
import { loadMonth } from '@/lib/board'
import { addMonths, fmtDateTime, fmtDay, fmtMonth } from '@/lib/dates'
import { cancelBooking } from '../actions'

export const metadata = { title: 'Roster' }

export default async function RosterPage({ params, searchParams }: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ m?: string; error?: string; notice?: string }>
}) {
  const { orgId } = await params
  const { m, error, notice } = await searchParams
  const { member, org } = await requireMember(orgId)
  const board = await loadMonth(org, m)
  const isAdmin = member.role === 'admin'
  const ym = board.month.slice(0, 7)
  const back = `/o/${orgId}/roster?m=${ym}`
  const linkClass = 'rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:bg-muted'

  const Cancel = ({ id, date }: { id: string; date: string }) =>
    isAdmin && date >= board.today ? (
      <form action={cancelBooking.bind(null, orgId, back)} className="inline">
        <input type="hidden" name="booking" value={id} />
        <button className="ml-1 text-xs text-red-600 hover:underline dark:text-red-400" title="Cancel this leave">✕</button>
      </form>
    ) : null

  return (
    <div className="space-y-4">
      <PageHeader title={`Roster — ${fmtMonth(board.month)}`}>
        <Link href={`/o/${orgId}/roster?m=${addMonths(board.month, -1).slice(0, 7)}`} className={linkClass}>←</Link>
        <Link href={`/o/${orgId}/roster?m=${addMonths(board.month, 1).slice(0, 7)}`} className={linkClass}>→</Link>
        <a href={`/o/${orgId}/roster/csv?m=${ym}`} className={linkClass}>Download CSV</a>
      </PageHeader>
      {error && <Banner>{error}</Banner>}
      {notice && !error && <Banner tone="info">{notice}</Banner>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase text-faint">
            <tr><th className="px-3 py-2">Day</th><th className="px-3 py-2">On leave</th><th className="px-3 py-2">Waitlist</th><th className="px-3 py-2 text-right">Slots</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {board.days.map((d) => (
              <tr key={d.date} className={d.date === board.today ? 'bg-brand/5' : ''}>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{fmtDay(d.date)}</td>
                <td className="px-3 py-2 text-ink">
                  {d.confirmed.length === 0 && <span className="text-faint">—</span>}
                  {d.confirmed.map((b, i) => (
                    <span key={b.id} title={`Booked ${fmtDateTime(b.booked_at, org.timezone)}`}>
                      {i > 0 && ', '}{b.name}<Cancel id={b.id} date={d.date} />
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2 text-amber-700 dark:text-amber-300">
                  {d.waitlist.map((b, i) => (
                    <span key={b.id}>{i > 0 && ', '}{i + 1}. {b.name}<Cancel id={b.id} date={d.date} /></span>
                  ))}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-soft">
                  {d.capacity === 0 ? <span className="text-red-600 dark:text-red-400">No leave{d.note ? ` · ${d.note}` : ''}</span>
                    : `${d.confirmed.length}/${d.capacity}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
