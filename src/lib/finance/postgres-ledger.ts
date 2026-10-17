import type { CompanyRules } from "../schemas";
import type { ApprovalRequest, ApprovalResult, CommitInvoiceRequest, CommitInvoiceResult, IdempotencyRecord, TransactionalLedger } from "./ledger";
import {
  toCents,
  type ApprovalRecord,
  type BudgetReservation,
  type BudgetSnapshot,
  type Company,
  type CompanyMembership,
  type FinancialEvent,
  type InvoiceFlowStatus,
  type InvoiceRecord,
  type LedgerCapabilities,
} from "./model";

/**
 * Ledger transaccional sobre PostgreSQL/Supabase.
 *
 * Garantías REALES (cuando `DATABASE_URL` apunta a un PostgreSQL):
 * - `commitInvoice` invoca una única función SQL (`jippay_commit_invoice`) que
 *   ejecuta idempotencia, deduplicación, bloqueo de fila (`FOR UPDATE`) y la
 *   reserva/consumo dentro de UNA transacción atómica de PostgreSQL.
 * - La disponibilidad y la creación de la reserva nunca se resuelven con una
 *   secuencia read-then-write separada.
 *
 * NO se instancia sin `DATABASE_URL`; la fábrica devuelve el ledger en memoria
 * (demo) en ese caso. Este ledger queda bloqueado si falta la base de datos.
 */

type SqlResult = Record<string, unknown> & { status: string };

let poolPromise: Promise<import("pg").Pool> | null = null;

async function getPool(): Promise<import("pg").Pool> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no configurado: no se puede iniciar el ledger PostgreSQL");
  }
  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import("pg");
      return new Pool({ connectionString: url, max: 5 });
    })();
  }
  return poolPromise;
}

