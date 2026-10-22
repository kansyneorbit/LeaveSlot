'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fail, requireAdmin } from '@/lib/session'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Paste one person per line: "Name, email, mobile" (mobile optional).
export async function addPeople(orgId: string, form: FormData) {
  await requireAdmin(orgId)
  const back = `/o/${orgId}/team`
  const lines = String(form.get('people') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) fail(back, 'Add at least one person.')

  const rows = []
  for (const [i, line] of lines.entries()) {
    const [name = '', email = '', mobile = ''] = line.split(/[,\t]/).map((s) => s.trim())
    const cleanMobile = mobile.replace(/[\s-]/g, '')
    if (!name || !EMAIL.test(email)) fail(back, `Line ${i + 1}: write it as "Name, email, mobile".`)
    if (cleanMobile && !/^\+?[0-9]{7,15}$/.test(cleanMobile)) fail(back, `Line ${i + 1}: mobile should be digits only.`)
    rows.push({ org_id: orgId, name, email: email.toLowerCase(), mobile: cleanMobile || null })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('ls_members').insert(rows)
  if (error) fail(back, error.code === '23505' ? 'One of those emails is already in the team.' : error.message)
  revalidatePath(back)
  redirect(`${back}?notice=${encodeURIComponent(`Added ${rows.length} ${rows.length === 1 ? 'person' : 'people'}.`)}`)
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
