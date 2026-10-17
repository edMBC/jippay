import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../auth/session";
import type { SessionUser } from "../auth/roles";
import { verifyApprovalAuditHash } from "../finance/approval-audit";
import { setTransactionalLedger } from "../finance/factory";
import { InMemoryTransactionalLedger } from "../finance/in-memory-ledger";
import type { ApprovalRequest, TransactionalLedger } from "../finance/ledger";
import type { CompanyRules } from "../schemas";

/**
 * Prompt 05 — Aprobación humana, excepciones y auditoría financiera.
 *
 * Todas las pruebas usan el ledger en memoria (aislado) y nunca tocan el ledger
 * real `.data/jippay-ledger.json`.
 */

const RULES: CompanyRules = {
  limite_monto_automatico: 1000,
  presupuesto_mensual_restante: 5000,
  proveedores_permitidos: ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"],
  acuerdos_por_proveedor: { DevCorp: 800, LatamDesign: 2000 },
};

const PERIOD = "2026-10";

const CFO: SessionUser = { email: "cfo@jippay.us", role: "CFO_ADMIN", company_id: "jippay-us" };
const CONTROLLER: SessionUser = {
  email: "controller@jippay.us",
  role: "CONTROLLER_APPROVER",
  company_id: "jippay-us",
  name: "Finance Controller",
};
const AUDITOR: SessionUser = { email: "auditor@jippay.us", role: "AUDITOR_VIEWER", company_id: "jippay-us" };

async function seededLedger(): Promise<InMemoryTransactionalLedger> {
  const ledger = new InMemoryTransactionalLedger();
  await ledger.seedCompany("jippay-us", "Jippay US", RULES, PERIOD);
  await ledger.seedMembership("jippay-us", CFO.email, CFO.role);
  await ledger.seedMembership("jippay-us", CONTROLLER.email, CONTROLLER.role);
  await ledger.seedMembership("jippay-us", AUDITOR.email, AUDITOR.role);
  return ledger;
}

/** Crea una factura escalada (reservable) con reserva activa coherente. */
async function commitEscalatedInvoice(
  ledger: TransactionalLedger,
  overrides: Partial<{ regla: string; invoiceId: string; montoUsd: number; creatorEmail: string }> = {},
) {
  const invoiceId = overrides.invoiceId ?? "INV-301";
  const regla = overrides.regla ?? "REGLA_3_LIMITE_AUTO";
  const montoUsd = overrides.montoUsd ?? 1850;
  const result = await ledger.commitInvoice({
    companyId: "jippay-us",
    period: PERIOD,
    invoice: {
      id: invoiceId,
      emisor: "LatamDesign",
      commercialId: `latamdesign|${invoiceId.toLowerCase()}`,
      montoUsd,
      fileHash: `hash-${invoiceId}`,
    },
    decision: { estado: "ESCALAR", regla_disparada: regla, razon: "Supera límite automático" },
    reservationKind: "RESERVE",
    idempotencyKey: `commit-${invoiceId}`,
    requestHash: `req-${invoiceId}`,
    rulesFingerprint: "rules-v1",
    creatorEmail: overrides.creatorEmail ?? CFO.email,
    actor: `${overrides.creatorEmail ?? CFO.email} (CFO_ADMIN)`,
    source: "test",
    moneda: "USD",
    fechaVencimiento: "2026-11-15",
  });
  return { invoiceId, result };
}

function approvalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    companyId: "jippay-us",
    invoiceId: "INV-301",
    action: "APPROVE",
    justification: "Autorizado por revisión de límite.",
    evidenceReferences: [],
    approverEmail: CONTROLLER.email,
    approverRole: CONTROLLER.role,
    approverName: CONTROLLER.name ?? null,
    idempotencyKey: "apr-key-1",
    requestHash: "apr-hash-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SESSION_SECRET", "test-secret-abc-123");
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Elegibilidad de la excepción", () => {
  it("REGLA_3_LIMITE_AUTO es aprobable con reserva activa", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger, { regla: "REGLA_3_LIMITE_AUTO" });
    const result = await ledger.resolveApproval(approvalRequest({ action: "APPROVE" }));
    expect(result.status).toBe("approved");
    if (result.status === "approved") {
      expect(result.record.nextFlowStatus).toBe("APPROVED_FOR_PAYMENT");
      expect(result.reservation?.status).toBe("ACTIVE");
    }
  });

  it("REGLA_ACUERDO_PREVIO es aprobable", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger, { regla: "REGLA_ACUERDO_PREVIO", invoiceId: "INV-208", montoUsd: 950 });
    const result = await ledger.resolveApproval(approvalRequest({ invoiceId: "INV-208", action: "APPROVE" }));
    expect(result.status).toBe("approved");
  });

  it("una factura de calidad insuficiente (confianza < 75) no es aprobable", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger, { regla: "REGLA_CONFIANZA_BAJA", invoiceId: "INV-777" });
    const result = await ledger.resolveApproval(approvalRequest({ invoiceId: "INV-777", action: "APPROVE" }));
    expect(result.status).toBe("not_approvable");
  });

  it("un campo crítico ambiguo no es aprobable", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger, { regla: "REGLA_CAMPO_AMBIGUO", invoiceId: "INV-778" });
    const result = await ledger.resolveApproval(approvalRequest({ invoiceId: "INV-778", action: "APPROVE" }));
    expect(result.status).toBe("not_approvable");
  });

  it("un duplicado confirmado no es aprobable", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger, { regla: "REGLA_0_DUPLICADA", invoiceId: "INV-204" });
    const result = await ledger.resolveApproval(approvalRequest({ invoiceId: "INV-204", action: "APPROVE" }));
    expect(result.status).toBe("not_approvable");
  });

  it("un proveedor no autorizado no es aprobable", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger, { regla: "REGLA_1_PROVEEDOR", invoiceId: "INV-999" });
    const result = await ledger.resolveApproval(approvalRequest({ invoiceId: "INV-999", action: "APPROVE" }));
    expect(result.status).toBe("not_approvable");
  });

  it("presupuesto insuficiente no es aprobable", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger, { regla: "REGLA_2_PRESUPUESTO", invoiceId: "INV-405" });
    const result = await ledger.resolveApproval(approvalRequest({ invoiceId: "INV-405", action: "APPROVE" }));
    expect(result.status).toBe("not_approvable");
  });

  it("una factura sin reserva activa no es aprobable", async () => {
    const ledger = await seededLedger();
    // Factura escalada por límite pero sin reserva (simulamos una reserva inexistente).
    await commitEscalatedInvoice(ledger, { regla: "REGLA_3_LIMITE_AUTO", invoiceId: "INV-302" });
    await ledger.releaseReservation("jippay-us", "INV-302", CFO.email);
    const result = await ledger.resolveApproval(approvalRequest({ invoiceId: "INV-302", action: "APPROVE" }));
    expect(result.status).toBe("not_approvable");
  });
});

