import type { SessionUser } from "../auth/roles";
import { evaluateInvoice, isDocumentQualityRule } from "../engine";
import type { AgentDecision, CompanyRules, Invoice } from "../schemas";
import { convertToUsd, normalizeInvoiceId, normalizeText, sha256Hex } from "../security";
import { resolveCompanyContext } from "./company-context";
import type { CommitDecisionSummary, CommitInvoiceResult, TransactionalLedger } from "./ledger";
import { fromCents, type LedgerCapabilities, type ReservationKind } from "./model";

/**
 * Orquestación de la finalización financiera (sección 8).
 *
 * `evaluateInvoice()` permanece determinista y sin efectos secundarios. Este
 * módulo coordina evaluación + transacción:
 *   1. Valida sesión y contexto empresarial.
 *   2. Obtiene las reglas vigentes del servidor.
 *   3. Usa la extracción documental ya validada (no la declarada por el cliente).
 *   4. Evalúa las reglas con el motor determinista.
 *   5. Ejecuta la finalización financiera transaccional (idempotencia, dedup, reserva).
 *   6. Devuelve el resultado realmente confirmado por el ledger.
 */

export type ReservationKindDecision = ReservationKind;

/** Verdict summary shape shared by the engine and the ledger. */
export type VerdictLike = { estado: AgentDecision["estado"]; regla_disparada: string };

/** Determina el efecto financiero a partir del veredicto determinista. */
export function reservationKindFor(decision: VerdictLike): ReservationKind {
  if (decision.estado === "PAGAR") return "CONSUMED";
  if (decision.estado === "ESCALAR") {
    // Escalado por límite automático o discrepancia contractual (datos fiables) puede
    // reservar; el escalado por calidad/ambigüedad NO reserva.
    if (isDocumentQualityRule(decision.regla_disparada)) return "NONE";
    return "RESERVE";
  }
  return "NONE"; // FRENAR no tiene efecto financiero.
}

/**
 * Huella de las reglas y el presupuesto efectivamente aplicados. Se guarda en el
 * resultado confirmado para auditoría, pero NO participa en el match de idempotencia.
 */
export function rulesFingerprintFor(rules: CompanyRules): string {
  return sha256Hex(
    JSON.stringify({
      limite_monto_automatico: rules.limite_monto_automatico,
      presupuesto_mensual_restante: rules.presupuesto_mensual_restante,
      proveedores_permitidos: rules.proveedores_permitidos,
      acuerdos_por_proveedor: rules.acuerdos_por_proveedor ?? {},
    }),
  );
}

/**
 * Hash de CONTENIDO de la petición (empresa + fuente + documento). Es independiente
 * de reglas y presupuesto: un cambio de presupuesto posterior no hace colisionar
 * una repetición de la misma operación.
 */
export function requestContentHash(companyId: string, source: string, content: string): string {
  return sha256Hex(JSON.stringify({ companyId, source, content }));
}

/** Identidad comercial normalizada, solo cuando emisor y número son fiables. */
export function commercialIdFor(invoice: Invoice): string | null {
  const idReliable = invoice.critical_fields?.id_reliable !== false;
  const emisorReliable = invoice.critical_fields?.emisor_reliable !== false;
  if (!idReliable || !emisorReliable) return null;
  const id = normalizeInvoiceId(invoice.id);
  const emisor = normalizeText(invoice.emisor);
  if (!id || !emisor) return null;
  return `${emisor}|${id}`;
}

export interface CommitTransactionInput {
  ledger: TransactionalLedger;
  user: SessionUser | null;
  invoice: Invoice;
  idempotencyKey: string;
  /**
   * Contenido canónico de la petición (p.ej. el `rawText` original). Se usa para
   * derivar el `requestHash` de idempotencia de forma exclusiva (sin reglas ni
   * presupuesto). Un cambio posterior de presupuesto no hace colisionar el reintento.
   */
  requestContent: string;
  source: string;
  period?: string;
  now?: () => Date;
}

export type CommitTransactionOutcome =
  | {
      ok: true;
      demoMode: boolean;
      /** Verdict confirmado (original en un replay; recién evaluado en un commit). */
      decision: CommitDecisionSummary;
      reservationKind: ReservationKind;
      result: CommitInvoiceResult;
      availableCents: number;
      capabilities: LedgerCapabilities;
      /** True si se devolvió el resultado original de una operación ya confirmada. */
      replay: boolean;
    }
  | { ok: false; reason: string; httpStatus: number };

/**
 * Ejecuta la operación transaccional completa. No persiste un `PAGAR` respaldado
 * por una reserva que no pudo confirmarse: el resultado es el del ledger.
 */