function mapSqlResult(json: SqlResult, input: CommitInvoiceRequest): CommitInvoiceResult {
  switch (json.status) {
    case "committed": {
      const reservationId = typeof json.reservationId === "string" ? json.reservationId : null;
      const status = input.reservationKind === "CONSUMED" ? "CONSUMED" : input.reservationKind === "RESERVE" ? "ACTIVE" : null;
      const reservation: BudgetReservation | null =
        reservationId && status
          ? {
              id: reservationId,
              companyId: input.companyId,
              invoiceId: input.invoice.id,
              period: input.period,
              amountCents: toCents(input.invoice.montoUsd),
              status,
              reason: input.decision.regla_disparada,
              actor: input.actor,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : null;
      const decision = (json.decision as CommitInvoiceRequest["decision"]) ?? {
        estado: input.decision.estado,
        regla_disparada: input.decision.regla_disparada,
        razon: input.decision.razon,
      };
      return {
        status: "committed",
        reservation,
        availableCents: Number(json.availableCents ?? 0),
        consumedCents: Number(json.consumedCents ?? 0),
        decision,
        rulesFingerprint: String(json.rulesFingerprint ?? input.rulesFingerprint),
      };
    }
    case "duplicate":
      return {
        status: "duplicate",
        reason: (json.reason as "hash" | "commercial_id") ?? "commercial_id",
        existingInvoiceId: String(json.existingInvoiceId ?? ""),
      };
    case "insufficient_funds":
      return {
        status: "insufficient_funds",
        availableCents: Number(json.availableCents ?? 0),
        requiredCents: Number(json.requiredCents ?? 0),
      };
    case "idempotency_replay":
      return {
        status: "idempotency_replay",
        response: mapSqlResult(json.response as SqlResult, input),
      };
    case "idempotency_conflict":
      return { status: "idempotency_conflict" };
    case "blocked":
      return { status: "blocked", reason: String(json.reason ?? "desconocido") };
    default:
      return { status: "blocked", reason: `resultado desconocido: ${json.status}` };
  }
}

export class PostgresTransactionalLedger implements TransactionalLedger {
  private _schemaVerified = false;

  get capabilities(): LedgerCapabilities {
    return {
      transactional: true,
      multiInstanceSafe: true,
      persistence: "durable",
      // `productionSafe` solo tras verificar conexión + esquema esperado. La mera
      // existencia de `DATABASE_URL` no habilita operaciones financieras reales.
      productionSafe: this._schemaVerified,
      description: this._schemaVerified
        ? "Ledger PostgreSQL verificado: commits ACID atómicos y seguro entre instancias."
        : "Ledger PostgreSQL pendiente de verificación de esquema (no habilitado para operaciones financieras reales).",
    };
  }

  async verify(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const pool = await getPool();
      const { rows } = await pool.query(
        `SELECT
           to_regclass('public.budget_periods') IS NOT NULL AS has_budget,
           to_regclass('public.budget_reservations') IS NOT NULL AS has_reservations,
           to_regclass('public.invoices') IS NOT NULL AS has_invoices,
           to_regclass('public.idempotency_records') IS NOT NULL AS has_idem,
           EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jippay_commit_invoice') AS has_fn`,
      );
      const r = rows[0];
      const ready = !!(r?.has_budget && r?.has_reservations && r?.has_invoices && r?.has_idem && r?.has_fn);
      this._schemaVerified = ready;
      if (!ready) {
        return { ok: false, reason: "El esquema financiero esperado no está completo; aplica la migración 001_initial_financial_schema.sql" };
      }
      return { ok: true, reason: "Esquema financiero verificado" };
    } catch (error) {
      this._schemaVerified = false;
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async commitInvoice(input: CommitInvoiceRequest): Promise<CommitInvoiceResult> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT jippay_commit_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) AS result`,
      [
        input.companyId,
        input.period,
        input.invoice.id,
        input.invoice.emisor,
        input.invoice.commercialId,
        input.invoice.montoUsd,
        input.moneda,
        input.fechaVencimiento,
        input.invoice.fileHash,
        input.decision.estado,
        input.decision.regla_disparada,
        input.reservationKind,
        input.idempotencyKey,
        input.requestHash,
        input.actor,
        input.source,
        input.rulesFingerprint,
        input.decision.razon,
        input.creatorEmail,
      ],
    );
    return mapSqlResult(rows[0].result as SqlResult, input);
  }

  async lookupIdempotency(companyId: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT request_hash, response FROM idempotency_records WHERE company_id=$1 AND idempotency_key=$2`,
      [companyId, idempotencyKey],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      requestHash: String(r.request_hash),
      response: (r.response ?? {}) as CommitInvoiceResult,
    };
  }

  async releaseReservation(companyId: string, invoiceId: string, actor: string): Promise<BudgetReservation | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT jippay_release_reservation($1,$2,$3) AS result`,
      [companyId, invoiceId, actor],
    );
    const r = rows[0]?.result as SqlResult;
    if (!r || r.status !== "released") return null;
    return this.findReservation(companyId, invoiceId);
  }

  async consumeReservation(companyId: string, invoiceId: string, actor: string): Promise<BudgetReservation | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT jippay_consume_reservation($1,$2,$3) AS result`,
      [companyId, invoiceId, actor],
    );
    const r = rows[0]?.result as SqlResult;
    if (!r || r.status !== "consumed") return null;
    return this.findReservation(companyId, invoiceId);
  }

  private async findReservation(companyId: string, invoiceId: string): Promise<BudgetReservation | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT id, company_id, invoice_id, period, amount_cents, status, reason, actor, created_at, updated_at
         FROM budget_reservations WHERE company_id=$1 AND invoice_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [companyId, invoiceId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      companyId: r.company_id,
      invoiceId: r.invoice_id,
      period: r.period,
      amountCents: Number(r.amount_cents),
      status: r.status,
      reason: r.reason,
      actor: r.actor,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    };
  }

  async getBudgetSnapshot(companyId: string, period: string): Promise<BudgetSnapshot> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT approved_cents, consumed_cents FROM budget_periods WHERE company_id=$1 AND period=$2`,
      [companyId, period],
    );
    const b = rows[0];
    if (!b) {
      return {
        companyId,
        period,
        approvedCents: 0,
        consumedCents: 0,
        reservedCents: 0,
        availableCents: 0,
        activeReservations: [],
      };
    }
    const { rows: resRows } = await pool.query(
      `SELECT id, company_id, invoice_id, period, amount_cents, status, reason, actor, created_at, updated_at
         FROM budget_reservations WHERE company_id=$1 AND period=$2 AND status='ACTIVE'`,
      [companyId, period],
    );
    const activeReservations: BudgetReservation[] = resRows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      invoiceId: r.invoice_id,
      period: r.period,
      amountCents: Number(r.amount_cents),
      status: r.status,
      reason: r.reason,
      actor: r.actor,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    }));
    const reservedCents = activeReservations.reduce((sum, r) => sum + r.amountCents, 0);
    const approvedCents = Number(b.approved_cents);
    const consumedCents = Number(b.consumed_cents);
    return {
      companyId,
      period,
      approvedCents,
      consumedCents,
      reservedCents,
      availableCents: approvedCents - consumedCents - reservedCents,
      activeReservations,
    };
  }

  async getCompanyRules(companyId: string): Promise<CompanyRules | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT limite_monto_automatico, presupuesto_mensual_restante, proveedores_permitidos, acuerdos_por_proveedor
         FROM company_rules WHERE company_id=$1`,
      [companyId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      limite_monto_automatico: Number(r.limite_monto_automatico) / 100,
      presupuesto_mensual_restante: Number(r.presupuesto_mensual_restante) / 100,
      proveedores_permitidos: (r.proveedores_permitidos ?? []) as string[],
      acuerdos_por_proveedor: (r.acuerdos_por_proveedor ?? {}) as Record<string, number>,
    };
  }

  async seedCompany(companyId: string, name: string, rules: CompanyRules, period: string): Promise<void> {
    const pool = await getPool();
    await pool.query(`INSERT INTO companies(id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [companyId, name]);
    await pool.query(
      `INSERT INTO company_rules(company_id, limite_monto_automatico, presupuesto_mensual_restante, proveedores_permitidos, acuerdos_por_proveedor)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (company_id) DO UPDATE SET
           limite_monto_automatico=EXCLUDED.limite_monto_automatico,
           presupuesto_mensual_restante=EXCLUDED.presupuesto_mensual_restante,
           proveedores_permitidos=EXCLUDED.proveedores_permitidos,
           acuerdos_por_proveedor=EXCLUDED.acuerdos_por_proveedor,
           version=company_rules.version+1, updated_at=now()`,
      [
        companyId,
        toCents(rules.limite_monto_automatico),
        toCents(rules.presupuesto_mensual_restante),
        JSON.stringify(rules.proveedores_permitidos),
        JSON.stringify(rules.acuerdos_por_proveedor ?? {}),
      ],
    );
    await pool.query(
      `INSERT INTO budget_periods(company_id, period, approved_cents) VALUES ($1,$2,$3)
         ON CONFLICT (company_id, period) DO NOTHING`,
      [companyId, period, toCents(rules.presupuesto_mensual_restante)],
    );
  }

  async seedMembership(companyId: string, userEmail: string, role: string): Promise<void> {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO company_memberships(company_id, user_email, auth_user_id, role, status)
         VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (company_id, user_email) DO UPDATE SET role=EXCLUDED.role, status='active', updated_at=now()`,
      [companyId, userEmail, `demo:${userEmail}`, role],
    );
  }

  async getCompany(companyId: string): Promise<Company | null> {
    const pool = await getPool();
    const { rows } = await pool.query(`SELECT id, name, created_at FROM companies WHERE id=$1`, [companyId]);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    };
  }

  async getMembership(companyId: string, userEmail: string): Promise<CompanyMembership | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT company_id, user_email, auth_user_id, role, status, created_at, updated_at, provisioned_by
         FROM company_memberships WHERE company_id=$1 AND user_email=$2`,
      [companyId, userEmail],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      companyId: r.company_id,
      userEmail: r.user_email,
      authUserId: r.auth_user_id ?? `demo:${r.user_email}`,
      role: r.role,
      status: r.status ?? "active",
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      provisionedBy: r.provisioned_by ?? null,
    };
  }

  async getActiveMembershipByAuthUser(authUserId: string): Promise<CompanyMembership | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT company_id, user_email, auth_user_id, role, status, created_at, updated_at, provisioned_by
         FROM company_memberships WHERE auth_user_id=$1 AND status='active'
         ORDER BY created_at ASC LIMIT 1`,
      [authUserId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      companyId: r.company_id,
      userEmail: r.user_email,
      authUserId: r.auth_user_id ?? authUserId,
      role: r.role,
      status: r.status ?? "active",
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      provisionedBy: r.provisioned_by ?? null,
    };
  }

  async listInvoices(companyId: string): Promise<InvoiceRecord[]> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT invoice_id, commercial_id, emisor, monto_usd, moneda, fecha_vencimiento, file_hash, source, estado, regla_disparada, razon, flow_status, creator_email, created_at
         FROM invoices WHERE company_id=$1 ORDER BY created_at`,
      [companyId],
    );
    return rows.map((r) => ({
      companyId,
      invoiceId: r.invoice_id,
      commercialId: r.commercial_id ?? r.invoice_id,
      emisor: r.emisor,
      montoUsd: Number(r.monto_usd),
      moneda: r.moneda,
      fechaVencimiento: r.fecha_vencimiento,
      fileHash: r.file_hash ?? null,
      source: r.source,
      estado: r.estado,
      reglaDisparada: r.regla_disparada,
      razon: r.razon ?? "",
      flowStatus: (r.flow_status ?? "PENDING_REVIEW") as InvoiceFlowStatus,
      creatorEmail: r.creator_email ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  async listApprovals(companyId: string): Promise<ApprovalRecord[]> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT * FROM approval_records WHERE company_id=$1 ORDER BY created_at`,
      [companyId],
    );
    return rows.map((r) => this.mapApprovalRow(r));
  }

  async getInvoice(companyId: string, invoiceId: string): Promise<InvoiceRecord | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT invoice_id, commercial_id, emisor, monto_usd, moneda, fecha_vencimiento, file_hash, source, estado, regla_disparada, razon, flow_status, creator_email, created_at
         FROM invoices WHERE company_id=$1 AND invoice_id=$2`,
      [companyId, invoiceId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      companyId,
      invoiceId: r.invoice_id,
      commercialId: r.commercial_id ?? r.invoice_id,
      emisor: r.emisor,
      montoUsd: Number(r.monto_usd),
      moneda: r.moneda,
      fechaVencimiento: r.fecha_vencimiento,
      fileHash: r.file_hash ?? null,
      source: r.source,
      estado: r.estado,
      reglaDisparada: r.regla_disparada,
      razon: r.razon ?? "",
      flowStatus: (r.flow_status ?? "PENDING_REVIEW") as InvoiceFlowStatus,
      creatorEmail: r.creator_email ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    };
  }

  async lookupApproval(companyId: string, idempotencyKey: string): Promise<ApprovalRecord | null> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT * FROM approval_records WHERE company_id=$1 AND idempotency_key=$2`,
      [companyId, idempotencyKey],
    );
    return rows[0] ? this.mapApprovalRow(rows[0]) : null;
  }

  async resolveApproval(input: ApprovalRequest): Promise<ApprovalResult> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT jippay_resolve_approval($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result`,
      [
        input.companyId,
        input.invoiceId,
        input.action,
        input.justification,
        JSON.stringify(input.evidenceReferences),
        input.approverEmail,
        input.approverRole,
        input.approverName,
        input.idempotencyKey,
        input.requestHash,
      ],
    );
    const json = rows[0]?.result as Record<string, unknown>;
    const status = String(json?.status ?? "blocked");
    switch (status) {
      case "approved":
      case "rejected": {
        const record = await this.lookupApproval(input.companyId, input.idempotencyKey);
        const reservation = json.reservationId
          ? (await this.listReservations(input.companyId)).find((r) => r.id === String(json.reservationId)) ?? null
          : null;
        return status === "approved"
          ? { status: "approved", record: record!, reservation }
          : { status: "rejected", record: record!, reservation };
      }
      case "idempotency_replay": {
        const record = await this.lookupApproval(input.companyId, input.idempotencyKey);
        return { status: "idempotency_replay", record: record! };
      }
      case "idempotency_conflict":
        return { status: "idempotency_conflict" };
      case "invoice_not_found":
        return { status: "invoice_not_found" };
      case "not_approvable":
        return { status: "not_approvable", reason: String(json.reason ?? "") };
      case "not_pending":
        return { status: "not_pending", flowStatus: (json.flowStatus as InvoiceFlowStatus) ?? "NOT_APPROVABLE" };
      default:
        return { status: "not_approvable", reason: String(json.reason ?? "resultado desconocido") };
    }
  }

  private mapApprovalRow(r: Record<string, unknown>): ApprovalRecord {
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      invoiceId: String(r.invoice_id),
      action: r.action as ApprovalRecord["action"],
      justification: String(r.justification),
      evidenceReferences: (r.evidence_references ?? []) as string[],
      approverEmail: String(r.approver_email),
      approverRole: String(r.approver_role),
      approverName: (r.approver_name as string | null) ?? null,
      originalEstado: String(r.original_estado),
      originalRegla: String(r.original_regla),
      originalRazon: String(r.original_razon ?? ""),
      montoUsd: Number(r.monto_usd),
      moneda: String(r.moneda),
      reservationId: (r.reservation_id as string | null) ?? null,
      reservationStatus: (r.reservation_status as ApprovalRecord["reservationStatus"]) ?? null,
      rulesFingerprint: String(r.rules_fingerprint ?? ""),
      idempotencyKey: String(r.idempotency_key),
      requestHash: String(r.request_hash ?? ""),
      previousFlowStatus: (r.previous_flow_status as InvoiceFlowStatus) ?? "PENDING_REVIEW",
      nextFlowStatus: (r.next_flow_status as InvoiceFlowStatus) ?? "NOT_APPROVABLE",
      auditHash: String(r.audit_hash),
      previousAuditHash: (r.previous_audit_hash as string | null) ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    };
  }

  async listReservations(companyId: string): Promise<BudgetReservation[]> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT id, company_id, invoice_id, period, amount_cents, status, reason, actor, created_at, updated_at
         FROM budget_reservations WHERE company_id=$1 ORDER BY created_at`,
      [companyId],
    );
    return rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      invoiceId: r.invoice_id,
      period: r.period,
      amountCents: Number(r.amount_cents),
      status: r.status,
      reason: r.reason,
      actor: r.actor,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    }));
  }

  async listEvents(companyId: string): Promise<FinancialEvent[]> {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT id, company_id, type, invoice_id, actor, payload, created_at
         FROM financial_events WHERE company_id=$1 ORDER BY created_at`,
      [companyId],
    );
    return rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      type: r.type,
      invoiceId: r.invoice_id ?? null,
      actor: r.actor ?? null,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }
}
