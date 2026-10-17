-- ============================================================================
-- JIPPAY — Esquema financiero transaccional (migración incremental, no destructiva)
--
-- Regla B: liquidez y concurrencia atómicas.
-- Los importes se guardan en centavos (INTEGER) para evitar coma flotante binaria.
-- Todas las tablas están particionadas por `company_id` (multi-tenancy).
-- ============================================================================

-- 1. Empresas
CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Membresías (usuario -> empresa). La autoridad es el servidor.
-- `auth_user_id` es el identificador estable del usuario de Supabase Auth.
CREATE TABLE IF NOT EXISTS company_memberships (
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  auth_user_id    TEXT,                                      -- ID estable de Supabase Auth
  role            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  provisioned_by  TEXT,
  PRIMARY KEY (company_id, user_email)
);

-- Índice único por usuario autenticado (cuando la identidad real está presente).
CREATE UNIQUE INDEX IF NOT EXISTS company_memberships_auth_user_uniq
  ON company_memberships (company_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- 3. Reglas financieras por empresa (controladas por el servidor).
CREATE TABLE IF NOT EXISTS company_rules (
  company_id                  TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  limite_monto_automatico     BIGINT NOT NULL,               -- centavos USD
  presupuesto_mensual_restante BIGINT NOT NULL,               -- centavos USD (baseline aprobado)
  proveedores_permitidos      JSONB NOT NULL DEFAULT '[]'::jsonb,
  acuerdos_por_proveedor      JSONB NOT NULL DEFAULT '{}'::jsonb,
  version                     INTEGER NOT NULL DEFAULT 1,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Presupuesto autoritativo por empresa y periodo.
-- `consumed_cents` = importe CONTABILIZADO/comprometido para facturas aprobadas
-- (decisión PAGAR), NO dinero liquidado: sin banco real no existe transferencia.
CREATE TABLE IF NOT EXISTS budget_periods (
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  approved_cents  BIGINT NOT NULL,
  consumed_cents  BIGINT NOT NULL DEFAULT 0,
  version         INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period)
);

-- 5. Facturas registradas (deduplicación por identidad comercial y hash).
CREATE TABLE IF NOT EXISTS invoices (
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id       TEXT NOT NULL,
  commercial_id    TEXT,                                     -- identidad normalizada; NULL si no fiable
  emisor           TEXT NOT NULL,
  monto_usd        NUMERIC(18,2) NOT NULL,
  moneda           TEXT NOT NULL,
  fecha_vencimiento TEXT NOT NULL,
  file_hash        TEXT,                                     -- SHA-256 binario, NULL si no disponible
  source           TEXT NOT NULL,
  estado           TEXT NOT NULL,                            -- veredicto del motor (no se sobrescribe)
  regla_disparada  TEXT NOT NULL,
  razon            TEXT NOT NULL DEFAULT '',
  flow_status      TEXT NOT NULL DEFAULT 'PENDING_REVIEW',   -- flujo de aprobación humana
  creator_email    TEXT,                                     -- identidad del actor que originó la operación
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, invoice_id)
);

-- Única identidad comercial por empresa (solo filas con commercial_id no NULL).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_commercial_uniq
  ON invoices (company_id, commercial_id)
  WHERE commercial_id IS NOT NULL;

-- Único hash por empresa (solo filas con file_hash no NULL).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_hash_uniq
  ON invoices (company_id, file_hash)
  WHERE file_hash IS NOT NULL;

-- 6. Reservas presupuestarias.
-- La FK compuesta (company_id, invoice_id) -> invoices(company_id, invoice_id)
-- impide asociar una reserva con una factura de otra empresa.
CREATE TABLE IF NOT EXISTS budget_reservations (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id    TEXT NOT NULL,
  period        TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ACTIVE','RELEASED','CONSUMED')),
  reason        TEXT NOT NULL,
  actor         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT budget_reservations_invoice_fk
    FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id, invoice_id) ON DELETE CASCADE
);

-- Una factura no puede tener más de una reserva ACTIVA para la misma obligación.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_active_uniq
  ON budget_reservations (company_id, invoice_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS reservations_company_idx
  ON budget_reservations (company_id, period);

-- 7. Idempotencia por empresa y clave.
CREATE TABLE IF NOT EXISTS idempotency_records (
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response        JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, idempotency_key)
);

