'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Banner, Button, Input } from '@/components/ui'
import { SubmitButton } from '@/components/submit-button'
import { EMAIL_RE, parseCsv, rowsToPeople, type AddResult, type Person } from '@/lib/people-import'



const blank = (): Person => ({ name: '', email: '', mobile: '' })
const TEMPLATE = 'Name,Email,Mobile\nAnu Mathew,anu@example.com,9876543210\n'

export function PeopleForm({ action }: { action: (prev: AddResult, form: FormData) => Promise<AddResult> }) {
  const [rows, setRows] = useState<Person[]>([blank(), blank(), blank()])
  const [importMsg, setImportMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [state, formAction] = useActionState(action, {})
  const fileRef = useRef<HTMLInputElement>(null)

  // After a successful save, start again with an empty sheet.
  useEffect(() => {
    if (state.added) { setRows([blank(), blank(), blank()]); setImportMsg(null) }
  }, [state])

  const set = (i: number, key: keyof Person, value: string) =>
    setRows((r) => r.map((p, j) => (j === i ? { ...p, [key]: value } : p)))
  const filled = rows.filter((p) => p.name || p.email || p.mobile)

  async function importFile(file: File) {
    setImportMsg(null)
    try {
      let cells: (string | number | boolean | Date | null)[][]
      if (/\.csv$|\.txt$/i.test(file.name)) {
        cells = parseCsv(await file.text())
      } else {
        const { readSheet } = await import('read-excel-file/browser')
        cells = (await readSheet(file)) as unknown as typeof cells
      }
      const people = rowsToPeople(cells)
      if (people.length === 0) {
        setImportMsg({ tone: 'error', text: `No employees found in ${file.name}. Use columns Name, Email, Mobile.` })
        return
      }
      setRows((r) => [...r.filter((p) => p.name || p.email || p.mobile), ...people])
      setImportMsg({ tone: 'info', text: `Read ${people.length} ${people.length === 1 ? 'person' : 'people'} from ${file.name}. Check the rows below, then click Add employees.` })
    } catch {
      setImportMsg({ tone: 'error', text: `Couldn't read ${file.name}. Save it as .xlsx or .csv and try again.` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`

  return (
    <form action={formAction} className="space-y-3">
      <div className="rounded-md border border-dashed border-line bg-muted p-3 text-sm">
        <p className="font-medium text-ink">Import from Excel</p>
        <p className="mt-0.5 text-xs text-soft">
          A sheet with columns <b>Name</b>, <b>Email</b>, <b>Mobile</b> (.xlsx or .csv). {' '}
          <a href={templateHref} download="leaveslot-employees.csv" className="text-brand underline">Download template</a>
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
          className="mt-2 block w-full text-xs text-soft file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-muted"
        />
      </div>

      {importMsg && <Banner tone={importMsg.tone}>{importMsg.text}</Banner>}
      {state.error && <Banner>{state.error}</Banner>}
      {state.notice && !state.error && <Banner tone="info">{state.notice}</Banner>}

      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-left text-xs uppercase text-faint">
            <tr>
              <th className="w-6 py-1 font-medium">#</th>
              <th className="py-1 pr-1 font-medium">Name</th>
              <th className="py-1 pr-1 font-medium">Email</th>
              <th className="py-1 pr-1 font-medium">Mobile number</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const used = p.name || p.email || p.mobile
              const badEmail = used && !EMAIL_RE.test(p.email)
              const badMobile = p.mobile && !/^\+?[0-9]{7,15}$/.test(p.mobile)
              return (
                <tr key={i}>
                  <td className="py-1 text-xs text-faint">{i + 1}</td>
                  <td className="py-1 pr-1">
                    <Input name="name" value={p.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Full name"
                      maxLength={100} className={used && !p.name.trim() ? 'border-red-400' : ''} />
                  </td>
                  <td className="py-1 pr-1">
                    <Input name="email" type="email" value={p.email} onChange={(e) => set(i, 'email', e.target.value)}
                      placeholder="name@example.com" className={badEmail ? 'border-red-400' : ''} />
                  </td>
                  <td className="py-1 pr-1">
                    <Input name="mobile" type="tel" inputMode="tel" value={p.mobile} onChange={(e) => set(i, 'mobile', e.target.value)}
                      placeholder="Optional" className={badMobile ? 'border-red-400' : ''} />
                  </td>
                  <td className="py-1 text-right">
                    <button type="button" onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [blank()]))}
                      className="px-1 text-faint hover:text-red-600" aria-label={`Remove row ${i + 1}`}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" onClick={() => setRows((r) => [...r, blank()])}>+ Add row</Button>
        <SubmitButton pendingText="Adding…" disabled={filled.length === 0}>
          Add {filled.length > 0 ? filled.length : ''} employee{filled.length === 1 ? '' : 's'}
        </SubmitButton>
      </div>
    </form>
  )
}
