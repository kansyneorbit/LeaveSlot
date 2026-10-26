'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fail, requireAdmin } from '@/lib/session'
import { EMAIL_RE, cleanMobile, type AddResult } from '@/lib/people-import'

// Rows come from the Name / Email / Mobile table (typed or imported from Excel).
// Returns a message instead of redirecting, so a mistake doesn't wipe the table.
export async function addPeople(orgId: string, _prev: AddResult, form: FormData): Promise<AddResult> {
  const { org } = await requireAdmin(orgId)
  const names = form.getAll('name').map((v) => String(v).trim())
  const emails = form.getAll('email').map((v) => String(v).trim().toLowerCase())
  const mobiles = form.getAll('mobile').map((v) => cleanMobile(String(v)))

  const problems: string[] = []
  const seen = new Set<string>()
  const rows: { org_id: string; name: string; email: string; mobile: string | null }[] = []
  names.forEach((name, i) => {
    const email = emails[i] ?? '', mobile = mobiles[i] ?? ''
    if (!name && !email && !mobile) return
    const n = i + 1
    if (!name) problems.push(`row ${n}: name is missing`)
    else if (name.length > 100) problems.push(`row ${n}: name is too long`)
    if (!EMAIL_RE.test(email)) problems.push(`row ${n}: email "${email || 'blank'}" isn't valid`)
    if (mobile && !/^\+?[0-9]{7,15}$/.test(mobile)) problems.push(`row ${n}: mobile should be 7–15 digits`)
    if (seen.has(email)) problems.push(`row ${n}: ${email} appears twice`)
    seen.add(email)
    rows.push({ org_id: orgId, name, email, mobile: mobile || null })
  })
  if (rows.length === 0) return { error: 'Add at least one person.' }
  if (problems.length) {
    const more = problems.length > 5 ? ` (and ${problems.length - 5} more)` : ''
    return { error: `Fix these and try again: ${problems.slice(0, 5).join('; ')}${more}.` }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase.from('ls_members').select('email, is_active').eq('org_id', orgId)
  const known = new Set((existing ?? []).map((m) => m.email))
  const fresh = rows.filter((r) => !known.has(r.email))
  const skipped = rows.length - fresh.length
  if (fresh.length === 0) return { error: `All ${rows.length} are already in the team.` }

  const active = (existing ?? []).filter((m) => m.is_active).length
  if (active + fresh.length > org.seat_limit) {
    return {
      error: `That's ${fresh.length} new people but only ${Math.max(org.seat_limit - active, 0)} of ${org.seat_limit} seats are free. `
        + 'Raise the number of employees in Settings first.',
    }
  }

  const { error } = await supabase.from('ls_members').insert(fresh)
  if (error) return { error: error.code === '23505' ? 'Someone in this list was just added — refresh and try again.' : error.message }
  revalidatePath(`/o/${orgId}/team`)
  const plural = (k: number) => `${k} ${k === 1 ? 'person' : 'people'}`
  return {
    added: fresh.length,
    notice: `Added ${plural(fresh.length)}.${skipped ? ` Skipped ${skipped} already in the team.` : ''}`,
  }
}

export async function updatePerson(orgId: string, form: FormData) {
  await requireAdmin(orgId)
  const back = `/o/${orgId}/team`
  const id = String(form.get('id') ?? '')
  const patch: Record<string, unknown> = {}
  if (form.has('role')) patch.role = form.get('role') === 'admin' ? 'admin' : 'employee'
  if (form.has('active')) patch.is_active = form.get('active') === 'true'

  const supabase = await createClient()
  const { error } = await supabase.from('ls_members').update(patch).eq('id', id).eq('org_id', orgId)
  if (error) fail(back, error.message)
  revalidatePath(back)
  redirect(back)
}
