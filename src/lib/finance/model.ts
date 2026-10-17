import { z } from "zod";
import type { CompanyRules } from "../schemas";

/**
 * Modelo de datos financiero transaccional (Regla B — Liquidez y concurrencia atómicas).
 *
 * Una única fuente de verdad financiera por empresa, aislada por `companyId`.
 * Los importes se representan en centavos (enteros) cuando se persisten en
 * PostgreSQL para evitar errores de coma flotante; en memoria se usa el número
 * normalizado a USD con 2 decimales redondeados y, para operaciones comparativas,
 * se convierte a centavos con `toCents`.
 */

/** Redondea a centavos y devuelve el importe como entero de centavos. */
export function toCents(usd: number): number {
  return Math.round(usd * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Identificador de empresa estable; es la frontera de aislamiento de todos los datos. */
export interface Company {
  id: string;
  name: string;
  createdAt: string;
}

export type MembershipStatus = "active" | "inactive";

/**
 * Membresía empresa <-> usuario. Vincula la identidad autenticada real
 * (Supabase Auth `userId`) con una empresa y un rol. La autoridad es el servidor.
 */
export interface CompanyMembership {
  companyId: string;
  userEmail: string;
  /** ID estable del usuario autenticado (Supabase `user.id` o `demo:<email>`). */
  authUserId: string;
  role: string;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
  /** Identidad del administrador que provisionó la membresía (si se conoce). */
  provisionedBy: string | null;
}

/** Presupuesto autoritativo por empresa y periodo. */
export interface BudgetPeriod {
  companyId: string;
  period: string;
  /** Presupuesto aprobado, en centavos USD. */
  approvedCents: number;
  /** Importe consumido/contabilizado, en centavos USD. */
  consumedCents: number;
  version: number;
  updatedAt: string;
}

/**
 * Estados presupuestarios/financieros (semántica inequívoca, sin banco real):
 *
 * - `ACTIVE`    — presupuesto RESERVADO/comprometido para una factura pendiente de
 *                 decisión humana. No es un pago: impide que otras facturas usen
 *                 esos fondos mientras se resuelve la excepción.
 * - `RELEASED`  — la reserva se liberó; recupera disponibilidad y conserva historial.
 * - `CONSUMED`  — importe CONTABILIZADO/comprometido para una factura cuya decisión
 *                 es `PAGAR`. Representa fondos comprometidos para una factura
 *                 aprobada, NO una transferencia enviada ni un pago liquidado.
 *
 * Distinción de conceptos (sin integración bancaria):
 *   1. Decisión de política (veredicto `PAGAR`/`ESCALAR`/`FRENAR` del motor).
 *   2. Factura aprobada para pago (decisión `PAGAR` confirmada transaccionalmente).
 *   3. Presupuesto reservado/comprometido (`ACTIVE`).
 *   4. Importe contabilizado como consumido (`CONSUMED`, aún NO pagado).
 *   5. Instrucción de pago enviada — NO implementada (requiere integración bancaria).
 *   6. Pago efectivamente liquidado — NO implementado; requiere evidencia de liquidación.
 *
 * Este sistema no puede representar una transferencia como "liquidada" sin evidencia
 * de esa liquidación. No se introduce integración bancaria en esta fase.
 */
export type ReservationStatus = "ACTIVE" | "RELEASED" | "CONSUMED";

/**
 * Estado del flujo de aprobación humana (independiente del veredicto del motor):
 *
 * - `PENDING_REVIEW`        — factura escalada, esperando decisión humana.
 * - `APPROVED_FOR_PAYMENT`  — aprobada para pago (por el motor automáticamente o por
 *                             un controller). NO es "pagada" ni "liquidada".
 * - `REJECTED`              — rechazada por un controller autorizado.
 * - `NOT_APPROVABLE`        — bloqueada (FRENAR) o sin flujo de excepción posible.
 */
export type InvoiceFlowStatus =
  | "PENDING_REVIEW"
  | "APPROVED_FOR_PAYMENT"
  | "REJECTED"
  | "NOT_APPROVABLE";

/** Acción humana sobre una excepción escalada. */
export type ApprovalAction = "APPROVE" | "REJECT";

/** Motivos de escalado que admiten excepción autorizable por un controller. */
export const APPROVABLE_EXCEPTION_RULES: ReadonlySet<string> = new Set([
  "REGLA_3_LIMITE_AUTO",
  "REGLA_ACUERDO_PREVIO",
]);

/** Registro de una aprobación/rechazo humano con evidencia de auditoría firmada. */
export interface ApprovalRecord {
  id: string;
  companyId: string;
  invoiceId: string;
  action: ApprovalAction;
  justification: string;
  evidenceReferences: string[];
  approverEmail: string;
  approverRole: string;
  approverName: string | null;
  /** Veredicto original del motor (no se sobrescribe). */
  originalEstado: string;
  originalRegla: string;
  originalRazon: string;
  montoUsd: number;
  moneda: string;
  reservationId: string | null;
  reservationStatus: ReservationStatus | null;
  rulesFingerprint: string;
  idempotencyKey: string;
  /** Hash del contenido de la solicitud (para detectar conflictos de clave). */
  requestHash: string;
  previousFlowStatus: InvoiceFlowStatus;
  nextFlowStatus: InvoiceFlowStatus;
  auditHash: string;
  previousAuditHash: string | null;
  createdAt: string;
}

/** Reserva presupuestaria: una factura, un importe, un estado y su trazabilidad. */
export interface BudgetReservation {
  id: string;
  companyId: string;
  invoiceId: string;
  period: string;
  amountCents: number;
  status: ReservationStatus;
  reason: string;
  actor: string;
  createdAt: string;
  updatedAt: string;
}

/** Factura registrada dentro del ámbito de su empresa. */
export interface InvoiceRecord {
  companyId: string;
  invoiceId: string;
  /** Identidad comercial normalizada (emisor + número) para deduplicar. */
  commercialId: string;
  emisor: string;
  montoUsd: number;
  moneda: string;
  fechaVencimiento: string;
  fileHash: string | null;
  source: string;
  /** Veredicto determinista del motor (se conserva, nunca se sobrescribe). */
  estado: string;
  reglaDisparada: string;
  /** Razón textual del veredicto del motor. */
  razon: string;
  /** Estado del flujo de aprobación humana. */
  flowStatus: InvoiceFlowStatus;
  /** Identidad (email) del actor que originó la operación, si es confiable. */
  creatorEmail: string | null;
  createdAt: string;
}

/** Registro de idempotencia por empresa y clave. */
export interface IdempotencyRecord {
  companyId: string;
  idempotencyKey: string;
  requestHash: string;
  response: unknown;
  createdAt: string;
}

/** Evento financiero de auditoría, siempre vinculado a empresa y actor. */
export interface FinancialEvent {
  id: string;
  companyId: string;
  type: string;
  invoiceId: string | null;
  actor: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Capacidades reales de un adaptador financiero (nunca se exagera una garantía). */
export interface LedgerCapabilities {
  /** Ofrece commits ACID atómicos. */
  transactional: boolean;
  /** Es seguro frente a múltiples instancias/servidores simultáneos. */
  multiInstanceSafe: boolean;
  persistence: "durable" | "ephemeral" | "memory";
  /** Cumple los requisitos para operaciones financieras reales en producción. */
  productionSafe: boolean;
  description: string;
}

/** Tipo de reserva resultante de la evaluación determinista. */
export type ReservationKind = "CONSUMED" | "RESERVE" | "NONE";

/** Snapshot de lectura (no autoritativo para confirmar; solo para la UI). */
export interface BudgetSnapshot {
  companyId: string;
  period: string;
  approvedCents: number;
  consumedCents: number;
  reservedCents: number;
  availableCents: number;
  activeReservations: BudgetReservation[];
}

export const CompanySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
});

export const BudgetReservationSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  invoiceId: z.string(),
  period: z.string(),
  amountCents: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "RELEASED", "CONSUMED"]),
  reason: z.string(),
  actor: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CompanyRulesServer = CompanyRules;
