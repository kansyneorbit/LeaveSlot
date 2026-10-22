'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fail, requireUser } from '@/lib/session'

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const int = (form: FormData, key: string) => Number.parseInt(str(form, key), 10)

export async function createOrg(form: FormData) {
  await requireUser()
  const name = str(form, 'name')
  const adminName = str(form, 'admin_name')
  const seats = int(form, 'seats')
  const daily = int(form, 'daily_limit')
  const day = int(form, 'booking_day')
  const opens = str(form, 'opens_at') || '09:00'
  if (!name || !adminName) fail('/app', 'Enter the department name and your name.')
  if (!(seats >= 1 && seats <= 1000)) fail('/app', 'Number of employees must be between 1 and 1000.')
  if (!(daily >= 1 && daily <= 100)) fail('/app', 'People on leave per day must be between 1 and 100.')
  if (!(day >= 1 && day <= 28)) fail('/app', 'Booking day must be between 1 and 28.')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ls_create_org', {
    p_name: name, p_admin_name: adminName, p_seats: seats, p_daily_limit: daily,
    p_booking_day: day, p_opens_at: opens, p_timezone: 'Asia/Kolkata',
  })
  if (error) fail('/app', error.message)
  redirect(`/o/${data}/team?welcome=1`)
}
