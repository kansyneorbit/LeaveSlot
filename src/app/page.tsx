import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/session'

const steps = [
  ['Set the rules once', 'Number of employees, how many may be on leave per day, and when booking opens (e.g. the 20th at 9:00 for next month).'],
  ['Booking opens for everyone at once', 'A live countdown, then each day shows slots left, like a train chart. The first to book gets the slot.'],
  ['Full? Join the waitlist', 'If someone cancels, the next person on the waitlist is confirmed automatically and notified.'],
]

export default async function Home() {
  if (await getUser()) redirect('/app')
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
      <p className="text-sm font-semibold tracking-wide text-brand">LEAVESLOT</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Fair leave booking: first come, first served.</h1>
      <p className="mt-4 max-w-xl text-soft">
        No more paper lists on the 20th. Every employee books leave from their own login the moment booking opens,
        with a fixed number of people allowed off each day.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Get started</Link>
        <Link href="/login" className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted">Sign in</Link>
      </div>
      <ol className="mt-12 grid gap-4 sm:grid-cols-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="rounded-lg border border-line bg-surface p-4">
            <p className="text-xs font-semibold text-brand">STEP {i + 1}</p>
            <p className="mt-1 font-medium text-ink">{title}</p>
            <p className="mt-1 text-sm text-soft">{body}</p>
          </li>
        ))}
      </ol>
    </main>
  )
}