describe("Justificación obligatoria", () => {
  it("justificación ausente o corta se rechaza en el endpoint (422)", async () => {
    const { POST } = await import("@/app/api/finance/approvals/route");
    const headers = { "content-type": "application/json", cookie: `jippay_session=${createSessionToken(CONTROLLER)}` };
    const short = await POST(
      new Request("http://localhost/api/finance/approvals", {
        method: "POST",
        headers,
        body: JSON.stringify({ invoiceId: "INV-1", action: "APPROVE", justification: "corta" }),
      }),
    );
    expect(short.status).toBe(422);
  });

  it("justificación compuesta solo por espacios se rechaza", async () => {
    const { POST } = await import("@/app/api/finance/approvals/route");
    const headers = { "content-type": "application/json", cookie: `jippay_session=${createSessionToken(CONTROLLER)}` };
    const res = await POST(
      new Request("http://localhost/api/finance/approvals", {
        method: "POST",
        headers,
        body: JSON.stringify({ invoiceId: "INV-1", action: "APPROVE", justification: "          " }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

describe("Integridad del registro (SHA-256)", () => {
  it("el hash corresponde a la representación canónica del evento", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    const result = await ledger.resolveApproval(approvalRequest({ action: "APPROVE" }));
    expect(result.status).toBe("approved");
    if (result.status === "approved") {
      expect(verifyApprovalAuditHash(result.record)).toBe(true);
    }
  });

  it("una modificación simulada del contenido firmado se detecta", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    const result = await ledger.resolveApproval(approvalRequest({ action: "APPROVE" }));
    expect(result.status).toBe("approved");
    if (result.status === "approved") {
      const tampered = { ...result.record, justification: "Justificación alterada maliciosamente." };
      expect(verifyApprovalAuditHash(tampered)).toBe(false);
    }
  });
});

describe("Reservas y concurrencia", () => {
  it("aprobar no crea una reserva duplicada ni consume/libera la reserva", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    const before = await ledger.listReservations("jippay-us");
    const activeBefore = before.filter((r) => r.invoiceId === "INV-301" && r.status === "ACTIVE");

    await ledger.resolveApproval(approvalRequest({ action: "APPROVE" }));

    const after = await ledger.listReservations("jippay-us");
    const activeAfter = after.filter((r) => r.invoiceId === "INV-301" && r.status === "ACTIVE");
    expect(activeBefore).toHaveLength(1);
    expect(activeAfter).toHaveLength(1);
    expect(activeAfter[0].id).toBe(activeBefore[0].id);

    // La factura queda aprobada para pago, NO pagada ni liquidada.
    const invoice = await ledger.getInvoice("jippay-us", "INV-301");
    expect(invoice?.flowStatus).toBe("APPROVED_FOR_PAYMENT");
    const snapshot = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    expect(snapshot.consumedCents).toBe(0); // no se contabilizó como pagado
    expect(snapshot.reservedCents).toBe(185000);
  });

  it("rechazar libera una reserva activa una sola vez y conserva la traza", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    const result = await ledger.resolveApproval(approvalRequest({ action: "REJECT", justification: "Rechazado por política." }));
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.record.nextFlowStatus).toBe("REJECTED");
      expect(result.reservation?.status).toBe("RELEASED");
    }

    // Un segundo rechazo ya no está pendiente.
    const second = await ledger.resolveApproval(approvalRequest({ action: "REJECT", idempotencyKey: "apr-key-2", requestHash: "apr-hash-2" }));
    expect(second.status).toBe("not_pending");

    const reservations = await ledger.listReservations("jippay-us");
    const released = reservations.filter((r) => r.invoiceId === "INV-301" && r.status === "RELEASED");
    expect(released).toHaveLength(1);
  });

  it("dos aprobaciones simultáneas: una única transición efectiva", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    const [r1, r2] = await Promise.all([
      ledger.resolveApproval(approvalRequest({ idempotencyKey: "k1", requestHash: "h1" })),
      ledger.resolveApproval(approvalRequest({ idempotencyKey: "k2", requestHash: "h2" })),
    ]);
    const approved = [r1, r2].filter((r) => r.status === "approved");
    const notPending = [r1, r2].filter((r) => r.status === "not_pending");
    expect(approved).toHaveLength(1);
    expect(notPending).toHaveLength(1);
    const records = await (ledger as InMemoryTransactionalLedger).listApprovals("jippay-us");
    expect(records).toHaveLength(1);
  });

  it("aprobación y rechazo simultáneos: solo una transición válida", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    const [a, b] = await Promise.all([
      ledger.resolveApproval(approvalRequest({ action: "APPROVE", idempotencyKey: "ka", requestHash: "ha" })),
      ledger.resolveApproval(approvalRequest({ action: "REJECT", justification: "Rechazo concurrente.", idempotencyKey: "kb", requestHash: "hb" })),
    ]);
    const transitions = [a, b].filter((r) => r.status === "approved" || r.status === "rejected");
    expect(transitions).toHaveLength(1);
    const records = await (ledger as InMemoryTransactionalLedger).listApprovals("jippay-us");
    expect(records).toHaveLength(1);
  });

  it("reintento con la misma clave devuelve el resultado original sin efectos adicionales", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    const first = await ledger.resolveApproval(approvalRequest({ action: "APPROVE" }));
    expect(first.status).toBe("approved");

    const replay = await ledger.resolveApproval(approvalRequest({ action: "APPROVE" }));
    expect(replay.status).toBe("idempotency_replay");
    const records = await (ledger as InMemoryTransactionalLedger).listApprovals("jippay-us");
    expect(records).toHaveLength(1);
  });

  it("misma clave con distinto contenido produce conflicto", async () => {
    const ledger = await seededLedger();
    await commitEscalatedInvoice(ledger);
    await ledger.resolveApproval(approvalRequest({ action: "APPROVE", requestHash: "hash-A" }));
    const conflict = await ledger.resolveApproval(approvalRequest({ action: "APPROVE", requestHash: "hash-B" }));
    expect(conflict.status).toBe("idempotency_conflict");
  });
});

