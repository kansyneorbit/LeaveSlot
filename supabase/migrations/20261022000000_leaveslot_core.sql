-- =============================================================================
-- LeaveSlot: first-come, first-served leave booking for departments.
--
-- Lives in the same Supabase project as Kansyne Orbit, so every object is
-- prefixed ls_ and helpers sit in the non-exposed ls_private schema.
--
--  * ls_orgs        one department/organisation (a tenant). Settings: seats
--                   (number of employees), daily_limit (people on leave per
--                   day), booking_day + opens_at (leave for month M opens on
--                   that day of month M-1, in the org's time zone).
--  * ls_members     employees, identified by email (mobile stored too). Admin
--                   adds them; they are linked to a login by ls_accept_invites().
--  * ls_day_limits  per-date override of daily_limit (0 = no leave that day).
--  * ls_bookings    one row per person per day. Written only by ls_book() and
--                   ls_cancel(), which lock the org row, so bookings are
--                   strictly ordered: first to commit gets the slot, later
--                   ones join the waitlist and move up when a slot frees.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS ls_private;
REVOKE ALL ON SCHEMA ls_private FROM PUBLIC;
GRANT USAGE ON SCHEMA ls_private TO authenticated;

CREATE TABLE public.ls_orgs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  seat_limit     int  NOT NULL DEFAULT 30,
  daily_limit    int  NOT NULL DEFAULT 2,
  booking_day    int  NOT NULL DEFAULT 20,
  opens_at       time NOT NULL DEFAULT '09:00',
  monthly_cap    int,                                   -- max leave days per person per month; NULL = no cap
  allow_waitlist boolean NOT NULL DEFAULT true,
  timezone       text NOT NULL DEFAULT 'Asia/Kolkata',
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ls_orgs_name_check  CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT ls_orgs_seats_check CHECK (seat_limit BETWEEN 1 AND 1000),
  CONSTRAINT ls_orgs_daily_check CHECK (daily_limit BETWEEN 1 AND 100),
  CONSTRAINT ls_orgs_day_check   CHECK (booking_day BETWEEN 1 AND 28),
  CONSTRAINT ls_orgs_cap_check   CHECK (monthly_cap IS NULL OR monthly_cap BETWEEN 1 AND 31)
);

CREATE TABLE public.ls_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.ls_orgs (id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  name       text NOT NULL,
  email      text NOT NULL,
  mobile     text,
  role       text NOT NULL DEFAULT 'employee',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ls_members_name_check   CHECK (length(trim(name)) BETWEEN 1 AND 100),
  CONSTRAINT ls_members_email_check  CHECK (email = lower(trim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT ls_members_mobile_check CHECK (mobile IS NULL OR mobile ~ '^\+?[0-9]{7,15}$'),
  CONSTRAINT ls_members_role_check   CHECK (role IN ('admin', 'employee')),
  CONSTRAINT ls_members_org_id_key    UNIQUE (org_id, id),
  CONSTRAINT ls_members_org_email_key UNIQUE (org_id, email),
  CONSTRAINT ls_members_org_user_key  UNIQUE (org_id, user_id)
);
CREATE INDEX ls_members_user_idx ON public.ls_members (user_id);
CREATE INDEX ls_members_email_idx ON public.ls_members (email) WHERE user_id IS NULL;

CREATE TABLE public.ls_day_limits (
  org_id    uuid NOT NULL REFERENCES public.ls_orgs (id) ON DELETE CASCADE,
  day       date NOT NULL,
  max_slots int  NOT NULL,
  note      text,
  PRIMARY KEY (org_id, day),
  CONSTRAINT ls_day_limits_slots_check CHECK (max_slots BETWEEN 0 AND 100),
  CONSTRAINT ls_day_limits_note_check  CHECK (note IS NULL OR length(note) <= 100)
);

CREATE TABLE public.ls_bookings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY,      -- booking order (first come, first served)
  org_id       uuid NOT NULL REFERENCES public.ls_orgs (id) ON DELETE CASCADE,
  member_id    uuid NOT NULL,
  leave_date   date NOT NULL,
  status       text NOT NULL,
  booked_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  CONSTRAINT ls_bookings_status_check CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
  FOREIGN KEY (org_id, member_id)    REFERENCES public.ls_members (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, cancelled_by) REFERENCES public.ls_members (org_id, id)
);
CREATE UNIQUE INDEX ls_bookings_one_per_day ON public.ls_bookings (member_id, leave_date) WHERE status <> 'cancelled';
CREATE INDEX ls_bookings_day_idx ON public.ls_bookings (org_id, leave_date, status, seq);
CREATE INDEX ls_bookings_cancelled_by_idx ON public.ls_bookings (org_id, cancelled_by);

CREATE TABLE public.ls_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.ls_orgs (id) ON DELETE CASCADE,
  member_id  uuid NOT NULL,
  message    text NOT NULL,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, member_id) REFERENCES public.ls_members (org_id, id) ON DELETE CASCADE
);
CREATE INDEX ls_notifications_member_idx ON public.ls_notifications (org_id, member_id, created_at DESC);