export async function commitInvoiceTransaction(
  input: CommitTransactionInput,
): Promise<CommitTransactionOutcome> {
  // 1. Sesión y contexto empresarial.
  const contextResult = resolveCompanyContext(input.user);
  if (!contextResult.ok) {
    return { ok: false, reason: contextResult.reason, httpStatus: 401 };
  }
  const { companyId, userEmail, role } = contextResult.context;

  // 2. Empresa y membresía (autoridad del servidor).
  const company = await input.ledger.getCompany(companyId);
  if (!company) {
    return { ok: false, reason: "Empresa no configurada en el servidor", httpStatus: 403 };
  }
  const membership = await input.ledger.getMembership(companyId, userEmail);
  const production = process.env.NODE_ENV === "production";
  let demoMode = false;
  if (!membership) {
    // Sin membresía verificable: en producción falla seguro; en demo/tests se permite
    // el contexto firmado en la sesión, marcándolo explícitamente como demo.
    if (production) {
      return { ok: false, reason: "El usuario no tiene membresía verificada", httpStatus: 403 };
    }
    demoMode = true;
  }

  // 3. Reglas vigentes del servidor (nunca del cuerpo de la petición).
  const serverRules = await input.ledger.getCompanyRules(companyId);
  if (!serverRules) {
    return { ok: false, reason: "Reglas corporativas no configuradas", httpStatus: 403 };
  }

  const period = input.period ?? defaultPeriod(input.now);
  const snapshot = await input.ledger.getBudgetSnapshot(companyId, period);

  // 4. Idempotencia: hash de contenido (sin reglas ni presupuesto) + lookup previo.
  //    Un reintento de la misma operación devuelve el resultado original sin
  //    reevaluar ni recomprometer fondos; una clave reutilizada con distinto
  //    contenido produce un conflicto explícito.
  const requestHash = requestContentHash(companyId, input.source, input.requestContent);

  const existing = await input.ledger.lookupIdempotency(companyId, input.idempotencyKey);
  if (existing) {
    if (existing.requestHash === requestHash) {
      const result = existing.response;
      const committedDecision: CommitDecisionSummary =
        result.status === "committed"
          ? result.decision
          : { estado: "FRENAR", regla_disparada: "REGLA_IDEMPOTENCIA", razon: "Reintento de una operación previamente no confirmada." };
      return {
        ok: true,
        demoMode,
        decision: committedDecision,
        reservationKind: result.status === "committed" ? reservationKindFor(committedDecision) : "NONE",
        result,
        availableCents: result.status === "committed" ? result.availableCents : snapshot.availableCents,
        capabilities: input.ledger.capabilities,
        replay: true,
      };
    }
    return {
      ok: false,
      reason: "Conflicto de idempotencia: la clave fue reutilizada con contenido distinto",
      httpStatus: 409,
    };
  }

  // 5. Evaluación determinista con el saldo autoritativo del ledger.
  const rulesForEvaluation: CompanyRules = {
    ...serverRules,
    presupuesto_mensual_restante: fromCents(snapshot.availableCents),
  };

  // La deduplicación es responsabilidad transaccional del ledger (hash + identidad
  // comercial); el motor evalúa una factura individual contra las reglas, sin arrays
  // de deduplicación suministrados por el cliente.
  const decision = evaluateInvoice(input.invoice, rulesForEvaluation, [], [], [], input.now);

  // 6. Tipo de efecto financiero y resumen del veredicto.
  const reservationKind = reservationKindFor(decision);
  const summary: CommitDecisionSummary = {
    estado: decision.estado,
    regla_disparada: decision.regla_disparada,
    razon: decision.razon,
  };
  const amountUsd = input.invoice.monto_usd ?? convertToUsd(input.invoice.monto, input.invoice.moneda).monto_usd;

  // 7. Commit atómico.
  const result = await input.ledger.commitInvoice({
    companyId,
    period,
    invoice: {
      id: input.invoice.id,
      emisor: input.invoice.emisor,
      commercialId: commercialIdFor(input.invoice),
      montoUsd: amountUsd,
      fileHash: input.invoice.fileHash ?? null,
    },
    decision: summary,
    reservationKind,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    rulesFingerprint: rulesFingerprintFor(rulesForEvaluation),
    creatorEmail: userEmail,
    actor: `${userEmail} (${role})`,
    source: input.source,
    moneda: input.invoice.moneda,
    fechaVencimiento: input.invoice.fecha_vencimiento,
  });

  const after = await input.ledger.getBudgetSnapshot(companyId, period);

  return {
    ok: true,
    demoMode,
    decision: result.status === "committed" ? result.decision : summary,
    reservationKind,
    result,
    availableCents: after.availableCents,
    capabilities: input.ledger.capabilities,
    replay: false,
  };
}

function defaultPeriod(now?: () => Date): string {
  return (now?.() ?? new Date()).toISOString().slice(0, 7);
}