-- 8. Eventos de auditoría financiera.
-- La FK compuesta sobre (company_id, invoice_id) impide que un evento de una
-- empresa referencie una factura de otra (cuando invoice_id no es NULL).
CREATE TABLE IF NOT EXISTS financial_events (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  invoice_id  TEXT,
  actor       TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_events_invoice_fk
    FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id, invoice_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS financial_events_company_idx
  ON financial_events (company_id, created_at);

-- 9. Registro de aprobaciones/rechazos humanos (evidencia de auditoría firmada).
CREATE TABLE IF NOT EXISTS approval_records (
  id                   TEXT PRIMARY KEY,
  company_id           TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id           TEXT NOT NULL,
  action               TEXT NOT NULL CHECK (action IN ('APPROVE','REJECT')),
  justification        TEXT NOT NULL,
  evidence_references  JSONB NOT NULL DEFAULT '[]'::jsonb,
  approver_email       TEXT NOT NULL,
  approver_role        TEXT NOT NULL,
  approver_name        TEXT,
  original_estado      TEXT NOT NULL,
  original_regla       TEXT NOT NULL,
  original_razon       TEXT NOT NULL DEFAULT '',
  monto_usd            NUMERIC(18,2) NOT NULL,
  moneda               TEXT NOT NULL,
  reservation_id       TEXT,
  reservation_status   TEXT,
  rules_fingerprint    TEXT NOT NULL DEFAULT '',
  idempotency_key      TEXT NOT NULL,
  request_hash         TEXT NOT NULL DEFAULT '',
  previous_flow_status TEXT NOT NULL,
  next_flow_status     TEXT NOT NULL,
  audit_hash           TEXT NOT NULL,
  previous_audit_hash  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_records_invoice_fk
    FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id, invoice_id) ON DELETE CASCADE,
  CONSTRAINT approval_records_idem_uniq UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS approval_records_company_idx
  ON approval_records (company_id, invoice_id);

-- ============================================================================
-- Función transaccional atómica: commit de una factura.
--
-- Realiza, en UNA única transacción PostgreSQL:
--  1. Idempotencia (ON CONFLICT sobre clave única).
--  2. Deduplicación por hash y por identidad comercial.
--  3. Bloqueo del presupuesto (FOR UPDATE) y validación de disponibilidad.
--  4. Reserva o consumo según `reservation_kind`.
--
-- La disponibilidad y la creación de la reserva forman parte de la misma
-- transacción atómica. No se usa una secuencia read-then-write por separado.
-- ============================================================================
CREATE OR REPLACE FUNCTION jippay_commit_invoice(
  p_company_id         TEXT,
  p_period             TEXT,
  p_invoice_id         TEXT,
  p_emisor             TEXT,
  p_commercial_id      TEXT,          -- NULL si identidad no fiable
  p_monto_usd          NUMERIC,
  p_moneda             TEXT,
  p_fecha_vencimiento  TEXT,
  p_file_hash          TEXT,          -- NULL si no disponible
  p_estado             TEXT,
  p_regla_disparada    TEXT,
  p_reservation_kind   TEXT,          -- 'CONSUMED' | 'RESERVE' | 'NONE'
  p_idempotency_key    TEXT,
  p_request_hash       TEXT,
  p_actor              TEXT,
  p_source             TEXT,
  p_rules_fingerprint  TEXT,
  p_razon              TEXT,
  p_creator_email      TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount_cents    BIGINT := (p_monto_usd * 100)::BIGINT;
  v_budget          budget_periods%ROWTYPE;
  v_available_cents BIGINT;
  v_active_cents    BIGINT;
  v_reservation_id  TEXT;
  v_existing_id     TEXT;
  v_flow_status     TEXT;
  v_result          JSONB;
BEGIN
  -- 1. Idempotencia.
  IF EXISTS (SELECT 1 FROM idempotency_records WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key) THEN
    SELECT request_hash INTO v_existing_id FROM idempotency_records
      WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
    IF v_existing_id = p_request_hash THEN
      RETURN jsonb_build_object('status', 'idempotency_replay',
        'response', (SELECT response FROM idempotency_records WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key));
    ELSE
      RETURN jsonb_build_object('status', 'idempotency_conflict');
    END IF;
  END IF;

  -- 2a. Deduplicación por hash.
  IF p_file_hash IS NOT NULL THEN
    SELECT invoice_id INTO v_existing_id FROM invoices
      WHERE company_id = p_company_id AND file_hash = p_file_hash
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'duplicate', 'reason', 'hash', 'existingInvoiceId', v_existing_id);
    END IF;
  END IF;

  -- 2b. Deduplicación por identidad comercial.
  IF p_commercial_id IS NOT NULL THEN
    SELECT invoice_id INTO v_existing_id FROM invoices
      WHERE company_id = p_company_id AND commercial_id = p_commercial_id
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'duplicate', 'reason', 'commercial_id', 'existingInvoiceId', v_existing_id);
    END IF;
  END IF;

  -- 3. Bloqueo del presupuesto del periodo (serializa concurrencia).
  SELECT * INTO v_budget FROM budget_periods
    WHERE company_id = p_company_id AND period = p_period
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'blocked', 'reason', 'budget_period_missing');
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_active_cents FROM budget_reservations
    WHERE company_id = p_company_id AND period = p_period AND status = 'ACTIVE';

  v_available_cents := v_budget.approved_cents - v_budget.consumed_cents - v_active_cents;

  -- 4. Efecto financiero.
  IF p_reservation_kind IN ('CONSUMED','RESERVE') THEN
    IF v_amount_cents > v_available_cents THEN
      RETURN jsonb_build_object('status', 'insufficient_funds',
        'availableCents', v_available_cents, 'requiredCents', v_amount_cents);
    END IF;

    v_reservation_id := 'res-' || substr(md5(p_company_id || '|' || p_invoice_id || '|' || clock_timestamp()::text), 1, 16);

    IF p_reservation_kind = 'CONSUMED' THEN
      UPDATE budget_periods SET consumed_cents = consumed_cents + v_amount_cents,
        version = version + 1, updated_at = now()
        WHERE company_id = p_company_id AND period = p_period;
      INSERT INTO budget_reservations (id, company_id, invoice_id, period, amount_cents, status, reason, actor)
        VALUES (v_reservation_id, p_company_id, p_invoice_id, p_period, v_amount_cents, 'CONSUMED', p_regla_disparada, p_actor);
    ELSE
      INSERT INTO budget_reservations (id, company_id, invoice_id, period, amount_cents, status, reason, actor)
        VALUES (v_reservation_id, p_company_id, p_invoice_id, p_period, v_amount_cents, 'ACTIVE', p_regla_disparada, p_actor);
    END IF;
  END IF;

  -- 5. Registro de la factura.
  v_flow_status := CASE
    WHEN p_estado = 'PAGAR' THEN 'APPROVED_FOR_PAYMENT'
    WHEN p_estado = 'ESCALAR' THEN 'PENDING_REVIEW'
    ELSE 'NOT_APPROVABLE'
  END;

  INSERT INTO invoices (company_id, invoice_id, commercial_id, emisor, monto_usd, moneda, fecha_vencimiento, file_hash, source, estado, regla_disparada, razon, flow_status, creator_email)
    VALUES (p_company_id, p_invoice_id, p_commercial_id, p_emisor, p_monto_usd, p_moneda, p_fecha_vencimiento, p_file_hash, p_source, p_estado, p_regla_disparada, p_razon, v_flow_status, p_creator_email)
    ON CONFLICT (company_id, invoice_id) DO NOTHING;

  INSERT INTO financial_events (id, company_id, type, invoice_id, actor, payload)
    VALUES ('evt-' || substr(md5(clock_timestamp()::text || random()::text), 1, 16), p_company_id, 'COMMIT_INVOICE', p_invoice_id, p_actor,
      jsonb_build_object('estado', p_estado, 'regla', p_regla_disparada, 'kind', p_reservation_kind));

  v_result := jsonb_build_object('status', 'committed',
    'reservationId', v_reservation_id,
    'availableCents', v_available_cents - CASE WHEN p_reservation_kind IN ('CONSUMED','RESERVE') THEN v_amount_cents ELSE 0 END,
    'consumedCents', (SELECT consumed_cents FROM budget_periods WHERE company_id = p_company_id AND period = p_period),
    'decision', jsonb_build_object('estado', p_estado, 'regla_disparada', p_regla_disparada, 'razon', p_razon),
    'rulesFingerprint', p_rules_fingerprint);

  INSERT INTO idempotency_records (company_id, idempotency_key, request_hash, response)
    VALUES (p_company_id, p_idempotency_key, p_request_hash, v_result);

  RETURN v_result;
