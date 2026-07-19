-- Migration: add document upload columns to vehicles table
-- Run: psql $DATABASE_URL -f db/migrations/add_vehicle_documents.sql

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS driving_license_url     TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_rc_url          TEXT,
  ADD COLUMN IF NOT EXISTS proof_of_insurance_url  TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_photo_url       TEXT,
  ADD COLUMN IF NOT EXISTS driver_selfie_url       TEXT,
  ADD COLUMN IF NOT EXISTS verification_note       TEXT;
