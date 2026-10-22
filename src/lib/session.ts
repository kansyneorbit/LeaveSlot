import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Member, Org } from '@/lib/types'

export const ORG_COLUMNS = 'id, name, seat_limit, daily_limit, booking_day, opens_at, monthly_cap, allow_waitlist, timezone'

export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

// The signed-in user's seat in an organisation, or back to the picker.
export const requireMember = cache(async (orgId: string) => {
  if (!isUuid(orgId)) redirect('/app')
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('ls_members')
    .select(`id, org_id, user_id, name, email, mobile, role, is_active, ls_orgs!inner(${ORG_COLUMNS})`)
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) redirect('/app')
  const { ls_orgs, ...member } = data as unknown as Member & { ls_orgs: Org }
  return { member: member as Member, org: ls_orgs }
})

export async function requireAdmin(orgId: string) {
  const ctx = await requireMember(orgId)
  if (ctx.member.role !== 'admin') redirect(`/o/${orgId}`)
  return ctx
}

// Redirect back to a form with a message shown in an error banner.
export function fail(path: string, message: string): never {
  const sep = path.includes('?') ? '&' : '?'
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`)
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