describe("Autorización e identidad (endpoint)", () => {
  async function callRoute(user: SessionUser | undefined, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    const h: Record<string, string> = { "content-type": "application/json", ...headers };
    if (user) h.cookie = `jippay_session=${createSessionToken(user)}`;
    const { POST } = await import("@/app/api/finance/approvals/route");
    return POST(new Request("http://localhost/api/finance/approvals", { method: "POST", headers: h, body: JSON.stringify(body) }));
  }

  beforeEach(() => {
    setTransactionalLedger(new InMemoryTransactionalLedger());
  });

  it("anónimo -> 401, auditor -> 403, CFO -> 403 (segregación)", async () => {
    const anon = await callRoute(undefined, { invoiceId: "INV-1", action: "APPROVE", justification: "Justificación válida." });
    expect(anon.status).toBe(401);

    const auditor = await callRoute(AUDITOR, { invoiceId: "INV-1", action: "APPROVE", justification: "Justificación válida." });
    expect(auditor.status).toBe(403);

    // CFO gobierna reglas/presupuesto, no firma excepciones.
    const cfo = await callRoute(CFO, { invoiceId: "INV-1", action: "APPROVE", justification: "Justificación válida." });
    expect(cfo.status).toBe(403);
  });

  it("el nombre del aprobador enviado en el body no sustituye la identidad autenticada", async () => {
    const ledger = new InMemoryTransactionalLedger();
    await ledger.seedCompany("jippay-us", "Jippay US", RULES, PERIOD);
    await ledger.seedMembership("jippay-us", CONTROLLER.email, CONTROLLER.role);
    await commitEscalatedInvoice(ledger, { creatorEmail: CFO.email });
    setTransactionalLedger(ledger);

    const res = await callRoute(CONTROLLER, {
      invoiceId: "INV-301",
      action: "APPROVE",
      justification: "Justificación válida de prueba.",
      approver_name: "Fake Approver",
      approved_by: "attacker@corp.com",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { record?: { approverEmail?: string; approverName?: string | null } };
    expect(json.record?.approverEmail).toBe(CONTROLLER.email);
    // La identidad del firmante proviene de la sesión verificada, nunca del body.
    expect(json.record?.approverName).not.toBe("Fake Approver");
  });

  it("el creador no puede aprobar su propia excepción", async () => {
    const ledger = new InMemoryTransactionalLedger();
    await ledger.seedCompany("jippay-us", "Jippay US", RULES, PERIOD);
    await ledger.seedMembership("jippay-us", CONTROLLER.email, CONTROLLER.role);
    // El creador es el propio controller.
    await commitEscalatedInvoice(ledger, { creatorEmail: CONTROLLER.email });
    setTransactionalLedger(ledger);

    const res = await callRoute(CONTROLLER, {
      invoiceId: "INV-301",
      action: "APPROVE",
      justification: "Intento de autoaprobación.",
    });
    expect(res.status).toBe(403);
  });

  it("factura no encontrada en el ámbito -> 404", async () => {
    const ledger = new InMemoryTransactionalLedger();
    await ledger.seedCompany("jippay-us", "Jippay US", RULES, PERIOD);
    await ledger.seedMembership("jippay-us", CONTROLLER.email, CONTROLLER.role);
    setTransactionalLedger(ledger);

    const res = await callRoute(CONTROLLER, {
      invoiceId: "INV-NOPE",
      action: "APPROVE",
      justification: "Justificación válida.",
    });
    expect(res.status).toBe(404);
  });
});
