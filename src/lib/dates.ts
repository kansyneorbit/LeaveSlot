// Calendar helpers. Dates are plain 'YYYY-MM-DD' strings (the org's local days);
// all arithmetic is done in UTC so the server's own time zone never matters.

export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const parse = (s: string) => new Date(s + 'T00:00:00Z')

export function monthStart(s: string) {
  return s.slice(0, 7) + '-01'
}

export function addMonths(s: string, n: number) {
  const d = parse(monthStart(s))
  d.setUTCMonth(d.getUTCMonth() + n)
  return iso(d)
}

export function daysInMonth(month: string) {
  const d = parse(monthStart(month))
  d.setUTCMonth(d.getUTCMonth() + 1, 0)
  return d.getUTCDate()
}

export function monthDays(month: string) {
  const start = monthStart(month)
  return Array.from({ length: daysInMonth(start) }, (_, i) => start.slice(0, 8) + String(i + 1).padStart(2, '0'))
}

// Monday-first offset of the 1st of the month.
export function leadingBlanks(month: string) {
  return (parse(monthStart(month)).getUTCDay() + 6) % 7
}

export function fmtMonth(s: string) {
  return parse(monthStart(s)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function fmtDay(s: string) {
  return parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function fmtDateTime(ts: string, timeZone: string) {
  return new Date(ts).toLocaleString('en-IN', {
    timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const isMonthParam = (s: string | undefined): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
