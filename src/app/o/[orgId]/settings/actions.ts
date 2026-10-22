'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fail, requireAdmin } from '@/lib/session'

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const int = (form: FormData, key: string) => Number.parseInt(str(form, key), 10)

export async function saveSettings(orgId: string, form: FormData) {
  await requireAdmin(orgId)
  const back = `/o/${orgId}/settings`
  const cap = str(form, 'monthly_cap')
  const supabase = await createClient()
  const { error } = await supabase.from('ls_orgs').update({
    name: str(form, 'name'),
    seat_limit: int(form, 'seat_limit'),
    daily_limit: int(form, 'daily_limit'),
    booking_day: int(form, 'booking_day'),
    opens_at: str(form, 'opens_at') || '09:00',
    monthly_cap: cap ? int(form, 'monthly_cap') : null,
    allow_waitlist: form.get('allow_waitlist') === 'on',
  }).eq('id', orgId)
  if (error) fail(back, error.message.includes('check constraint') ? 'Check the numbers — one is out of range.' : error.message)
  revalidatePath(`/o/${orgId}`, 'layout')
  redirect(`${back}?notice=Saved.`)
}

export async function setDayLimit(orgId: string, form: FormData) {
  await requireAdmin(orgId)
  const back = `/o/${orgId}/settings`
  const day = str(form, 'day')
  const slots = int(form, 'max_slots')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(slots >= 0 && slots <= 100)) fail(back, 'Pick a date and a number of slots (0 blocks the day).')
  const supabase = await createClient()
  const { error } = await supabase.from('ls_day_limits')
    .upsert({ org_id: orgId, day, max_slots: slots, note: str(form, 'note') || null })
  if (error) fail(back, error.message)
  revalidatePath(`/o/${orgId}`, 'layout')
  redirect(back)
}

export async function removeDayLimit(orgId: string, form: FormData) {
  await requireAdmin(orgId)
  const supabase = await createClient()
  await supabase.from('ls_day_limits').delete().eq('org_id', orgId).eq('day', str(form, 'day'))
  revalidatePath(`/o/${orgId}`, 'layout')
  redirect(`/o/${orgId}/settings`)
}
