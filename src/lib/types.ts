export type Role = 'admin' | 'employee'
export type BookingStatus = 'confirmed' | 'waitlisted' | 'cancelled'

export type Org = {
  id: string
  name: string
  seat_limit: number
  daily_limit: number
  booking_day: number
  opens_at: string
  monthly_cap: number | null
  allow_waitlist: boolean
  timezone: string
}

export type Member = {
  id: string
  org_id: string
  user_id: string | null
  name: string
  email: string
  mobile: string | null
  role: Role
  is_active: boolean
}

export type Booking = {
  id: string
  seq: number
  member_id: string
  leave_date: string
  status: BookingStatus
  booked_at: string
}

export type DayLimit = { day: string; max_slots: number; note: string | null }
