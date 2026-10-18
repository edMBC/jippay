import type { CompanyRules } from "../schemas";
import { normalizeInvoiceId, normalizeText, sha256Hex } from "../security";
import { computeApprovalAuditHash } from "./approval-audit";
import { AsyncMutex, type ApprovalRequest, type ApprovalResult, type CommitInvoiceRequest, type CommitInvoiceResult, type IdempotencyRecord, type TransactionalLedger } from "./ledger";
import {
  APPROVABLE_EXCEPTION_RULES,
  fromCents,
  toCents,
  type ApprovalRecord,
  type BudgetPeriod,
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
 * Ledger transaccional en memoria para desarrollo y tests.
 *
 * Garantías REALES:
 * - Serializa las operaciones dentro de un único proceso mediante un mutex FIFO,
 *   de modo que dos llamadas concurrentes en la misma instancia no se pisan.
 *
 * Garantías que NO ofrece (y no se declaran):
 * - NO es seguro entre múltiples instancias/servidores.
 * - NO es durable (se pierde al reiniciar).
 *
 * Por ello `productionSafe: false` y nunca se presenta como apto para operaciones
 * financieras reales en producción.
 */

interface CompanyState {
  company: Company;
  rules: CompanyRules;
  budget: BudgetPeriod;
  reservations: BudgetReservation[];
  invoices: InvoiceRecord[];
  fileHashes: Map<string, string>; // hash -> invoiceId
  commercialIds: Map<string, string>; // commercialId -> invoiceId
  idempotency: Map<string, IdempotencyRecord>;
  memberships: Map<string, CompanyMembership>; // email -> membership
  events: FinancialEvent[];
  approvals: ApprovalRecord[];
  lastAuditHash: string | null;
}

export class InMemoryTransactionalLedger implements TransactionalLedger {
  readonly capabilities: LedgerCapabilities = {
    transactional: true,
    multiInstanceSafe: false,
    persistence: "memory",
    productionSafe: false,
    description:
      "Ledger en memoria con serialización de un único proceso (demo/tests). No es durable ni seguro entre instancias.",
  };

  async verify(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: true, reason: "Ledger en memoria (demo): sin persistencia transaccional multi-instancia" };
  }

  private readonly states = new Map<string, CompanyState>();
  private readonly mutex = new AsyncMutex();

  private nowIso(): string {
    return new Date().toISOString();
  }

  private state(companyId: string): CompanyState {
    const s = this.states.get(companyId);
    if (!s) throw new Error(`Empresa no sembrada: ${companyId}`);
    return s;
  }

  /** Devuelve el estado o `undefined` para consultas de lectura (aislamiento). */
  private stateOf(companyId: string): CompanyState | undefined {
    return this.states.get(companyId);
  }

  async seedCompany(
    companyId: string,
    name: string,
    rules: CompanyRules,
    period: string,
  ): Promise<void> {
    return this.mutex.runExclusive(async () => {
      if (this.states.has(companyId)) return; // Idempotente: no sobrescribe datos existentes.
      const approvedCents = toCents(rules.presupuesto_mensual_restante);
      this.states.set(companyId, {
        company: { id: companyId, name, createdAt: this.nowIso() },
        rules: { ...rules },
        budget: {
          companyId,
          period,
          approvedCents,
          consumedCents: 0,
          version: 0,
          updatedAt: this.nowIso(),
        },
        reservations: [],
        invoices: [],
        fileHashes: new Map(),
        commercialIds: new Map(),
        idempotency: new Map(),
        memberships: new Map(),
        events: [],
        approvals: [],
        lastAuditHash: null,
      });
    });
  }

  async seedMembership(
    companyId: string,
    userEmail: string,
    role: string,
  ): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const s = this.state(companyId);
      const authUserId = `demo:${userEmail}`;
      s.memberships.set(userEmail, {
        companyId,
        userEmail,
        authUserId,
        role,
        status: "active",
        createdAt: this.nowIso(),
        updatedAt: this.nowIso(),
        provisionedBy: null,
      });
    });
  }

  async provisionMembership(
    companyId: string,
    userEmail: string,
    authUserId: string,
    role: string,
  ): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const s = this.state(companyId);
      // Idempotente por identidad estable: no sobrescribe una membresía existente.
      for (const m of s.memberships.values()) {
        if (m.authUserId === authUserId) return;
      }
      s.memberships.set(userEmail, {
        companyId,
        userEmail,
        authUserId,
        role,
        status: "active",
        createdAt: this.nowIso(),
        updatedAt: this.nowIso(),
        provisionedBy: null,
      });
    });
  }

  async getCompany(companyId: string): Promise<Company | null> {
    return this.mutex.runExclusive(async () => this.states.get(companyId)?.company ?? null);
  }

  async lookupIdempotency(companyId: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    return this.mutex.runExclusive(async () => {
      const s = this.states.get(companyId);
      const record = s?.idempotency.get(idempotencyKey);
      return record ? { ...record, response: { ...record.response } } : null;
    });
  }

  async getMembership(companyId: string, userEmail: string): Promise<CompanyMembership | null> {
    return this.mutex.runExclusive(
      async () => this.states.get(companyId)?.memberships.get(userEmail) ?? null,
    );
  }

  async getActiveMembershipByAuthUser(authUserId: string): Promise<CompanyMembership | null> {
    return this.mutex.runExclusive(async () => {
      for (const s of this.states.values()) {
        for (const m of s.memberships.values()) {
          if (m.authUserId === authUserId && m.status === "active") return { ...m };
        }
      }
      return null;
    });
  }

  async getCompanyRules(companyId: string): Promise<CompanyRules | null> {
    return this.mutex.runExclusive(async () => {
      const s = this.states.get(companyId);
      return s ? { ...s.rules } : null;
    });
  }

  async getBudgetSnapshot(companyId: string, period: string): Promise<BudgetSnapshot> {
    return this.mutex.runExclusive(async () => {
      const s = this.stateOf(companyId);
      if (!s) {
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
      const active = s.reservations.filter((r) => r.status === "ACTIVE");
      const reservedCents = active.reduce((sum, r) => sum + r.amountCents, 0);
      const availableCents = s.budget.approvedCents - s.budget.consumedCents - reservedCents;
      return {
        companyId,
        period,
        approvedCents: s.budget.approvedCents,
        consumedCents: s.budget.consumedCents,
        reservedCents,
        availableCents,
        activeReservations: active,
      };
    });
  }

  async listInvoices(companyId: string): Promise<InvoiceRecord[]> {
    return this.mutex.runExclusive(async () => [...(this.stateOf(companyId)?.invoices ?? [])]);
  }

  async listReservations(companyId: string): Promise<BudgetReservation[]> {
    return this.mutex.runExclusive(async () => [...(this.stateOf(companyId)?.reservations ?? [])]);
  }

  async listEvents(companyId: string): Promise<FinancialEvent[]> {
    return this.mutex.runExclusive(async () => [...(this.stateOf(companyId)?.events ?? [])]);
  }

  async listApprovals(companyId: string): Promise<ApprovalRecord[]> {
    return this.mutex.runExclusive(async () => [...(this.stateOf(companyId)?.approvals ?? [])]);
  }

  async getInvoice(companyId: string, invoiceId: string): Promise<InvoiceRecord | null> {
    return this.mutex.runExclusive(async () => {
      const s = this.states.get(companyId);
      const invoice = s?.invoices.find((i) => i.invoiceId === invoiceId);
      return invoice ? { ...invoice } : null;
    });
  }

  async lookupApproval(companyId: string, idempotencyKey: string): Promise<ApprovalRecord | null> {
    return this.mutex.runExclusive(async () => {
      const s = this.states.get(companyId);
      const record = s?.approvals.find((a) => a.idempotencyKey === idempotencyKey);
      return record ? { ...record } : null;
    });
  }

  async resolveApproval(input: ApprovalRequest): Promise<ApprovalResult> {
    return this.mutex.runExclusive(async () => {
      const s = this.state(input.companyId);

      // Idempotencia: replay vs conflicto.
      const existing = s.approvals.find((a) => a.idempotencyKey === input.idempotencyKey);
      if (existing) {
        if (existing.requestHash === input.requestHash) {
          return { status: "idempotency_replay", record: { ...existing } };
        }
        return { status: "idempotency_conflict" };
      }

      const invoice = s.invoices.find((i) => i.invoiceId === input.invoiceId);
      if (!invoice) return { status: "invoice_not_found" };

      if (invoice.flowStatus !== "PENDING_REVIEW") {
        return { status: "not_pending", flowStatus: invoice.flowStatus };
      }

      const reservation = s.reservations.find(
        (r) => r.invoiceId === input.invoiceId && r.status === "ACTIVE",
      );

      if (input.action === "APPROVE") {
        // Elegibilidad estricta: solo motivos autorizables, con reserva activa coherente.
        if (!APPROVABLE_EXCEPTION_RULES.has(invoice.reglaDisparada)) {
          return { status: "not_approvable", reason: `La regla "${invoice.reglaDisparada}" no admite excepción` };
        }
        if (!reservation) {
          return { status: "not_approvable", reason: "No existe una reserva activa coherente para esta factura" };
        }
      }

      const previousFlowStatus = invoice.flowStatus;
      const nextFlowStatus: InvoiceFlowStatus =
        input.action === "APPROVE" ? "APPROVED_FOR_PAYMENT" : "REJECTED";

      const record: ApprovalRecord = {
        id: `apr-${sha256Hex(`${input.companyId}|${input.invoiceId}|${input.idempotencyKey}`).slice(0, 20)}`,
        companyId: input.companyId,
        invoiceId: input.invoiceId,
        action: input.action,
        justification: input.justification,
        evidenceReferences: input.evidenceReferences,
        approverEmail: input.approverEmail,
        approverRole: input.approverRole,
        approverName: input.approverName,
        originalEstado: invoice.estado,
        originalRegla: invoice.reglaDisparada,
        originalRazon: invoice.razon,
        montoUsd: invoice.montoUsd,
        moneda: invoice.moneda,
        reservationId: reservation?.id ?? null,
        reservationStatus: reservation?.status ?? null,
        rulesFingerprint: "server",
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        previousFlowStatus,
        nextFlowStatus,
        auditHash: "",
        previousAuditHash: s.lastAuditHash,
        createdAt: this.nowIso(),
      };
      record.auditHash = computeApprovalAuditHash(record);

      // Efectos financieros + transición de estado (atómicos dentro del mutex).
      invoice.flowStatus = nextFlowStatus;
      if (input.action === "REJECT" && reservation) {
        reservation.status = "RELEASED";
        reservation.updatedAt = this.nowIso();
      }
      // APPROVE conserva la reserva activa (no se consume ni se libera).

      s.approvals.push(record);
      s.lastAuditHash = record.auditHash;
      this.recordEvent(s, input.action === "APPROVE" ? "APPROVAL_SIGNED" : "REJECTION_SIGNED", input.invoiceId, input.approverEmail, {
        auditHash: record.auditHash,
        justification: input.justification,
        reservationId: reservation?.id ?? null,
      });

      return input.action === "APPROVE"
        ? { status: "approved", record, reservation: reservation ? { ...reservation } : null }
        : { status: "rejected", record, reservation: reservation ? { ...reservation } : null };
    });
  }

  async commitInvoice(input: CommitInvoiceRequest): Promise<CommitInvoiceResult> {
    return this.mutex.runExclusive(async () => {
      const s = this.state(input.companyId);
      const amountCents = toCents(input.invoice.montoUsd);

      // Idempotencia: misma clave + mismo contenido -> resultado anterior; clave + contenido distinto -> conflicto.
      const existing = s.idempotency.get(input.idempotencyKey);
      if (existing) {
        if (existing.requestHash === input.requestHash) {
          return { status: "idempotency_replay", response: existing.response };
        }
        return { status: "idempotency_conflict" };
      }

      // Deduplicación por hash binario (evidencia fiable e independiente de la calidad).
      if (input.invoice.fileHash) {
        const hash = input.invoice.fileHash.trim().toLowerCase();
        const existingId = s.fileHashes.get(hash);
        if (existingId) {
          const result: CommitInvoiceResult = {
            status: "duplicate",
            reason: "hash",
            existingInvoiceId: existingId,
          };
          this.recordEvent(s, "DUPLICATE_HASH", input.invoice.id, input.actor, { existingInvoiceId: existingId });
          s.idempotency.set(input.idempotencyKey, { requestHash: input.requestHash, response: result });
          return result;
        }
      }

      // Deduplicación por identidad comercial (solo cuando la identidad es fiable).
      if (input.invoice.commercialId) {
        const cid = normalizeInvoiceId(input.invoice.commercialId);
        const existingId = s.commercialIds.get(cid);
        if (existingId) {
          const result: CommitInvoiceResult = {
            status: "duplicate",
            reason: "commercial_id",
            existingInvoiceId: existingId,
          };
          this.recordEvent(s, "DUPLICATE_COMMERCIAL_ID", input.invoice.id, input.actor, { existingInvoiceId: existingId });
          s.idempotency.set(input.idempotencyKey, { requestHash: input.requestHash, response: result });
          return result;
        }
      }

      // Disponibilidad presupuestaria (autoritativa dentro de esta transacción).
      const active = s.reservations.filter((r) => r.status === "ACTIVE");
      const reservedCents = active.reduce((sum, r) => sum + r.amountCents, 0);
      const availableCents = s.budget.approvedCents - s.budget.consumedCents - reservedCents;

      const needsFunds = input.reservationKind === "RESERVE" || input.reservationKind === "CONSUMED";
      if (needsFunds && amountCents > availableCents) {
        const result: CommitInvoiceResult = {
          status: "insufficient_funds",
          availableCents,
          requiredCents: amountCents,
        };
        this.recordEvent(s, "INSUFFICIENT_FUNDS", input.invoice.id, input.actor, { availableCents, requiredCents: amountCents });
        s.idempotency.set(input.idempotencyKey, { requestHash: input.requestHash, response: result });
        return result;
      }

      // Registro de la factura (trazabilidad) y efecto financiero.
      const invoiceRecord: InvoiceRecord = {
        companyId: input.companyId,
        invoiceId: input.invoice.id,
        commercialId: input.invoice.commercialId ?? input.invoice.id,
        emisor: input.invoice.emisor,
        montoUsd: input.invoice.montoUsd,
        moneda: input.moneda,
        fechaVencimiento: input.fechaVencimiento,
        fileHash: input.invoice.fileHash ?? null,
        source: input.source,
        estado: input.decision.estado,
        reglaDisparada: input.decision.regla_disparada,
        razon: input.decision.razon,
        flowStatus: this.initialFlowStatus(input.decision.estado),
        creatorEmail: input.creatorEmail ?? null,
        createdAt: this.nowIso(),
      };
      s.invoices.push(invoiceRecord);

      if (input.invoice.fileHash) {
        s.fileHashes.set(input.invoice.fileHash.trim().toLowerCase(), input.invoice.id);
      }
      if (input.invoice.commercialId) {
        s.commercialIds.set(normalizeInvoiceId(input.invoice.commercialId), input.invoice.id);
      }

      let reservation: BudgetReservation | null = null;

      if (input.reservationKind === "RESERVE") {
        // Una misma factura no puede tener dos reservas activas.
        const duplicateActive = s.reservations.find(
          (r) => r.invoiceId === input.invoice.id && r.status === "ACTIVE",
        );
        if (!duplicateActive) {
          reservation = {
            id: `res-${sha256Hex(`${input.companyId}|${input.invoice.id}|${Date.now()}`).slice(0, 16)}`,
            companyId: input.companyId,
            invoiceId: input.invoice.id,
            period: input.period,
            amountCents,
            status: "ACTIVE",
            reason: input.decision.regla_disparada,
            actor: input.actor,
            createdAt: this.nowIso(),
            updatedAt: this.nowIso(),
          };
          s.reservations.push(reservation);
        }
        this.recordEvent(s, "RESERVATION_CREATED", input.invoice.id, input.actor, {
          amountCents,
          reservationId: reservation?.id ?? null,
        });
      } else if (input.reservationKind === "CONSUMED") {
        s.budget.consumedCents += amountCents;
        s.budget.version += 1;
        s.budget.updatedAt = this.nowIso();
        reservation = {
          id: `res-${sha256Hex(`${input.companyId}|${input.invoice.id}|${Date.now()}`).slice(0, 16)}`,
          companyId: input.companyId,
          invoiceId: input.invoice.id,
          period: input.period,
          amountCents,
          status: "CONSUMED",
          reason: input.decision.regla_disparada,
          actor: input.actor,
          createdAt: this.nowIso(),
          updatedAt: this.nowIso(),
        };
        s.reservations.push(reservation);
        this.recordEvent(s, "BUDGET_CONSUMED", input.invoice.id, input.actor, { amountCents, reservationId: reservation.id });
      } else {
        this.recordEvent(s, "NO_FINANCIAL_EFFECT", input.invoice.id, input.actor, { decision: input.decision });
      }

      const finalResult: CommitInvoiceResult = {
        status: "committed",
        reservation,
        availableCents: availableCents - (input.reservationKind === "CONSUMED" ? amountCents : input.reservationKind === "RESERVE" ? amountCents : 0),
        consumedCents: s.budget.consumedCents,
        decision: { ...input.decision },
        rulesFingerprint: input.rulesFingerprint,
      };
      s.idempotency.set(input.idempotencyKey, { requestHash: input.requestHash, response: finalResult });
      return finalResult;
    });
  }

  async releaseReservation(
    companyId: string,
    invoiceId: string,
    actor: string,
  ): Promise<BudgetReservation | null> {
    return this.mutex.runExclusive(async () => {
      const s = this.state(companyId);
      const r = s.reservations.find((x) => x.invoiceId === invoiceId && x.status === "ACTIVE");
      if (!r) return null;
      r.status = "RELEASED";
      r.updatedAt = this.nowIso();
      this.recordEvent(s, "RESERVATION_RELEASED", invoiceId, actor, {
        reservationId: r.id,
        actor,
      });
      return { ...r };
    });
  }

  async consumeReservation(
    companyId: string,
    invoiceId: string,
    actor: string,
  ): Promise<BudgetReservation | null> {
    return this.mutex.runExclusive(async () => {
      const s = this.state(companyId);
      const r = s.reservations.find((x) => x.invoiceId === invoiceId && x.status === "ACTIVE");
      if (!r) return null;
      // Transición ACTIVE -> CONSUMED: se libera la reserva activa y se contabiliza
      // el importe una única vez, sin doble descuento.
      r.status = "CONSUMED";
      r.updatedAt = this.nowIso();
      s.budget.consumedCents += r.amountCents;
      s.budget.version += 1;
      s.budget.updatedAt = this.nowIso();
      this.recordEvent(s, "RESERVATION_CONSUMED", invoiceId, actor, {
        reservationId: r.id,
        amountCents: r.amountCents,
        actor,
      });
      return { ...r };
    });
  }

  private recordEvent(
    s: CompanyState,
    type: string,
    invoiceId: string,
    actor: string | null,
    payload: Record<string, unknown>,
  ): void {
    s.events.push({
      id: `evt-${sha256Hex(`${type}|${Date.now()}|${Math.random()}`).slice(0, 16)}`,
      companyId: s.company.id,
      type,
      invoiceId,
      actor,
      payload,
      createdAt: this.nowIso(),
    });
  }

  private initialFlowStatus(estado: string): InvoiceFlowStatus {
    switch (estado) {
      case "PAGAR":
        return "APPROVED_FOR_PAYMENT";
      case "ESCALAR":
        return "PENDING_REVIEW";
      default:
        return "NOT_APPROVABLE";
    }
  }
}

// Re-export para conveniencia de los tests.
export { fromCents };
export function normalizeCompanyId(value: string): string {
  return normalizeText(value);
}