-- ---------- access helpers (used by policies) ----------
CREATE FUNCTION ls_private.my_member(p_org uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.ls_members WHERE org_id = p_org AND user_id = auth.uid() AND is_active
$$;
CREATE FUNCTION ls_private.is_member(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.ls_members WHERE org_id = p_org AND user_id = auth.uid() AND is_active)
$$;
CREATE FUNCTION ls_private.is_admin(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.ls_members
                 WHERE org_id = p_org AND user_id = auth.uid() AND is_active AND role = 'admin')
$$;

-- When leave for the month containing p_day opens.
CREATE FUNCTION ls_private.window_opens(p_org public.ls_orgs, p_day date) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (((date_trunc('month', p_day) - interval '1 month')::date + (p_org.booking_day - 1)) + p_org.opens_at)
         AT TIME ZONE p_org.timezone
$$;

CREATE FUNCTION ls_private.local_today(p_org public.ls_orgs) RETURNS date
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (now() AT TIME ZONE p_org.timezone)::date
$$;

CREATE FUNCTION ls_private.capacity(p_org uuid, p_day date) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT max_slots FROM public.ls_day_limits WHERE org_id = p_org AND day = p_day),
                  (SELECT daily_limit FROM public.ls_orgs WHERE id = p_org))
$$;

