-- =====================================================================
-- OPTIONAL: Postgres Row-Level Security (defense-in-depth tenant isolation)
-- =====================================================================
-- The Express backend already scopes every query by organization_id (query
-- layer). These policies add a DB-level safety net so a missed WHERE clause
-- cannot leak cross-tenant rows.
--
-- HOW IT WORKS:
--   The backend runs each request's queries inside a transaction that first
--   executes:  SELECT set_config('app.current_org_id', '<uuid>', true);
--   (see server/src/db.js -> withTenant()). The policies below compare
--   organization_id against that session/local setting.
--
-- NOTE: The Postgres role used by the connection must NOT be a superuser or
-- BYPASSRLS role, otherwise policies are ignored. On Supabase, connect with a
-- dedicated app role (or the 'authenticated'-style role) rather than the
-- 'postgres' superuser for these to take effect.
--
-- Enable only after confirming withTenant() is wired up, or local reads that
-- forget to set app.current_org_id will return zero rows.
-- =====================================================================

DO $$
DECLARE
    t TEXT;
    tenant_tables TEXT[] := ARRAY[
        'employees','organization_admins','organization_settings',
        'vehicles','saved_places','rides','ride_bookings','trips',
        'trip_status_history','live_location_ping','chat_messages',
        'wallets','wallet_transactions','payments','ride_history','notifications'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
            USING (organization_id = current_setting('app.current_org_id', true)::uuid)
            WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
        $f$, t);
    END LOOP;
END $$;
