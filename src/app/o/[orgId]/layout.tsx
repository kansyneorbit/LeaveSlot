import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { signOut } from '@/app/(auth)/actions'

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const { member, org } = await requireMember(orgId)
  const base = `/o/${orgId}`
  const links = [
    { href: base, label: 'Book leave' },
    { href: `${base}/roster`, label: 'Roster' },
    ...(member.role === 'admin'
      ? [{ href: `${base}/team`, label: 'Team' }, { href: `${base}/settings`, label: 'Settings' }]
      : []),
  ]
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/app" className="min-w-0">
            <span className="block text-xs font-semibold tracking-wide text-brand">LEAVESLOT</span>
            <span className="block truncate text-sm font-medium text-ink">{org.name}</span>
          </Link>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-soft hover:bg-muted hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-soft sm:inline">{member.name}</span>
            <form action={signOut}><button className="text-soft hover:text-ink">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