-- Fill free slots on a day from the waitlist, oldest booking first.
CREATE FUNCTION ls_private.promote(p_org uuid, p_day date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_free int;
  r      record;
BEGIN
  IF p_day < (SELECT ls_private.local_today(o) FROM public.ls_orgs o WHERE o.id = p_org) THEN
    RETURN;   -- past days are history
  END IF;
  SELECT ls_private.capacity(p_org, p_day) - count(*) INTO v_free
  FROM public.ls_bookings WHERE org_id = p_org AND leave_date = p_day AND status = 'confirmed';
  IF v_free <= 0 THEN RETURN; END IF;
  FOR r IN SELECT id, member_id FROM public.ls_bookings
           WHERE org_id = p_org AND leave_date = p_day AND status = 'waitlisted'
           ORDER BY seq LIMIT v_free FOR UPDATE LOOP
    UPDATE public.ls_bookings SET status = 'confirmed', confirmed_at = now() WHERE id = r.id;
    INSERT INTO public.ls_notifications (org_id, member_id, message)
    VALUES (p_org, r.member_id, 'Your leave on ' || to_char(p_day, 'DD Mon YYYY')
                                || ' is now confirmed — you moved up from the waitlist.');
  END LOOP;
END $$;

-- ---------- triggers ----------
CREATE FUNCTION ls_private.check_org() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_active int;
BEGIN
  PERFORM now() AT TIME ZONE NEW.timezone;   -- raises on an unknown time zone
  IF TG_OP = 'UPDATE' AND NEW.seat_limit < OLD.seat_limit THEN
    SELECT count(*) INTO v_active FROM public.ls_members WHERE org_id = NEW.id AND is_active;
    IF v_active > NEW.seat_limit THEN
      RAISE EXCEPTION '% people are active — deactivate some before lowering seats to %', v_active, NEW.seat_limit
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ls_orgs_check BEFORE INSERT OR UPDATE ON public.ls_orgs
  FOR EACH ROW EXECUTE FUNCTION ls_private.check_org();

-- A higher daily limit frees slots on every upcoming day that has a waitlist.
CREATE FUNCTION ls_private.org_limit_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d date;
BEGIN
  IF NEW.daily_limit > OLD.daily_limit THEN
    FOR d IN SELECT DISTINCT leave_date FROM public.ls_bookings
             WHERE org_id = NEW.id AND status = 'waitlisted' AND leave_date >= ls_private.local_today(NEW) LOOP
      PERFORM ls_private.promote(NEW.id, d);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER ls_orgs_limit_changed AFTER UPDATE OF daily_limit ON public.ls_orgs
  FOR EACH ROW EXECUTE FUNCTION ls_private.org_limit_changed();

CREATE FUNCTION ls_private.day_limit_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM ls_private.promote(OLD.org_id, OLD.day);
  ELSE
    PERFORM ls_private.promote(NEW.org_id, NEW.day);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER ls_day_limits_changed AFTER INSERT OR UPDATE OR DELETE ON public.ls_day_limits
  FOR EACH ROW EXECUTE FUNCTION ls_private.day_limit_changed();

-- Seats: active members can't exceed seat_limit. At least one active admin stays.
CREATE FUNCTION ls_private.check_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org public.ls_orgs;
BEGIN
  SELECT * INTO v_org FROM public.ls_orgs WHERE id = NEW.org_id FOR UPDATE;
  -- BEFORE triggers run ahead of RLS: refuse outsiders here so the seat count below doesn't leak.
  IF TG_OP = 'INSERT' AND NOT ls_private.is_admin(NEW.org_id) AND v_org.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only admins can add people' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active)
     AND (SELECT count(*) FROM public.ls_members WHERE org_id = NEW.org_id AND is_active AND id <> NEW.id)
         >= v_org.seat_limit THEN
    RAISE EXCEPTION 'All % seats are in use — raise the number of employees in Settings', v_org.seat_limit
      USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'admin' AND OLD.is_active
     AND (NEW.role <> 'admin' OR NOT NEW.is_active)
     AND NOT EXISTS (SELECT 1 FROM public.ls_members
                     WHERE org_id = NEW.org_id AND role = 'admin' AND is_active AND id <> NEW.id) THEN
    RAISE EXCEPTION 'Keep at least one active admin' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ls_members_check BEFORE INSERT OR UPDATE ON public.ls_members
  FOR EACH ROW EXECUTE FUNCTION ls_private.check_member();

REVOKE ALL ON FUNCTION ls_private.window_opens(public.ls_orgs, date), ls_private.local_today(public.ls_orgs),
  ls_private.capacity(uuid, date), ls_private.promote(uuid, date), ls_private.check_org(),
  ls_private.org_limit_changed(), ls_private.day_limit_changed(), ls_private.check_member()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ls_private.my_member(uuid), ls_private.is_member(uuid), ls_private.is_admin(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ls_private.my_member(uuid), ls_private.is_member(uuid), ls_private.is_admin(uuid)
  TO authenticated;

-- ---------- RLS and column privileges ----------
ALTER TABLE public.ls_orgs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_day_limits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ls_orgs, public.ls_members, public.ls_day_limits, public.ls_bookings, public.ls_notifications
  FROM anon, authenticated;
GRANT SELECT ON public.ls_orgs, public.ls_members, public.ls_day_limits, public.ls_bookings, public.ls_notifications
  TO authenticated;
GRANT UPDATE (name, seat_limit, daily_limit, booking_day, opens_at, monthly_cap, allow_waitlist, timezone)
  ON public.ls_orgs TO authenticated;
GRANT INSERT (org_id, name, email, mobile, role) ON public.ls_members TO authenticated;
GRANT UPDATE (name, mobile, role, is_active) ON public.ls_members TO authenticated;
-- All columns updatable so PostgREST upserts work; the policy's WITH CHECK keeps rows in the admin's org.
GRANT INSERT (org_id, day, max_slots, note), UPDATE (org_id, day, max_slots, note), DELETE ON public.ls_day_limits TO authenticated;
GRANT UPDATE (is_read) ON public.ls_notifications TO authenticated;

CREATE POLICY ls_orgs_select ON public.ls_orgs FOR SELECT TO authenticated
  USING ((SELECT ls_private.is_member(id)));
CREATE POLICY ls_orgs_update ON public.ls_orgs FOR UPDATE TO authenticated
  USING ((SELECT ls_private.is_admin(id))) WITH CHECK ((SELECT ls_private.is_admin(id)));

CREATE POLICY ls_members_select ON public.ls_members FOR SELECT TO authenticated
  USING ((SELECT ls_private.is_member(org_id)));
CREATE POLICY ls_members_insert ON public.ls_members FOR INSERT TO authenticated
  WITH CHECK ((SELECT ls_private.is_admin(org_id)));
CREATE POLICY ls_members_update ON public.ls_members FOR UPDATE TO authenticated
  USING ((SELECT ls_private.is_admin(org_id))) WITH CHECK ((SELECT ls_private.is_admin(org_id)));

CREATE POLICY ls_day_limits_select ON public.ls_day_limits FOR SELECT TO authenticated
  USING ((SELECT ls_private.is_member(org_id)));
CREATE POLICY ls_day_limits_insert ON public.ls_day_limits FOR INSERT TO authenticated
  WITH CHECK ((SELECT ls_private.is_admin(org_id)));
CREATE POLICY ls_day_limits_update ON public.ls_day_limits FOR UPDATE TO authenticated
  USING ((SELECT ls_private.is_admin(org_id))) WITH CHECK ((SELECT ls_private.is_admin(org_id)));
CREATE POLICY ls_day_limits_delete ON public.ls_day_limits FOR DELETE TO authenticated
  USING ((SELECT ls_private.is_admin(org_id)));

-- The whole department sees the roster (who is on leave when), as on a booking chart.
CREATE POLICY ls_bookings_select ON public.ls_bookings FOR SELECT TO authenticated
  USING ((SELECT ls_private.is_member(org_id)));

CREATE POLICY ls_notifications_select ON public.ls_notifications FOR SELECT TO authenticated
  USING (member_id = (SELECT ls_private.my_member(org_id)));
CREATE POLICY ls_notifications_update ON public.ls_notifications FOR UPDATE TO authenticated
  USING (member_id = (SELECT ls_private.my_member(org_id)))
  WITH CHECK (member_id = (SELECT ls_private.my_member(org_id)));

-- ---------- RPCs ----------
CREATE FUNCTION public.ls_create_org(p_name text, p_admin_name text, p_seats int, p_daily_limit int,
                                     p_booking_day int, p_opens_at time, p_timezone text DEFAULT 'Asia/Kolkata')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text;
  v_org   uuid;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Confirm your email before creating an organisation' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.ls_orgs WHERE created_by = auth.uid()) >= 5 THEN
    RAISE EXCEPTION 'You can create up to 5 organisations' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ls_orgs (name, seat_limit, daily_limit, booking_day, opens_at, timezone, created_by)
  VALUES (trim(p_name), p_seats, p_daily_limit, p_booking_day, p_opens_at, p_timezone, auth.uid())
  RETURNING id INTO v_org;
  INSERT INTO public.ls_members (org_id, user_id, name, email, role)
  VALUES (v_org, auth.uid(), trim(p_admin_name), v_email, 'admin');
  RETURN v_org;
END $$;

-- Link member rows that were added with this login's (confirmed) email.
CREATE FUNCTION public.ls_accept_invites() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text;
  v_count int;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN 0; END IF;
  UPDATE public.ls_members m SET user_id = auth.uid()
  WHERE m.email = v_email AND m.user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.ls_members x WHERE x.org_id = m.org_id AND x.user_id = auth.uid());
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Server clock for the booking screen: the org's today and when p_month opens.
CREATE FUNCTION public.ls_clock(p_org uuid, p_month date)
RETURNS TABLE (local_today date, server_now timestamptz, opens timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT ls_private.is_member(p_org) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT ls_private.local_today(o), now(), ls_private.window_opens(o, p_month)
               FROM public.ls_orgs o WHERE o.id = p_org;
END $$;

-- Book one or more days. All-or-nothing; each day is confirmed while slots
-- last, otherwise waitlisted (position returned).
CREATE FUNCTION public.ls_book(p_org uuid, p_dates date[])
RETURNS TABLE (leave_date date, status text, waitlist_position int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_me     uuid := ls_private.my_member(p_org);
  v_org    public.ls_orgs;
  v_today  date;
  v_day    date;
  v_cap    int;
  v_taken  int;
  v_status text;
  v_pos    int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF p_dates IS NULL OR cardinality(p_dates) = 0 THEN
    RAISE EXCEPTION 'Pick at least one day' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_dates) > 31 THEN
    RAISE EXCEPTION 'Book at most 31 days at a time' USING ERRCODE = '22023';
  END IF;

  -- One booking at a time per org: this is the queue.
  SELECT * INTO v_org FROM public.ls_orgs WHERE id = p_org FOR UPDATE;
  v_today := ls_private.local_today(v_org);

  FOR v_day IN SELECT DISTINCT d FROM unnest(p_dates) d ORDER BY d LOOP
    IF v_day <= v_today THEN
      RAISE EXCEPTION '% has passed — book from tomorrow onwards', to_char(v_day, 'DD Mon') USING ERRCODE = '22023';
    END IF;
    IF now() < ls_private.window_opens(v_org, v_day) THEN
      RAISE EXCEPTION 'Booking for % opens on %', to_char(v_day, 'FMMonth YYYY'),
        to_char(ls_private.window_opens(v_org, v_day) AT TIME ZONE v_org.timezone, 'DD Mon at HH24:MI')
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ls_bookings b
               WHERE b.member_id = v_me AND b.leave_date = v_day AND b.status <> 'cancelled') THEN
      RAISE EXCEPTION 'You already have % booked', to_char(v_day, 'DD Mon') USING ERRCODE = '23505';
    END IF;
    IF v_org.monthly_cap IS NOT NULL AND (
         SELECT count(*) FROM public.ls_bookings b
         WHERE b.member_id = v_me AND b.status <> 'cancelled'
           AND date_trunc('month', b.leave_date) = date_trunc('month', v_day)) >= v_org.monthly_cap THEN
      RAISE EXCEPTION 'You can book at most % day(s) in %', v_org.monthly_cap, to_char(v_day, 'FMMonth')
        USING ERRCODE = '22023';
    END IF;

    v_cap := ls_private.capacity(p_org, v_day);
    IF v_cap = 0 THEN
      RAISE EXCEPTION 'Leave is not allowed on %', to_char(v_day, 'DD Mon') USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_taken FROM public.ls_bookings b
    WHERE b.org_id = p_org AND b.leave_date = v_day AND b.status = 'confirmed';

    v_pos := NULL;
    IF v_taken < v_cap THEN
      v_status := 'confirmed';
    ELSIF v_org.allow_waitlist THEN
      v_status := 'waitlisted';
      SELECT count(*) + 1 INTO v_pos FROM public.ls_bookings b
      WHERE b.org_id = p_org AND b.leave_date = v_day AND b.status = 'waitlisted';
    ELSE
      RAISE EXCEPTION '% is full', to_char(v_day, 'DD Mon') USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.ls_bookings (org_id, member_id, leave_date, status, confirmed_at)
    VALUES (p_org, v_me, v_day, v_status, CASE WHEN v_status = 'confirmed' THEN now() END);

    leave_date := v_day; status := v_status; waitlist_position := v_pos;
    RETURN NEXT;
  END LOOP;
END $$;

-- Cancel your own upcoming booking (admins: anyone's, from today). A freed
-- slot goes to the first person on that day's waitlist.
CREATE FUNCTION public.ls_cancel(p_booking uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_b     public.ls_bookings;
  v_org   public.ls_orgs;
  v_me    uuid;
  v_admin boolean;
BEGIN
  SELECT * INTO v_b FROM public.ls_bookings WHERE id = p_booking;
  IF v_b.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  v_me := ls_private.my_member(v_b.org_id);
  v_admin := ls_private.is_admin(v_b.org_id);
  IF v_me IS NULL OR (v_b.member_id <> v_me AND NOT v_admin) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_org FROM public.ls_orgs WHERE id = v_b.org_id FOR UPDATE;
  SELECT * INTO v_b FROM public.ls_bookings WHERE id = p_booking;   -- re-read under the lock
  IF v_b.status = 'cancelled' THEN
    RAISE EXCEPTION 'Already cancelled' USING ERRCODE = '22023';
  END IF;
  IF v_b.leave_date < ls_private.local_today(v_org)
     OR (v_b.leave_date = ls_private.local_today(v_org) AND NOT v_admin) THEN
    RAISE EXCEPTION 'Only upcoming leave can be cancelled' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ls_bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_me WHERE id = p_booking;
  IF v_b.member_id <> v_me THEN
    INSERT INTO public.ls_notifications (org_id, member_id, message)
    VALUES (v_b.org_id, v_b.member_id, 'An admin cancelled your leave on ' || to_char(v_b.leave_date, 'DD Mon YYYY') || '.');
  END IF;
  IF v_b.status = 'confirmed' THEN
    PERFORM ls_private.promote(v_b.org_id, v_b.leave_date);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.ls_create_org(text, text, int, int, int, time, text), public.ls_accept_invites(),
  public.ls_clock(uuid, date), public.ls_book(uuid, date[]), public.ls_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ls_create_org(text, text, int, int, int, time, text), public.ls_accept_invites(),
  public.ls_clock(uuid, date), public.ls_book(uuid, date[]), public.ls_cancel(uuid) TO authenticated;
