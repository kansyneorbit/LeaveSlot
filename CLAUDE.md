# LeaveSlot — project notes

First-come, first-served leave booking SaaS (first customer: Rajagiri hospital PMR department).
Each department is a tenant (`ls_orgs`); booking for month M opens on `booking_day` of
month M-1 at `opens_at` (org time zone), and at most `daily_limit` people get each day.
Later bookers are waitlisted and promoted automatically when a slot frees.

## Accounts and shared infrastructure
- Supabase: shares Kansyne Orbit's project `ifockdecghiljjywltiz` (kansyneorbit@gmail.com), reached
  through the `supabase-orbit` MCP server configured in the Orbit repo. Every LeaveSlot object is
  prefixed `ls_` (tables/RPCs in `public`, helpers in the non-exposed `ls_private` schema). Never
  touch Orbit's tables from here. Logins (auth.users) are shared with Orbit.
- Auth redirect URLs: add this app's URLs (`http://localhost:3001/**` and the Vercel URL) under
  Supabase → Authentication → URL Configuration, or confirmation links land on Orbit's site.
- Vercel: kansyneorbit account via `vercel-orbit`, team `orbit-kansyne`.

## Rules
- All data access is server-side with the signed-in user's Supabase client, so RLS applies.
  Never use a service-role key in the app.
- Bookings are written only by `ls_book()` / `ls_cancel()`. Both lock the org row
  (`SELECT … FOR UPDATE`), which is what makes booking strictly first-come. Keep it that way.
- Members are added by admins (email, optional mobile) and linked by `ls_accept_invites()` when
  that email signs in. Login is email + password; mobile is stored for a future SMS-OTP login.
- Column-level grants limit what can be updated (e.g. `user_id`, `org_id` on members can't be).
- Every schema change is a new file in `supabase/migrations/`; run `npm run test:db` (PGlite + auth
  stub) and add a test for every new rule.

## App (Next.js 16 + TypeScript + Tailwind 4)
- `npm run dev` (port 3001), `npm run build`, `npm run typecheck`, `npm run test:db`.
- `/app` picks a department or creates one; everything else is under `/o/[orgId]/…`:
  Book leave (calendar, countdown, my bookings), Roster (+ CSV), Team and Settings (admin only).
- Forms are Server Actions next to their page; failures redirect back with `?error=`.

## Status (2026-10-22)
- Applied to Supabase: `20261022000000_leaveslot_core` (recorded there as `leaveslot_core`).
- Not yet: GitHub repo / Vercel project, payments, SMS login, email notifications.
