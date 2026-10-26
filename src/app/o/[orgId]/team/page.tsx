import { headers } from 'next/headers'
import { Banner, Card, PageHeader } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/session'
import type { Member } from '@/lib/types'
import { addPeople, updatePerson } from './actions'
import { PeopleForm } from './people-form'

export const metadata = { title: 'Team' }

export default async function TeamPage({ params, searchParams }: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ error?: string; notice?: string; welcome?: string }>
}) {
  const { orgId } = await params
  const { error, notice, welcome } = await searchParams
  const { member: me, org } = await requireAdmin(orgId)
  const supabase = await createClient()
  const { data } = await supabase.from('ls_members')
    .select('id, org_id, user_id, name, email, mobile, role, is_active')
    .eq('org_id', orgId).order('is_active', { ascending: false }).order('name')
  const people = (data ?? []) as Member[]
  const active = people.filter((p) => p.is_active).length

  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`

  return (
    <div className="space-y-6">
      <PageHeader title="Team">
        <span className="text-sm text-soft">{active} of {org.seat_limit} seats used</span>
      </PageHeader>
      {welcome && (
        <Banner tone="info">
          Your department is ready. Add your employees below, then share the sign-up link with them.
        </Banner>
      )}
      {error && <Banner>{error}</Banner>}
      {notice && !error && <Banner tone="info">{notice}</Banner>}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-ink">Add employees</h2>
          <PeopleForm action={addPeople.bind(null, orgId)} />
        </Card>
        <Card className="h-fit p-4 text-sm text-soft">
          <h2 className="mb-2 font-semibold text-ink">How employees join</h2>
          <p>Send them this link. They create a login with the <b>same email</b> you added and land straight in {org.name}.</p>
          <p className="mt-2 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs text-ink">{origin}/signup</p>
        </Card>
      </div>

      <div>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-faint">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Login</th><th className="px-3 py-2">Role</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((p) => (
                <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{p.name}</p>
                    <p className="text-xs text-soft">{p.email}{p.mobile ? ` · ${p.mobile}` : ''}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {p.user_id ? <span className="text-emerald-700 dark:text-emerald-400">Joined</span> : <span className="text-faint">Not signed up yet</span>}
                  </td>
                  <td className="px-3 py-2">
                    <form action={updatePerson.bind(null, orgId)}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="role" value={p.role === 'admin' ? 'employee' : 'admin'} />
                      <button className="text-xs text-soft hover:text-ink" disabled={p.id === me.id} title={p.id === me.id ? 'Another admin must change your role' : 'Switch role'}>
                        {p.role === 'admin' ? 'Admin' : 'Employee'}{p.id !== me.id && ' ⇄'}
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.id !== me.id && (
                      <form action={updatePerson.bind(null, orgId)}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={String(!p.is_active)} />
                        <button className={`text-xs hover:underline ${p.is_active ? 'text-red-600 dark:text-red-400' : 'text-brand'}`}>
                          {p.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
