// Turns spreadsheet rows (from .xlsx or .csv) into { name, email, mobile } people.
// Works with a header row (any order, e.g. "Employee Name | Mobile No | Email ID") and,
// without one, by recognising each cell: an '@' is the email, 7–15 digits the mobile.

export type Person = { name: string; email: string; mobile: string }
type Cell = string | number | boolean | Date | null | undefined

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function cleanMobile(v: Cell) {
  if (v === null || v === undefined || v === '') return ''
  const s = typeof v === 'number' ? String(Math.round(v)) : String(v)
  return s.replace(/[\s\-().]/g, '')
}

const text = (v: Cell) => (v === null || v === undefined ? '' : v instanceof Date ? '' : String(v).trim())

function findHeader(rows: Cell[][]) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map((c) => text(c).toLowerCase())
    const email = cells.findIndex((c) => /e-?mail/.test(c))
    const name = cells.findIndex((c) => /name/.test(c) && !/last|sur/.test(c))
    if (email >= 0 && name >= 0) {
      return {
        row: i,
        name,
        last: cells.findIndex((c) => /last ?name|surname/.test(c)),
        email,
        mobile: cells.findIndex((c) => /mobile|phone|contact|cell|whatsapp/.test(c)),
      }
    }
  }
  return null
}

export function rowsToPeople(rows: Cell[][]): Person[] {
  const h = findHeader(rows)
  const people: Person[] = []
  for (const row of h ? rows.slice(h.row + 1) : rows) {
    let p: Person
    if (h) {
      const first = text(row[h.name])
      const last = h.last >= 0 ? text(row[h.last]) : ''
      p = { name: [first, last].filter(Boolean).join(' '), email: text(row[h.email]), mobile: h.mobile >= 0 ? cleanMobile(row[h.mobile]) : '' }
    } else {
      const email = row.map(text).find((c) => c.includes('@')) ?? ''
      const mobile = row.map(cleanMobile).find((c) => /^\+?[0-9]{7,15}$/.test(c)) ?? ''
      const name = row.map(text).find((c) => c && !c.includes('@') && cleanMobile(c) !== mobile && !/^\+?[0-9\s-]+$/.test(c)) ?? ''
      p = { name, email, mobile }
    }
    p.email = p.email.toLowerCase()
    if (p.name || p.email || p.mobile) people.push(p)
  }
  return people
}

// Minimal CSV reader: commas or tabs, double-quoted fields with "" escapes.
export function parseCsv(src: string): string[][] {
  const out: string[][] = []
  const sep = (src.split('\n')[0].match(/\t/g)?.length ?? 0) > (src.split('\n')[0].match(/,/g)?.length ?? 0) ? '\t' : ','
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); out.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); out.push(row) }
  return out
}

export type AddResult = { error?: string; notice?: string; added?: number }
