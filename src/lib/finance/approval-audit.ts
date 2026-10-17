import { sha256Hex } from "../security";
import type { ApprovalRecord } from "./model";

/**
 * Integridad del registro de aprobación (Sección 10).
 *
 * El hash se calcula en el servidor a partir de una representación canónica y
 * determinista del evento. Cualquier modificación de la justificación, la
 * identidad del firmante, la factura, la acción o el estado cambia el hash.
 *
 * Nota de honestidad: SHA-256 NO proporciona inmutabilidad, identidad del
 * firmante ni una firma digital reconocida legalmente. Proporciona integridad
 * frente a modificaciones accidentales o no autorizadas dentro del sistema.
 */

/** Representación canónica y determinista del evento de aprobación. */
export function canonicalApprovalPayload(record: ApprovalRecord): string {
  return JSON.stringify({
    companyId: record.companyId,
    invoiceId: record.invoiceId,
    action: record.action,
    justification: record.justification,
    evidenceReferences: record.evidenceReferences,
    approverEmail: record.approverEmail,
    approverRole: record.approverRole,
    approverName: record.approverName,
    originalEstado: record.originalEstado,
    originalRegla: record.originalRegla,
    originalRazon: record.originalRazon,
    montoUsd: record.montoUsd,
    moneda: record.moneda,
    reservationId: record.reservationId,
    reservationStatus: record.reservationStatus,
    rulesFingerprint: record.rulesFingerprint,
    idempotencyKey: record.idempotencyKey,
    requestHash: record.requestHash,
    previousFlowStatus: record.previousFlowStatus,
    nextFlowStatus: record.nextFlowStatus,
    previousAuditHash: record.previousAuditHash,
    createdAt: record.createdAt,
  });
}

export function computeApprovalAuditHash(record: ApprovalRecord): string {
  return sha256Hex(canonicalApprovalPayload(record));
}

/** Verifica que el hash almacenado corresponde a la representación canónica. */
export function verifyApprovalAuditHash(record: ApprovalRecord): boolean {
  return record.auditHash === computeApprovalAuditHash(record);
}