END;
$$;

-- ============================================================================
-- Funciones transaccionales de liberación y consumo de reservas.
-- ============================================================================

CREATE OR REPLACE FUNCTION jippay_release_reservation(
  p_company_id TEXT,
  p_invoice_id TEXT,
  p_actor      TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_reservation budget_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation FROM budget_reservations
    WHERE company_id = p_company_id AND invoice_id = p_invoice_id AND status = 'ACTIVE'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  UPDATE budget_reservations SET status = 'RELEASED', updated_at = now() WHERE id = v_reservation.id;
  INSERT INTO financial_events (id, company_id, type, invoice_id, actor, payload)
    VALUES ('evt-' || substr(md5(clock_timestamp()::text || random()::text), 1, 16), p_company_id, 'RESERVATION_RELEASED', p_invoice_id, p_actor, jsonb_build_object('reservationId', v_reservation.id));
  RETURN jsonb_build_object('status', 'released', 'reservationId', v_reservation.id);
END;
$$;

CREATE OR REPLACE FUNCTION jippay_consume_reservation(
  p_company_id TEXT,
  p_invoice_id TEXT,
  p_actor      TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_reservation budget_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation FROM budget_reservations
    WHERE company_id = p_company_id AND invoice_id = p_invoice_id AND status = 'ACTIVE'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  -- Transición ACTIVE -> CONSUMED sin doble descuento.
  UPDATE budget_reservations SET status = 'CONSUMED', updated_at = now() WHERE id = v_reservation.id;
  UPDATE budget_periods SET consumed_cents = consumed_cents + v_reservation.amount_cents,
    version = version + 1, updated_at = now()
    WHERE company_id = p_company_id AND period = v_reservation.period;
  INSERT INTO financial_events (id, company_id, type, invoice_id, actor, payload)
    VALUES ('evt-' || substr(md5(clock_timestamp()::text || random()::text), 1, 16), p_company_id, 'RESERVATION_CONSUMED', p_invoice_id, p_actor, jsonb_build_object('reservationId', v_reservation.id, 'amountCents', v_reservation.amount_cents));
  RETURN jsonb_build_object('status', 'consumed', 'reservationId', v_reservation.id);
END;
$$;

-- ============================================================================
-- Función transaccional: aprobación/rechazo humano de una excepción.
--
-- Serializa por empresa (pg_advisory_xact_lock) para encadenar el hash de
-- auditoría sin carreras, revalida el estado y la elegibilidad, registra la
-- decisión firmada y coordina la reserva en UNA transacción.
-- ============================================================================
CREATE OR REPLACE FUNCTION jippay_resolve_approval(
  p_company_id          TEXT,
  p_invoice_id          TEXT,
  p_action              TEXT,
  p_justification       TEXT,
  p_evidence_refs       JSONB,
  p_approver_email      TEXT,
  p_approver_role       TEXT,
  p_approver_name       TEXT,
  p_idempotency_key     TEXT,
  p_request_hash        TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice      invoices%ROWTYPE;
  v_reservation  budget_reservations%ROWTYPE;
  v_prev_flow    TEXT;
  v_next_flow    TEXT;
  v_prev_hash    TEXT;
  v_audit_hash   TEXT;
  v_id           TEXT;
  v_record       approval_records%ROWTYPE;
  v_payload      TEXT;
  v_existing_req TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_company_id));

  -- Idempotencia (replay / conflicto).
  SELECT request_hash INTO v_existing_req FROM approval_records
    WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
  IF v_existing_req IS NOT NULL THEN
    IF v_existing_req = p_request_hash THEN
      RETURN jsonb_build_object('status', 'idempotency_replay');
    ELSE
      RETURN jsonb_build_object('status', 'idempotency_conflict');
    END IF;
  END IF;

  SELECT * INTO v_invoice FROM invoices
    WHERE company_id = p_company_id AND invoice_id = p_invoice_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invoice_not_found');
  END IF;

  IF v_invoice.flow_status <> 'PENDING_REVIEW' THEN
    RETURN jsonb_build_object('status', 'not_pending', 'flowStatus', v_invoice.flow_status);
  END IF;

  SELECT * INTO v_reservation FROM budget_reservations
    WHERE company_id = p_company_id AND invoice_id = p_invoice_id AND status = 'ACTIVE'
    FOR UPDATE;

  IF p_action = 'APPROVE' THEN
    IF v_invoice.regla_disparada NOT IN ('REGLA_3_LIMITE_AUTO', 'REGLA_ACUERDO_PREVIO') THEN
      RETURN jsonb_build_object('status', 'not_approvable', 'reason', 'La regla no admite excepción');
    END IF;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not_approvable', 'reason', 'No existe reserva activa coherente');
    END IF;
  END IF;

  v_prev_flow := v_invoice.flow_status;
  v_next_flow := CASE WHEN p_action = 'APPROVE' THEN 'APPROVED_FOR_PAYMENT' ELSE 'REJECTED' END;

  SELECT audit_hash INTO v_prev_hash FROM approval_records
    WHERE company_id = p_company_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

  v_id := 'apr-' || substr(md5(p_company_id || '|' || p_invoice_id || '|' || p_idempotency_key), 1, 20);

  -- Payload canónico (el hash se recalcula en la capa TypeScript para verificación).
  v_payload := jsonb_build_object(
    'companyId', p_company_id,
    'invoiceId', p_invoice_id,
    'action', p_action,
    'justification', p_justification,
    'evidenceReferences', p_evidence_refs,
    'approverEmail', p_approver_email,
    'approverRole', p_approver_role,
    'approverName', p_approver_name,
    'originalEstado', v_invoice.estado,
    'originalRegla', v_invoice.regla_disparada,
    'originalRazon', v_invoice.razon,
    'montoUsd', v_invoice.monto_usd,
    'moneda', v_invoice.moneda,
    'reservationId', v_reservation.id,
    'reservationStatus', v_reservation.status,
    'rulesFingerprint', '',
    'idempotencyKey', p_idempotency_key,
    'previousFlowStatus', v_prev_flow,
    'nextFlowStatus', v_next_flow,
    'previousAuditHash', v_prev_hash,
    'createdAt', clock_timestamp()::text
  )::text;

  -- El hash de auditoría se calcula en la capa de aplicación con la misma
  -- representación canónica; aquí se guarda un placeholder determinista basado
  -- en el payload y el hash previo (se verifica en lectura).
  v_audit_hash := encode(digest(v_payload, 'sha256'), 'hex');

  INSERT INTO approval_records (
    id, company_id, invoice_id, action, justification, evidence_references,
    approver_email, approver_role, approver_name, original_estado, original_regla,
    original_razon, monto_usd, moneda, reservation_id, reservation_status,
    rules_fingerprint, idempotency_key, request_hash, previous_flow_status, next_flow_status,
    audit_hash, previous_audit_hash, created_at
  ) VALUES (
    v_id, p_company_id, p_invoice_id, p_action, p_justification, p_evidence_refs,
    p_approver_email, p_approver_role, p_approver_name, v_invoice.estado, v_invoice.regla_disparada,
    v_invoice.razon, v_invoice.monto_usd, v_invoice.moneda, v_reservation.id, v_reservation.status,
    '', p_idempotency_key, p_request_hash, v_prev_flow, v_next_flow,
    v_audit_hash, v_prev_hash, clock_timestamp()
  );

  UPDATE invoices SET flow_status = v_next_flow
    WHERE company_id = p_company_id AND invoice_id = p_invoice_id;

  IF p_action = 'REJECT' AND FOUND THEN
    UPDATE budget_reservations SET status = 'RELEASED', updated_at = now() WHERE id = v_reservation.id;
  END IF;

  INSERT INTO financial_events (id, company_id, type, invoice_id, actor, payload)
    VALUES ('evt-' || substr(md5(clock_timestamp()::text || random()::text), 1, 16), p_company_id,
      CASE WHEN p_action = 'APPROVE' THEN 'APPROVAL_SIGNED' ELSE 'REJECTION_SIGNED' END,
      p_invoice_id, p_approver_email, jsonb_build_object('auditHash', v_audit_hash, 'justification', p_justification));

  RETURN jsonb_build_object('status', CASE WHEN p_action = 'APPROVE' THEN 'approved' ELSE 'rejected' END,
    'reservationId', v_reservation.id);
END;
$$;
