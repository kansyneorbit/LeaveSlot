import { NextResponse, type NextRequest } from 'next/server'
import { requireMember } from '@/lib/session'
import { loadMonth } from '@/lib/board'

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

// One row per booking in the month: date, name, status, waitlist position, booked at.
export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const { org } = await requireMember(orgId)
  const board = await loadMonth(org, request.nextUrl.searchParams.get('m') ?? undefined)

  const rows = [['Date', 'Name', 'Status', 'Waitlist position', 'Booked at']]
  for (const d of board.days) {
    d.confirmed.forEach((b) => rows.push([d.date, b.name, 'Confirmed', '', b.booked_at]))
    d.waitlist.forEach((b, i) => rows.push([d.date, b.name, 'Waitlisted', String(i + 1), b.booked_at]))
  }
  const csv = rows.map((r) => r.map(cell).join(',')).join('\n')
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leave-${board.month.slice(0, 7)}.csv"`,
    },
  })
}
