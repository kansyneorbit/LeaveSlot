'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fail, requireMember } from '@/lib/session'
import { fmtDay } from '@/lib/dates'

export async function bookDays(orgId: string, month: string, form: FormData) {
  await requireMember(orgId)
  const back = `/o/${orgId}?m=${month.slice(0, 7)}`
  const dates = form.getAll('date').map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (dates.length === 0) fail(back, 'Pick at least one day.')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ls_book', { p_org: orgId, p_dates: dates })
  if (error) fail(back, error.message)
  const rows = data as { leave_date: string; status: string; waitlist_position: number | null }[]
  const ok = rows.filter((r) => r.status === 'confirmed').map((r) => fmtDay(r.leave_date))
  const wl = rows.filter((r) => r.status === 'waitlisted').map((r) => `${fmtDay(r.leave_date)} (WL ${r.waitlist_position})`)
  const notice = [ok.length && `Confirmed: ${ok.join(', ')}.`, wl.length && `Waitlisted: ${wl.join(', ')}.`]
    .filter(Boolean).join(' ')
  revalidatePath(`/o/${orgId}`, 'layout')
  redirect(`${back}&notice=${encodeURIComponent(notice)}`)
}

export async function cancelBooking(orgId: string, back: string, form: FormData) {
  await requireMember(orgId)
  const supabase = await createClient()
  const { error } = await supabase.rpc('ls_cancel', { p_booking: String(form.get('booking') ?? '') })
  if (error) fail(back, error.message)
  revalidatePath(`/o/${orgId}`, 'layout')
  const sep = back.includes('?') ? '&' : '?'
  redirect(`${back}${sep}notice=${encodeURIComponent('Leave cancelled. If anyone was waitlisted, they have the slot now.')}`)
}

export async function markRead(orgId: string) {
  const { member } = await requireMember(orgId)
  const supabase = await createClient()
  await supabase.from('ls_notifications').update({ is_read: true }).eq('member_id', member.id).eq('is_read', false)
  revalidatePath(`/o/${orgId}`)
}
