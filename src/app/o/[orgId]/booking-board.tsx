'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SubmitButton } from '@/components/submit-button'
import type { DayInfo } from '@/lib/board'

type Props = {
  days: DayInfo[]
  blanks: number
  today: string
  meId: string
  isOpen: boolean
  opensLabel: string
  opens: string
  serverNow: string
  allowWaitlist: boolean
  action: (form: FormData) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function useServerCountdown(target: string, serverNow: string) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now()   // trust the server's clock, not the phone's
    const tick = () => setLeft(Math.max(0, new Date(target).getTime() - (Date.now() + skew)))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [target, serverNow])
  return left
}

function Countdown({ ms }: { ms: number }) {
  const s = Math.floor(ms / 1000)
  const parts = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60]
  const labels = ['days', 'hrs', 'min', 'sec']
  return (
    <div className="flex gap-2">
      {parts.map((p, i) => (
        <div key={labels[i]} className="min-w-14 rounded-md bg-surface px-2 py-1.5 text-center">
          <div className="font-mono text-xl font-semibold tabular-nums text-ink">{String(p).padStart(2, '0')}</div>
          <div className="text-[10px] uppercase text-faint">{labels[i]}</div>
        </div>
      ))}
    </div>
  )
}

export function BookingBoard(p: Props) {
  const router = useRouter()
  const [picked, setPicked] = useState<string[]>([])
  const left = useServerCountdown(p.opens, p.serverNow)

  // Opening moment: reload so the days become bookable. While open, keep slot counts live.
  useEffect(() => {
    if (!p.isOpen && left === 0) router.refresh()
  }, [left, p.isOpen, router])
  useEffect(() => {
    if (!p.isOpen) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, 10000)
    return () => clearInterval(t)
  }, [p.isOpen, router])

  const toggle = (d: string) => setPicked((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))
  const canBook = (d: DayInfo) =>
    p.isOpen && d.date > p.today && d.capacity > 0
    && !d.confirmed.some((b) => b.member_id === p.meId) && !d.waitlist.some((b) => b.member_id === p.meId)
    && (d.capacity > d.confirmed.length || p.allowWaitlist)
  // A refresh (or a booking) can make picked days unbookable; only count the ones still on offer.
  const chosen = picked.filter((date) => p.days.some((d) => d.date === date && canBook(d)))

  return (
    <div>
      {!p.isOpen && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">Booking opens {p.opensLabel}</p>
            <p className="text-sm text-amber-800 dark:text-amber-300">Keep this page open — it unlocks by itself. First come, first served.</p>
          </div>
          {left !== null && <Countdown ms={left} />}
        </div>
      )}

      <form action={p.action}>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-faint sm:gap-2">
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: p.blanks }, (_, i) => <div key={'b' + i} />)}
          {p.days.map((d) => {
            const past = d.date <= p.today
            const free = d.capacity - d.confirmed.length
            const mineOk = d.confirmed.some((b) => b.member_id === p.meId)
            const wlIndex = d.waitlist.findIndex((b) => b.member_id === p.meId)
            const blocked = d.capacity === 0
            const bookable = canBook(d)
            const on = chosen.includes(d.date)

            let tag = '', tone = 'text-faint'
            if (mineOk) { tag = 'YOURS'; tone = 'text-white' }
            else if (wlIndex >= 0) { tag = `YOU WL${wlIndex + 1}`; tone = 'text-amber-700 dark:text-amber-300' }
            else if (past) tag = ''
            else if (blocked) { tag = 'NO LEAVE'; tone = 'text-red-600 dark:text-red-400' }
            else if (free > 0) { tag = `AVL ${free}`; tone = 'text-emerald-700 dark:text-emerald-400' }
            else if (p.allowWaitlist) { tag = `WL ${d.waitlist.length + 1}`; tone = 'text-amber-700 dark:text-amber-300' }
            else { tag = 'FULL'; tone = 'text-red-600 dark:text-red-400' }

            const box = mineOk
              ? 'border-brand bg-brand'
              : on ? 'border-brand bg-brand/10 ring-2 ring-brand'
              : wlIndex >= 0 ? 'border-amber-400 bg-amber-50 dark:bg-amber-950'
              : past || blocked ? 'border-line bg-muted opacity-60'
              : 'border-line bg-surface'
            return (
              <label
                key={d.date}
                title={d.note ?? undefined}
                className={`relative flex min-h-16 flex-col justify-between rounded-md border p-1.5 text-left sm:min-h-20 sm:p-2 ${box} ${bookable ? 'cursor-pointer hover:border-brand' : ''}`}
              >
                <span className={`text-sm font-semibold ${mineOk ? 'text-white' : 'text-ink'}`}>{Number(d.date.slice(8))}</span>
                <span className={`text-[10px] font-semibold leading-tight sm:text-xs ${tone}`}>{tag}</span>
                {bookable && (
                  <input type="checkbox" name="date" value={d.date} checked={on} onChange={() => toggle(d.date)} className="sr-only" />
                )}
              </label>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
          <span><b className="text-emerald-700 dark:text-emerald-400">AVL n</b> slots left</span>
          <span><b className="text-amber-700 dark:text-amber-300">WL n</b> you&apos;d be n-th on the waitlist</span>
          <span><b className="text-red-600 dark:text-red-400">NO LEAVE</b> blocked by admin</span>
        </div>

        {chosen.length > 0 && (
          <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 shadow-lg">
            <span className="text-sm text-ink">
              {chosen.length} day{chosen.length > 1 ? 's' : ''} selected
              <button type="button" onClick={() => setPicked([])} className="ml-3 text-soft underline">clear</button>
            </span>
            <SubmitButton pendingText="Booking…">Book now</SubmitButton>
          </div>
        )}
      </form>
    </div>
  )
}
