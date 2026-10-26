'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fail } from '@/lib/session'

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export async function signIn(form: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: str(form, 'email').toLowerCase(),
    password: String(form.get('password') ?? ''),
  })
  if (error) fail('/login', error.message === 'Email not confirmed'
    ? 'Confirm your email first — check your inbox for the link.'
    : 'Wrong email or password.')
  redirect('/app')
}

export async function signUp(form: FormData) {
  const name = str(form, 'name')
  const email = str(form, 'email').toLowerCase()
  const password = String(form.get('password') ?? '')
  if (!name) fail('/signup', 'Enter your name.')
  if (password.length < 8) fail('/signup', 'Use a password of at least 8 characters.')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await origin()}/auth/callback`, data: { full_name: name } },
  })
  if (error) fail('/signup', error.message)
  // Supabase answers an already-registered email with a user that has no identities and sends
  // nothing. Logins are shared with Kansyne Orbit, so this is common: send them to sign in.
  if (data.user && data.user.identities?.length === 0) {
    redirect(`/login?notice=${encodeURIComponent(
      'This email already has a login (from Kansyne Orbit or an earlier sign-up), so no email was sent. '
      + 'Sign in with that password, or use "Forgot password?".')}`)
  }
  redirect('/signup?sent=1')
}

async function origin() {
  const h = await headers()
  return h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

export async function requestReset(form: FormData) {
  const email = str(form, 'email').toLowerCase()
  if (!email) fail('/forgot', 'Enter your email.')
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/reset`,
  })
  if (error) fail('/forgot', error.status === 429 ? 'Too many emails sent — wait a few minutes and try again.' : error.message)
  redirect('/forgot?sent=1')
}

export async function setNewPassword(form: FormData) {
  const password = String(form.get('password') ?? '')
  if (password.length < 8) fail('/reset', 'Use a password of at least 8 characters.')
  if (password !== String(form.get('confirm') ?? '')) fail('/reset', 'The two passwords don’t match.')
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) fail('/reset', error.message)
  redirect('/app')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
