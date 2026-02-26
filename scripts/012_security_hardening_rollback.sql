-- ============================================================================
-- ROLLBACK Migration 012: Security Hardening
-- Run this in Supabase SQL Editor to undo all RLS policies + drop audit_logs
-- ============================================================================

BEGIN;

-- Drop all RLS policies and disable RLS
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'audit_logs', 'user_consents', 'templates', 'documents',
    'sender_accounts', 'email_columns', 'settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select_own ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_own ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_own ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete_own ON %I', t, t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'Disabled RLS on %', t;
  END LOOP;
END
$$;

-- Drop audit_logs table
DROP TABLE IF EXISTS audit_logs;

-- Revert Alembic stamp
UPDATE alembic_version SET version_num = '011_user_scoped_settings'
  WHERE version_num = '012_security_hardening';

COMMIT;
