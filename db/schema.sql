-- =====================================================================
-- Enterprise Carpooling Platform — Multi-tenant schema (Supabase / Postgres)
-- Run this in the Supabase SQL Editor (or `psql $DATABASE_URL -f db/schema.sql`)
-- Tenant isolation: every tenant table carries organization_id (NOT NULL FK),
-- enforced at the app layer and, optionally, by RLS (see db/rls.sql).
-- Uses gen_random_uuid() (built into Supabase via pgcrypto) — no extensions needed.
-- =====================================================================

-- Idempotent-ish reset for local dev (comment out in production)
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

-- =========================================================
-- 1. TENANT ROOT
-- =========================================================
CREATE TABLE IF NOT EXISTS organizations (
    organization_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_name              VARCHAR(150) NOT NULL,
    org_code              VARCHAR(20)  NOT NULL UNIQUE,   -- signup / invite code
    domain_email          VARCHAR(150),                   -- e.g. 'acme.com' for auto-binding
    address               TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_settings (
    organization_id          UUID PRIMARY KEY REFERENCES organizations(organization_id) ON DELETE CASCADE,
    fuel_cost_per_litre      NUMERIC(10,2) NOT NULL DEFAULT 0,
    avg_fuel_efficiency_kmpl NUMERIC(6,2)  NOT NULL DEFAULT 15,
    cost_per_km              NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_ride_radius_km       NUMERIC(6,2)  NOT NULL DEFAULT 50,
    allow_cash_payment       BOOLEAN NOT NULL DEFAULT TRUE,
    allow_recurring_rides    BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- 2. IDENTITY & USERS
-- =========================================================
-- Global login identity.
CREATE TABLE IF NOT EXISTS users (
    user_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email             VARCHAR(150) NOT NULL UNIQUE,
    phone_number      VARCHAR(20)  UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    full_name         VARCHAR(150) NOT NULL,
    profile_photo_url TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A user acting as an employee of exactly one organization.
CREATE TABLE IF NOT EXISTS employees (
    employee_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    employee_code     VARCHAR(30),
    department        VARCHAR(100),
    designation       VARCHAR(100),
    status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id),
    UNIQUE (organization_id, employee_id),          -- supports composite FKs below
    UNIQUE (organization_id, employee_code)
);
CREATE INDEX IF NOT EXISTS idx_employees_org  ON employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

CREATE TABLE IF NOT EXISTS organization_admins (
    admin_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_super_admin    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_admins_org ON organization_admins(organization_id);

-- =========================================================
-- 3. VEHICLES
-- =========================================================
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    employee_id         UUID NOT NULL,
    vehicle_model       VARCHAR(100) NOT NULL,
    registration_number VARCHAR(30)  NOT NULL,
    seating_capacity    SMALLINT NOT NULL CHECK (seating_capacity BETWEEN 1 AND 8),
    fuel_type           VARCHAR(20) CHECK (fuel_type IN ('PETROL','DIESEL','CNG','EV','HYBRID')),
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, registration_number),
    UNIQUE (organization_id, vehicle_id),
    FOREIGN KEY (organization_id, employee_id)
        REFERENCES employees(organization_id, employee_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vehicles_org      ON vehicles(organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_employee ON vehicles(organization_id, employee_id);

-- =========================================================
-- 4. SAVED PLACES
-- =========================================================
CREATE TABLE IF NOT EXISTS saved_places (
    place_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL,
    label           VARCHAR(50) NOT NULL,
    address_text    TEXT NOT NULL,
    latitude        DECIMAL(9,6) NOT NULL,
    longitude       DECIMAL(9,6) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, employee_id)
        REFERENCES employees(organization_id, employee_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_places_org_emp ON saved_places(organization_id, employee_id);

-- =========================================================
-- 5. RIDES (published by a driver)
-- =========================================================
CREATE TABLE IF NOT EXISTS rides (
    ride_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    driver_employee_id  UUID NOT NULL,
    vehicle_id          UUID NOT NULL,
    pickup_address      TEXT NOT NULL,
    pickup_lat          DECIMAL(9,6) NOT NULL,
    pickup_lng          DECIMAL(9,6) NOT NULL,
    destination_address TEXT NOT NULL,
    destination_lat     DECIMAL(9,6) NOT NULL,
    destination_lng     DECIMAL(9,6) NOT NULL,
    route_polyline      TEXT,
    distance_km         NUMERIC(6,2),
    duration_minutes    INTEGER,
    departure_datetime  TIMESTAMPTZ NOT NULL,
    total_seats         SMALLINT NOT NULL,
    available_seats     SMALLINT NOT NULL,
    fare_per_seat       NUMERIC(10,2) NOT NULL,
    is_recurring        BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_pattern  JSONB,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                          CHECK (status IN ('DRAFT','OPEN','FULL','CANCELLED','EXPIRED','COMPLETED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, ride_id),
    FOREIGN KEY (organization_id, driver_employee_id)
        REFERENCES employees(organization_id, employee_id),
    FOREIGN KEY (organization_id, vehicle_id)
        REFERENCES vehicles(organization_id, vehicle_id),
    CHECK (available_seats >= 0 AND available_seats <= total_seats)
);
CREATE INDEX IF NOT EXISTS idx_rides_org        ON rides(organization_id);
CREATE INDEX IF NOT EXISTS idx_rides_org_status ON rides(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_rides_search     ON rides(organization_id, departure_datetime, status);
CREATE INDEX IF NOT EXISTS idx_rides_driver     ON rides(organization_id, driver_employee_id);

-- =========================================================
-- 6. RIDE BOOKINGS
-- =========================================================
CREATE TABLE IF NOT EXISTS ride_bookings (
    booking_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    ride_id               UUID NOT NULL,
    passenger_employee_id UUID NOT NULL,
    seats_booked          SMALLINT NOT NULL DEFAULT 1 CHECK (seats_booked > 0),
    fare_amount           NUMERIC(10,2) NOT NULL,
    booking_status        VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
                            CHECK (booking_status IN ('CONFIRMED','CANCELLED','COMPLETED')),
    booked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at          TIMESTAMPTZ,
    UNIQUE (organization_id, booking_id),
    UNIQUE (organization_id, ride_id, passenger_employee_id),  -- one active booking per rider per ride
    FOREIGN KEY (organization_id, passenger_employee_id)
        REFERENCES employees(organization_id, employee_id),
    FOREIGN KEY (organization_id, ride_id)
        REFERENCES rides(organization_id, ride_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bookings_org       ON ride_bookings(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ride      ON ride_bookings(organization_id, ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON ride_bookings(organization_id, passenger_employee_id);

-- =========================================================
-- 7. TRIPS (execution of a booking)
-- =========================================================
CREATE TABLE IF NOT EXISTS trips (
    trip_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    ride_id                 UUID NOT NULL,
    booking_id              UUID,
    driver_employee_id      UUID NOT NULL,
    passenger_employee_id   UUID NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'BOOKED'
                              CHECK (status IN ('BOOKED','STARTED','IN_PROGRESS','COMPLETED','CANCELLED')),
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    actual_distance_km      NUMERIC(6,2),
    actual_duration_minutes INTEGER,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, trip_id),
    FOREIGN KEY (organization_id, ride_id)    REFERENCES rides(organization_id, ride_id),
    FOREIGN KEY (organization_id, booking_id) REFERENCES ride_bookings(organization_id, booking_id),
    FOREIGN KEY (organization_id, driver_employee_id)    REFERENCES employees(organization_id, employee_id),
    FOREIGN KEY (organization_id, passenger_employee_id) REFERENCES employees(organization_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_trips_org        ON trips(organization_id);
CREATE INDEX IF NOT EXISTS idx_trips_org_status ON trips(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_driver     ON trips(organization_id, driver_employee_id);
CREATE INDEX IF NOT EXISTS idx_trips_passenger  ON trips(organization_id, passenger_employee_id);

CREATE TABLE IF NOT EXISTS trip_status_history (
    history_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    trip_id                UUID NOT NULL,
    status                 VARCHAR(20) NOT NULL,
    changed_by_employee_id UUID,
    changed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, trip_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_trip_history_trip ON trip_status_history(organization_id, trip_id);

-- =========================================================
-- 8. LIVE LOCATION TRACKING (high-write; persisted for audit/replay)
-- =========================================================
CREATE TABLE IF NOT EXISTS live_location_ping (
    ping_id                 BIGSERIAL PRIMARY KEY,
    organization_id         UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    trip_id                 UUID NOT NULL,
    reported_by_employee_id UUID NOT NULL,
    latitude                DECIMAL(9,6) NOT NULL,
    longitude               DECIMAL(9,6) NOT NULL,
    speed_kmph              NUMERIC(5,2),
    heading_degrees         SMALLINT,
    eta_minutes             INTEGER,
    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, trip_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_live_ping_trip_time ON live_location_ping(trip_id, recorded_at DESC);

-- =========================================================
-- 9. CHAT / COMMUNICATION (per-trip; only trip participants can read)
-- =========================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    trip_id           UUID NOT NULL,
    sender_employee_id UUID NOT NULL,
    message_text      TEXT,
    message_type      VARCHAR(20) NOT NULL DEFAULT 'TEXT'
                        CHECK (message_type IN ('TEXT','CALL_LOG','SYSTEM')),
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, trip_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, sender_employee_id) REFERENCES employees(organization_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_trip ON chat_messages(organization_id, trip_id, sent_at);

-- =========================================================
-- 10. WALLET & PAYMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS wallets (
    wallet_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL,
    balance         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, employee_id),
    UNIQUE (organization_id, wallet_id),
    FOREIGN KEY (organization_id, employee_id)
        REFERENCES employees(organization_id, employee_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
    payment_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    trip_id              UUID NOT NULL,
    payer_employee_id    UUID NOT NULL,
    payee_employee_id    UUID NOT NULL,
    amount               NUMERIC(10,2) NOT NULL,
    payment_method       VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH','CARD','UPI','WALLET')),
    payment_gateway_ref  VARCHAR(100),
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
    paid_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, payment_id),
    FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, trip_id)
);
CREATE INDEX IF NOT EXISTS idx_payments_org  ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_trip ON payments(organization_id, trip_id);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    transaction_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    wallet_id            UUID NOT NULL,
    transaction_type     VARCHAR(20) NOT NULL CHECK (transaction_type IN ('RECHARGE','RIDE_PAYMENT','REFUND')),
    amount               NUMERIC(10,2) NOT NULL,
    balance_after        NUMERIC(10,2) NOT NULL,
    reference_payment_id UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, wallet_id) REFERENCES wallets(organization_id, wallet_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet ON wallet_transactions(organization_id, wallet_id, created_at DESC);

-- =========================================================
-- 11. RIDE HISTORY (denormalized, read-optimized)
-- =========================================================
CREATE TABLE IF NOT EXISTS ride_history (
    history_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    trip_id               UUID NOT NULL,
    driver_employee_id    UUID NOT NULL,
    passenger_employee_id UUID NOT NULL,
    vehicle_id            UUID,
    pickup_address        TEXT NOT NULL,
    destination_address   TEXT NOT NULL,
    trip_date             DATE NOT NULL,
    distance_km           NUMERIC(6,2),
    fare_amount           NUMERIC(10,2),
    fuel_cost             NUMERIC(10,2),
    final_status          VARCHAR(20) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, trip_id)
);
CREATE INDEX IF NOT EXISTS idx_history_org_date  ON ride_history(organization_id, trip_date DESC);
CREATE INDEX IF NOT EXISTS idx_history_driver    ON ride_history(organization_id, driver_employee_id);
CREATE INDEX IF NOT EXISTS idx_history_passenger ON ride_history(organization_id, passenger_employee_id);

-- =========================================================
-- 12. NOTIFICATIONS (bonus)
-- =========================================================
CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL,
    title           VARCHAR(150) NOT NULL,
    body            TEXT,
    notif_type      VARCHAR(30),
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, employee_id)
        REFERENCES employees(organization_id, employee_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notif_org_emp ON notifications(organization_id, employee_id, is_read);
