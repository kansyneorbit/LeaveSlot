// Runs all LeaveSlot migrations on PGlite with a stub of Supabase's auth schema,
// then checks tenant isolation, roles and first-come booking rules as different logins.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const migration = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const db = new PGlite();

await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
`);
await db.exec(migration);
console.log('migration applied');

const id = n => `00000000-0000-0000-0000-0000000000${n}`;
const A = id('0a'), B = id('0b'), E1 = id('e1'), E2 = id('e2'), E3 = id('e3'), E4 = id('e4'), U = id('ff');
await db.exec(`INSERT INTO auth.users VALUES
  ('${A}', 'admin@pmr.org', now()), ('${B}', 'boss@other.org', now()),
  ('${E1}', 'e1@pmr.org', now()), ('${E2}', 'e2@pmr.org', now()), ('${E3}', 'E3@pmr.org', now()),
  ('${E4}', 'e4@pmr.org', now()), ('${U}', 'u@pmr.org', NULL)`);

async function as(uid, sql, params = []) {
  await db.exec('BEGIN');
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await db.exec(`SET LOCAL ROLE ${uid ? 'authenticated' : 'anon'}`);
    const r = await db.query(sql, params);
    await db.exec('COMMIT');
    return r.rows;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

let pass = 0, fail = 0;
async function expectOk(name, fn, check) {
  try {
    const r = await fn();
    if (check && !check(r)) throw new Error('unexpected result ' + JSON.stringify(r));
    pass++; console.log('  ok   ', name);
    return r;
  } catch (e) { fail++; console.log('  FAIL ', name, '->', e.message); }
}
async function expectErr(name, fn, match) {
  try { const r = await fn(); fail++; console.log('  FAIL ', name, '-> no error', JSON.stringify(r)); }
  catch (e) {
    if (match && !match.test(e.message)) { fail++; console.log('  FAIL ', name, '-> wrong error', e.message); return; }
    pass++; console.log('  ok   ', name, '(' + e.message + ')');
  }
}

// Booking for a month opens on the 1st of the month before at 00:00, so next month is always open
// and the month after is always closed, whatever day the test runs.
const create = `SELECT public.ls_create_org($1, $2, 5, 2, 1, '00:00') AS id`;
await expectErr('unconfirmed email cannot create an org', () => as(U, create, ['Nope', 'U']), /Confirm your email/);
const [{ id: X }] = await as(A, create, ['PMR Department', 'Dr Admin']);
const [{ id: Y }] = await as(B, create, ['Other Dept', 'Boss']);

const [{ next, after, today }] = (await db.query(`SELECT
  (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date AS next,
  (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') + interval '2 month')::date AS after,
  (now() AT TIME ZONE 'Asia/Kolkata')::date AS today`)).rows;
const day = n => { const d = new Date(next); d.setUTCDate(n); return d.toISOString().slice(0, 10); };
const D1 = day(5), D2 = day(6), D3 = day(7), D4 = day(8), D5 = day(9);

await expectOk('creator is the admin, seeded from login email', () => as(A, 'SELECT role, email FROM ls_members'),
  r => r.length === 1 && r[0].role === 'admin' && r[0].email === 'admin@pmr.org');
await expectOk('A sees only own org', () => as(A, 'SELECT id FROM ls_orgs'), r => r.length === 1 && r[0].id === X);
await expectErr('anon sees nothing', () => as(null, 'SELECT * FROM ls_orgs'));

const addMember = (uid, org, name, email) =>
  as(uid, `INSERT INTO ls_members (org_id, name, email) VALUES ($1, $2, $3) RETURNING id`, [org, name, email]);
for (const [n, e] of [['One', 'e1@pmr.org'], ['Two', 'e2@pmr.org'], ['Three', 'e3@pmr.org'], ['Four', 'e4@pmr.org']]) {
  await expectOk(`admin adds ${n}`, () => addMember(A, X, n, e));
}
await expectErr('6th person exceeds 5 seats', () => addMember(A, X, 'Six', 'six@pmr.org'), /seats are in use/);
await expectErr('B cannot add people to A\'s org', () => addMember(B, X, 'Spy', 'spy@x.org'), /Only admins/);
await expectErr('admin cannot set user_id directly',
  () => as(A, `UPDATE ls_members SET user_id = $1 WHERE email = 'e4@pmr.org'`, [B]));

for (const u of [E1, E2, E3]) {
  await expectOk('employee accepts invite', () => as(u, 'SELECT public.ls_accept_invites() AS n'), r => r[0].n === 1);
}
await expectErr('employee cannot add people', () => addMember(E1, X, 'Friend', 'friend@pmr.org'), /Only admins/);
await expectErr('unconfirmed login links nothing and sees nothing',
  () => as(U, 'SELECT public.ls_clock($1, $2)', [X, next]), /Not a member/);

const book = (uid, dates, org = X) => as(uid, 'SELECT * FROM public.ls_book($1, $2::date[])', [org, dates]);
await expectOk('E1 books D1: confirmed', () => book(E1, [D1]), r => r[0].status === 'confirmed');
await expectOk('E2 books D1: confirmed', () => book(E2, [D1]), r => r[0].status === 'confirmed');
await expectOk('E3 books D1: waitlisted #1 (2 per day)', () => book(E3, [D1]),
  r => r[0].status === 'waitlisted' && r[0].waitlist_position === 1);
await expectErr('E1 cannot book D1 twice', () => book(E1, [D1]), /already have/);
await expectErr('month after next is not open yet', () => book(E1, [after]), /opens on/);
await expectErr('today cannot be booked', () => book(E1, [today]), /has passed/);
await expectErr('B cannot book in A\'s org', () => book(B, [D2]), /Not a member/);
await expectOk('B sees no bookings of A\'s org', () => as(B, 'SELECT * FROM ls_bookings'), r => r.length === 0);
await expectOk('E2 sees the department roster', () => as(E2, 'SELECT * FROM ls_bookings'), r => r.length === 3);
await expectErr('employee cannot write bookings directly',
  () => as(E3, `UPDATE ls_bookings SET status = 'confirmed' WHERE status = 'waitlisted'`));
await expectErr('employee cannot insert bookings directly',
  () => as(E3, `INSERT INTO ls_bookings (org_id, member_id, leave_date, status)
                SELECT org_id, id, $1::date, 'confirmed' FROM ls_members WHERE user_id = auth.uid()`, [D2]));

const bookingOf = async (uid, d) => (await db.query(
  `SELECT b.id FROM ls_bookings b JOIN ls_members m ON m.id = b.member_id
   WHERE m.user_id = $1 AND b.leave_date = $2 AND b.status <> 'cancelled'`, [uid, d])).rows[0].id;
await expectErr('E3 cannot cancel E1\'s booking', async () =>
  as(E3, 'SELECT public.ls_cancel($1)', [await bookingOf(E1, D1)]), /not found/);
await expectOk('E1 cancels D1', async () => as(E1, 'SELECT public.ls_cancel($1)', [await bookingOf(E1, D1)]));
await expectOk('E3 moved up from the waitlist', () => as(E3, `SELECT status FROM ls_bookings b
  JOIN ls_members m ON m.id = b.member_id WHERE m.user_id = auth.uid()`), r => r[0].status === 'confirmed');
await expectOk('E3 was notified, E2 sees no one else\'s notifications',
  async () => [await as(E3, 'SELECT message FROM ls_notifications'), await as(E2, 'SELECT * FROM ls_notifications')],
  ([mine, other]) => mine.length === 1 && /moved up/.test(mine[0].message) && other.length === 0);
await expectOk('E1 can book D1 again (back of the queue: waitlisted)', () => book(E1, [D1]),
  r => r[0].status === 'waitlisted' && r[0].waitlist_position === 1);

// Day overrides and daily limit
await expectErr('employee cannot set day limits',
  () => as(E1, `INSERT INTO ls_day_limits (org_id, day, max_slots) VALUES ($1, $2, 0)`, [X, D2]));
await expectErr('B cannot upsert day limits into A\'s org',
  () => as(B, `INSERT INTO ls_day_limits (org_id, day, max_slots) VALUES ($1, $2, 9)
               ON CONFLICT (org_id, day) DO UPDATE SET max_slots = 9`, [X, D2]));
await expectOk('admin blocks D2', () => as(A, `INSERT INTO ls_day_limits (org_id, day, max_slots, note) VALUES ($1, $2, 0, 'Audit')`, [X, D2]));
await expectErr('blocked day cannot be booked', () => book(E1, [D2]), /not allowed/);
await expectErr('booking is all-or-nothing', () => book(E1, [D3, D2]), /not allowed/);
await expectOk('nothing booked on D3 after the failed batch',
  () => as(E1, 'SELECT * FROM ls_bookings WHERE leave_date = $1', [D3]), r => r.length === 0);
await expectOk('raising the daily limit promotes the waitlist',
  async () => { await as(A, 'UPDATE ls_orgs SET daily_limit = 3 WHERE id = $1', [X]);
                return as(E1, 'SELECT status FROM ls_bookings WHERE leave_date = $1 AND status <> \'cancelled\'', [D1]); },
  r => r.length === 3 && r.every(b => b.status === 'confirmed'));
await expectErr('employee cannot change org settings',
  () => as(E1, 'UPDATE ls_orgs SET daily_limit = 30 WHERE id = $1 RETURNING id', [X]).then(r => { if (!r.length) throw new Error('no rows'); return r; }));
await expectErr('bad time zone rejected', () => as(A, `UPDATE ls_orgs SET timezone = 'Mars/Base' WHERE id = $1`, [X]));
await expectErr('seats cannot go below active people', () => as(A, 'UPDATE ls_orgs SET seat_limit = 2 WHERE id = $1', [X]), /active/);

// Monthly cap and multi-day booking
await as(A, 'UPDATE ls_orgs SET monthly_cap = 3 WHERE id = $1', [X]);
await expectOk('E2 books two more days in one go', () => book(E2, [D4, D3]), r => r.length === 2 && r[0].leave_date < r[1].leave_date || r.length === 2);
await expectErr('E2 hits the monthly cap of 3', () => book(E2, [D5]), /at most 3/);

// Admin powers
await expectOk('admin cancels E2\'s D4 and E2 is notified', async () => {
  await as(A, 'SELECT public.ls_cancel($1)', [await bookingOf(E2, D4)]);
  return as(E2, 'SELECT message FROM ls_notifications');
}, r => r.some(n => /admin cancelled/.test(n.message)));
await expectErr('the last admin cannot step down',
  () => as(A, `UPDATE ls_members SET role = 'employee' WHERE email = 'admin@pmr.org'`), /at least one active admin/);
await expectOk('admin deactivates E4', () => as(A, `UPDATE ls_members SET is_active = false WHERE email = 'e4@pmr.org' RETURNING id`), r => r.length === 1);
await expectOk('E4 signs up later: invite still links, but inactive sees nothing',
  async () => { await as(E4, 'SELECT public.ls_accept_invites()'); return as(E4, 'SELECT * FROM ls_orgs'); }, r => r.length === 0);
await expectOk('clock gives opening time for next month', () => as(E1, 'SELECT * FROM public.ls_clock($1, $2)', [X, next]),
  r => r.length === 1 && new Date(r[0].opens) <= new Date());
await expectOk('notifications can be marked read', () => as(E3, 'UPDATE ls_notifications SET is_read = true RETURNING id'), r => r.length === 1);
await expectErr('employee cannot rename a colleague', () => as(E1, `UPDATE ls_members SET name = 'x' WHERE email = 'e2@pmr.org' RETURNING id`)
  .then(r => { if (!r.length) throw new Error('no rows'); return r; }));
await expectOk('B\'s org is untouched', () => as(B, 'SELECT daily_limit FROM ls_orgs'), r => r.length === 1 && r[0].daily_limit === 2 && Y);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
