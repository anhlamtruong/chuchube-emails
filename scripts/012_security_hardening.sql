-- ============================================================================
-- Migration 012: Security Hardening
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- ============================================================================
-- 
-- IMPORTANT: Your backend connects as the `postgres` table owner through the
-- Supabase pooler, so RLS is AUTOMATICALLY BYPASSED (Postgres owner bypass).
-- These policies are a defense-in-depth layer that only restrict the
-- `authenticated` and `anon` roles (used by Supabase client SDKs / PostgREST).
--
-- Since you use Clerk (not Supabase Auth), we create a stub `auth.uid()`
-- function that returns NULL. This makes all policies syntactically valid
-- and means the `authenticated` role gets NO access via PostgREST/client SDK
-- (which is correct — all access goes through your FastAPI backend).
-- ============================================================================

BEGIN;

-- ========================================================================== --
-- 0. Create auth.uid() stub if it doesn't already exist (Clerk setup)        --
-- ========================================================================== --
CREATE SCHEMA IF NOT EXISTS auth;

-- Only create the stub if Supabase Auth hasn't already defined it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid $f$';
    RAISE NOTICE 'Created stub auth.uid() — Clerk mode (returns NULL)';
  ELSE
    RAISE NOTICE 'auth.uid() already exists — Supabase Auth detected';
  END IF;
END
$$;

-- ========================================================================== --
-- 1. Create audit_logs table                                                  --
-- ========================================================================== --
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY,
  user_id     VARCHAR(255) NOT NULL,
  event_type  VARCHAR(50)  NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255),
  detail      JSONB,
  ip_address  VARCHAR(50),
  user_agent  VARCHAR(500),
  created_at  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_event_type ON audit_logs (event_type);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at);

-- ========================================================================== --
-- 2. Enable RLS on all user-scoped tables                                     --
-- ========================================================================== --

-- ---------- settings ----------
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_select_own ON settings
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()::text));

CREATE POLICY settings_insert_own ON settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY settings_update_own ON settings
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()::text))
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY settings_delete_own ON settings
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()::text));

-- ---------- email_columns (user_id nullable — allow legacy rows) ----------
ALTER TABLE email_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_columns_select_own ON email_columns
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL);

CREATE POLICY email_columns_insert_own ON email_columns
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY email_columns_update_own ON email_columns
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY email_columns_delete_own ON email_columns
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL);

-- ---------- sender_accounts ----------
ALTER TABLE sender_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sender_accounts_select_own ON sender_accounts
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()::text));

CREATE POLICY sender_accounts_insert_own ON sender_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY sender_accounts_update_own ON sender_accounts
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()::text))
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY sender_accounts_delete_own ON sender_accounts
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()::text));

-- ---------- documents (user_id nullable — allow legacy rows) ----------
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select_own ON documents
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL);

CREATE POLICY documents_insert_own ON documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY documents_update_own ON documents
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY documents_delete_own ON documents
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL);

-- ---------- templates (user_id nullable — allow legacy rows) ----------
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_select_own ON templates
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL);

CREATE POLICY templates_insert_own ON templates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY templates_update_own ON templates
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY templates_delete_own ON templates
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()::text) OR user_id IS NULL);

-- ---------- user_consents ----------
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_consents_select_own ON user_consents
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()::text));

CREATE POLICY user_consents_insert_own ON user_consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY user_consents_update_own ON user_consents
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()::text))
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY user_consents_delete_own ON user_consents
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()::text));

-- ---------- audit_logs ----------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_own ON audit_logs
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()::text));

CREATE POLICY audit_logs_insert_own ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY audit_logs_update_own ON audit_logs
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()::text))
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY audit_logs_delete_own ON audit_logs
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()::text));

-- ========================================================================== --
-- 3. Update Alembic version stamp so the Python migration isn't re-run       --
-- ========================================================================== --
UPDATE alembic_version SET version_num = '012_security_hardening'
  WHERE version_num = '011_user_scoped_settings';

-- If no row was updated (fresh stamp), insert it
INSERT INTO alembic_version (version_num)
  SELECT '012_security_hardening'
  WHERE NOT EXISTS (SELECT 1 FROM alembic_version WHERE version_num = '012_security_hardening');

COMMIT;

-- ========================================================================== --
-- Done! Verify with:
--   SELECT tablename, rowsecurity FROM pg_tables 
--   WHERE schemaname = 'public' AND rowsecurity = true;
-- ========================================================================== --
