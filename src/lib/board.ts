import { createClient } from '@/lib/supabase/server'
import { addMonths, isMonthParam, monthDays } from '@/lib/dates'
import type { Booking, DayLimit, Member, Org } from '@/lib/types'

export type DayInfo = {
  date: string
  capacity: number
  note: string | null
  confirmed: { id: string; member_id: string; name: string; booked_at: string }[]
  waitlist: { id: string; member_id: string; name: string; booked_at: string }[]
}

// Everything the booking board and roster need for one month, read with the user's own RLS.
export async function loadMonth(org: Org, monthParam: string | undefined) {
  const supabase = await createClient()
  const { data: nowClock } = await supabase.rpc('ls_clock', { p_org: org.id, p_month: new Date().toISOString().slice(0, 10) })
  const today = (nowClock as { local_today: string }[])[0].local_today
  const thisMonth = today.slice(0, 8) + '01'
  const nextMonth = addMonths(thisMonth, 1)

  const { data: nextClock } = await supabase.rpc('ls_clock', { p_org: org.id, p_month: nextMonth })
  const { server_now: serverNow, opens: nextOpens } = (nextClock as { server_now: string; opens: string }[])[0]
  const nextOpen = new Date(nextOpens) <= new Date(serverNow)

  const month = isMonthParam(monthParam) ? monthParam + '-01' : nextOpen ? nextMonth : thisMonth
  const days = monthDays(month)
  const first = days[0], last = days[days.length - 1]

  const [{ data: bookings }, { data: members }, { data: limits }] = await Promise.all([
    supabase.from('ls_bookings').select('id, seq, member_id, leave_date, status, booked_at')
      .eq('org_id', org.id).gte('leave_date', first).lte('leave_date', last).neq('status', 'cancelled').order('seq'),
    supabase.from('ls_members').select('id, name, email, mobile, role, is_active, user_id, org_id').eq('org_id', org.id).order('name'),
    supabase.from('ls_day_limits').select('day, max_slots, note').eq('org_id', org.id).gte('day', first).lte('day', last),
  ])
  const names = new Map((members as Member[] ?? []).map((m) => [m.id, m.name]))
  const limitByDay = new Map((limits as DayLimit[] ?? []).map((l) => [l.day, l]))

  const info: DayInfo[] = days.map((date) => {
    const lim = limitByDay.get(date)
    const rows = (bookings as Booking[] ?? []).filter((b) => b.leave_date === date)
    const pick = (s: Booking['status']) => rows.filter((b) => b.status === s)
      .map((b) => ({ id: b.id, member_id: b.member_id, name: names.get(b.member_id) ?? '—', booked_at: b.booked_at }))
    return { date, capacity: lim?.max_slots ?? org.daily_limit, note: lim?.note ?? null, confirmed: pick('confirmed'), waitlist: pick('waitlisted') }
  })

  let opens = nextOpens
  if (month !== nextMonth) {
    const { data: c } = await supabase.rpc('ls_clock', { p_org: org.id, p_month: month })
    opens = (c as { opens: string }[])[0].opens
  }
  const isOpen = new Date(opens) <= new Date(serverNow)
  return { today, thisMonth, nextMonth, month, days: info, opens, isOpen, serverNow, members: (members ?? []) as Member[] }
}
