-- ============================================================================
-- JIPPAY — Migración incremental 002: Row Level Security (RLS) efectivo.
--
-- NO destructiva. Activa RLS en las tablas empresariales y define políticas de
-- acceso basadas en la membresía activa del usuario autenticado.
--
-- Convención de Supabase Auth: `auth.uid()` devuelve el `id` del usuario
-- autenticado. Las membresías enlazan `company_memberships.auth_user_id` con ese
-- identificador estable.
--
-- NOTA DE ARQUITECTURA:
-- - La aplicación usa una conexión PostgreSQL privilegiada (service role) para
--   las funciones transaccionales (`SECURITY DEFINER`), que omiten RLS. Por ello
--   RLS NO sustituye los controles de autorización de la aplicación: ambos se
--   aplican. La validación de membresía/permisos se repite dentro de la capa de
--   aplicación y en estas políticas.
-- - Las funciones `SECURITY DEFINER` validan argumentos y NO permiten elegir un
--   tenant arbitrario en nombre de otro usuario.
-- ============================================================================

-- Helper de autorización: true si el usuario autenticado tiene una membresía
-- activa en la empresa dada y su rol coincide con el esperado.
CREATE OR REPLACE FUNCTION jippay_has_membership(p_company_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_memberships
    WHERE company_id = p_company_id
      AND auth_user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION jippay_has_role(p_company_id TEXT, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_memberships
    WHERE company_id = p_company_id
      AND auth_user_id = auth.uid()
      AND status = 'active'
      AND role = ANY(p_roles)
  );
$$;

-- ============================================================================
-- Activación de RLS
-- ============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_records ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Políticas de lectura (SELECT): solo datos de empresas con membresía activa.
-- ============================================================================
DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies
  FOR SELECT USING (jippay_has_membership(id));

DROP POLICY IF EXISTS memberships_select ON company_memberships;
CREATE POLICY memberships_select ON company_memberships
  FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS rules_select ON company_rules;
CREATE POLICY rules_select ON company_rules
  FOR SELECT USING (jippay_has_membership(company_id));

DROP POLICY IF EXISTS budget_select ON budget_periods;
CREATE POLICY budget_select ON budget_periods
  FOR SELECT USING (jippay_has_membership(company_id));

DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices
  FOR SELECT USING (jippay_has_membership(company_id));

DROP POLICY IF EXISTS reservations_select ON budget_reservations;
CREATE POLICY reservations_select ON budget_reservations
  FOR SELECT USING (jippay_has_membership(company_id));

DROP POLICY IF EXISTS idempotency_select ON idempotency_records;
CREATE POLICY idempotency_select ON idempotency_records
  FOR SELECT USING (jippay_has_membership(company_id));

DROP POLICY IF EXISTS events_select ON financial_events;
CREATE POLICY events_select ON financial_events
  FOR SELECT USING (jippay_has_membership(company_id));

DROP POLICY IF EXISTS approvals_select ON approval_records;
CREATE POLICY approvals_select ON approval_records
  FOR SELECT USING (jippay_has_membership(company_id));

-- ============================================================================
-- Políticas de escritura: restringidas por rol.
--   - CFO_ADMIN: reglas y presupuesto.
--   - CONTROLLER_APPROVER: aprobaciones (solo lectura sobre reglas/presupuesto).
--   - AUDITOR_VIEWER: solo lectura (sin políticas de escritura).
-- ============================================================================
DROP POLICY IF EXISTS rules_update ON company_rules;
CREATE POLICY rules_update ON company_rules
  FOR UPDATE USING (jippay_has_role(company_id, ARRAY['CFO_ADMIN']))
  WITH CHECK (jippay_has_role(company_id, ARRAY['CFO_ADMIN']));

DROP POLICY IF EXISTS budget_update ON budget_periods;
CREATE POLICY budget_update ON budget_periods
  FOR UPDATE USING (jippay_has_role(company_id, ARRAY['CFO_ADMIN']))
  WITH CHECK (jippay_has_role(company_id, ARRAY['CFO_ADMIN']));

-- Inserción de facturas/reservas se realiza por funciones SECURITY DEFINER
-- (privilegiadas, validadas en la aplicación). No se concede INSERT general a
-- `authenticated`/`anon` para evitar escrituras directas fuera de control.
DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices
  FOR INSERT WITH CHECK (jippay_has_role(company_id, ARRAY['CFO_ADMIN','CONTROLLER_APPROVER']));

DROP POLICY IF EXISTS reservations_insert ON budget_reservations;
CREATE POLICY reservations_insert ON budget_reservations
  FOR INSERT WITH CHECK (jippay_has_role(company_id, ARRAY['CFO_ADMIN','CONTROLLER_APPROVER']));

-- Las membresías no pueden alterarse desde una petición ordinaria del usuario.
-- (No se define política UPDATE/INSERT para company_memberships: solo el rol de
-- servicio privilegiado puede provisionar.)
