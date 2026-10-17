import type { CompanyRules } from "../schemas";
import type {
  ApprovalAction,
  ApprovalRecord,
  BudgetReservation,
  BudgetSnapshot,
  Company,
  CompanyMembership,
  FinancialEvent,
  InvoiceFlowStatus,
  InvoiceRecord,
  LedgerCapabilities,
  ReservationKind,
} from "./model";

/**
 * Contrato del ledger transaccional. Un único método `commitInvoice` realiza la
 * finalización financiera de forma atómica: idempotencia, deduplicación y reserva
 * o consumo presupuestario se resuelven dentro de una única transacción.
 *
 * Las implementaciones deben declarar sus capacidades reales; un adaptador no
 * transaccional jamás se presenta como apto para operaciones financieras reales.
 */

export type DuplicateReason = "hash" | "commercial_id";

/**
 * Resumen inmutable del veredicto determinista registrado en una operación
 * confirmada. Se conserva en el resultado para que un reintento devuelva la
 * decisión efectivamente confirmada (no una decisión recomputada con reglas o
 * presupuestos posteriores).
 */
export interface CommitDecisionSummary {
  estado: "PAGAR" | "ESCALAR" | "FRENAR";
  regla_disparada: string;
  razon: string;
}

export interface CommitInvoiceRequest {
  companyId: string;
  period: string;
  invoice: {
    id: string;
    emisor: string;
    /**
     * Identidad comercial normalizada (emisor + número), usada para deduplicar.
     * `null` cuando la identidad no es fiable: en ese caso NO se aplica la
     * restricción única comercial (la factura requiere validación y reevaluación).
     */
    commercialId: string | null;
    montoUsd: number;
    fileHash: string | null;
  };
  /** Veredicto determinista ya calculado por `evaluateInvoice`. */
  decision: CommitDecisionSummary;
  /** Tipo de efecto financiero decidido por el orquestador. */
  reservationKind: ReservationKind;
  idempotencyKey: string;
  /**
   * Hash del CONTENIDO de la petición (documento + empresa + fuente). Se separa
   * deliberadamente de la versión de reglas/presupuesto: un cambio de presupuesto
   * posterior no debe hacer colisionar una repetición de la misma operación.
   */
  requestHash: string;
  /**
   * Huella de las reglas y el presupuesto efectivamente aplicados en esta
   * ejecución. Se conserva en el resultado confirmado (no participa en el match
   * de idempotencia).
   */
  rulesFingerprint: string;
  /** Email estable del actor que origina la operación (para segregación de funciones). */
  creatorEmail: string;
  actor: string;
  source: string;
  moneda: string;
  fechaVencimiento: string;
}

export type CommitInvoiceResult =
  | {
      status: "committed";
      reservation: BudgetReservation | null;
      availableCents: number;
      consumedCents: number;
      decision: CommitDecisionSummary;
      rulesFingerprint: string;
    }
  | { status: "duplicate"; reason: DuplicateReason; existingInvoiceId: string }
  | { status: "insufficient_funds"; availableCents: number; requiredCents: number }
  | { status: "idempotency_replay"; response: CommitInvoiceResult }
  | { status: "idempotency_conflict" }
  | { status: "blocked"; reason: string };

export interface IdempotencyRecord {
  requestHash: string;
  response: CommitInvoiceResult;
}

/** Solicitud de aprobación/rechazo humano (validada en servidor). */
export interface ApprovalRequest {
  companyId: string;
  invoiceId: string;
  action: ApprovalAction;
  justification: string;
  evidenceReferences: string[];
  approverEmail: string;
  approverRole: string;
  approverName: string | null;
  idempotencyKey: string;
  /** Hash del contenido de la solicitud (empresa + factura + acción + justificación + refs). */
  requestHash: string;
}

export type ApprovalResult =
  | { status: "approved"; record: ApprovalRecord; reservation: BudgetReservation | null }
  | { status: "rejected"; record: ApprovalRecord; reservation: BudgetReservation | null }
  | { status: "invoice_not_found" }
  | { status: "not_approvable"; reason: string }
  | { status: "not_pending"; flowStatus: InvoiceFlowStatus }
  | { status: "idempotency_replay"; record: ApprovalRecord }
  | { status: "idempotency_conflict" };

export interface TransactionalLedger {
  readonly capabilities: LedgerCapabilities;

  /**
   * Verifica que la infraestructura subyacente existe y está operativa (conexión +
   * esquema esperado). Un ledger de producción NO se considera `productionSafe`
   * hasta que esta verificación tiene éxito.
   */
  verify(): Promise<{ ok: boolean; reason?: string }>;

  /**
   * Resuelve una excepción escalada (aprobación o rechazo) de forma atómica:
   * revalida estado y elegibilidad, registra la decisión firmada, coordina la
   * reserva y escribe el evento de auditoría en una única transacción.
   */
  resolveApproval(input: ApprovalRequest): Promise<ApprovalResult>;

  /** Devuelve un registro de aprobación previo por clave de idempotencia, o `null`. */
  lookupApproval(
    companyId: string,
    idempotencyKey: string,
  ): Promise<ApprovalRecord | null>;

  /** Devuelve la factura dentro del ámbito de la empresa, o `null`. */
  getInvoice(companyId: string, invoiceId: string): Promise<InvoiceRecord | null>;

  /** Commit atómico: la única vía para confirmar una reserva o consumo presupuestario. */
  commitInvoice(input: CommitInvoiceRequest): Promise<CommitInvoiceResult>;

  /**
   * Devuelve el registro de idempotencia previo (sin ejecutar efectos), o `null`.
   * Permite al orquestador devolver el resultado original sin reevaluar ni
   * recomprometer fondos.
   */
  lookupIdempotency(companyId: string, idempotencyKey: string): Promise<IdempotencyRecord | null>;

  /** Libera atómicamente una reserva activa conservando su trazabilidad. */
  releaseReservation(
    companyId: string,
    invoiceId: string,
    actor: string,
  ): Promise<BudgetReservation | null>;

  /** Transición atómica ACTIVE -> CONSUMED sin descontar dos veces el importe. */
  consumeReservation(
    companyId: string,
    invoiceId: string,
    actor: string,
  ): Promise<BudgetReservation | null>;

  /** Snapshot de lectura; no autoritativo para confirmar operaciones. */
  getBudgetSnapshot(companyId: string, period: string): Promise<BudgetSnapshot>;

  /** Reglas corporativas controladas por el servidor. */
  getCompanyRules(companyId: string): Promise<CompanyRules | null>;

  /** Siembra una empresa (solo desarrollo/tests; aislado del entorno productivo). */
  seedCompany(companyId: string, name: string, rules: CompanyRules, period: string): Promise<void>;

  /** Siembra una membresía (solo desarrollo/tests). */
  seedMembership(companyId: string, userEmail: string, role: string): Promise<void>;

  /** Devuelve la membresía activa de un usuario autenticado (por ID estable). */
  getActiveMembershipByAuthUser(authUserId: string): Promise<CompanyMembership | null>;

  listInvoices(companyId: string): Promise<InvoiceRecord[]>;
  listReservations(companyId: string): Promise<BudgetReservation[]>;
  listApprovals(companyId: string): Promise<ApprovalRecord[]>;
  listEvents(companyId: string): Promise<FinancialEvent[]>;

  getCompany(companyId: string): Promise<Company | null>;
  getMembership(companyId: string, userEmail: string): Promise<CompanyMembership | null>;
}

/**
 * Mutex asíncrono FIFO para serializar operaciones dentro de un único proceso.
 * NO proporciona garantías entre múltiples instancias (eso lo resuelve PostgreSQL).
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
