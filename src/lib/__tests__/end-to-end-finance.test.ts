import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../auth/session";
import type { SessionUser } from "../auth/roles";
import { setTransactionalLedger } from "../finance/factory";
import { InMemoryTransactionalLedger } from "../finance/in-memory-ledger";
import type { CompanyRules } from "../schemas";
import { POST as reservePost } from "@/app/api/finance/reserve/route";
import { GET as invoicesGet } from "@/app/api/finance/invoices/route";
import { GET as budgetGet } from "@/app/api/finance/budget/route";
import { POST as approvalsPost } from "@/app/api/finance/approvals/route";

/**
 * Prompt 06 — Integración end-to-end de la terminal financiera.
 * Ejercita las rutas reales contra un ledger en memoria (aislado).
 */

const RULES: CompanyRules = {
  limite_monto_automatico: 1000,
  presupuesto_mensual_restante: 5000,
  proveedores_permitidos: ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"],
  acuerdos_por_proveedor: { DevCorp: 800, LatamDesign: 2000 },
};

const PERIOD = new Date().toISOString().slice(0, 7);

const CFO: SessionUser = { email: "cfo@jippay.us", role: "CFO_ADMIN", company_id: "jippay-us" };
const CONTROLLER: SessionUser = {
  email: "controller@jippay.us",
  role: "CONTROLLER_APPROVER",
  company_id: "jippay-us",
  name: "Finance Controller",
};
const AUDITOR: SessionUser = { email: "auditor@jippay.us", role: "AUDITOR_VIEWER", company_id: "jippay-us" };

function cookieFor(user: SessionUser): string {
  return `jippay_session=${createSessionToken(user)}`;
}

function jsonRequest(url: string, user: SessionUser | undefined, body: unknown, headers: Record<string, string> = {}): Request {
  const h: Record<string, string> = { "content-type": "application/json", ...headers };
  if (user) h.cookie = cookieFor(user);
  return new Request(`http://localhost${url}`, { method: "POST", headers: h, body: JSON.stringify(body) });
}

function getRequest(url: string, user: SessionUser | undefined): Request {
  const h: Record<string, string> = {};
  if (user) h.cookie = cookieFor(user);
  return new Request(`http://localhost${url}`, { method: "GET", headers: h });
}

const TEXT_PAGAR = "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo";
const TEXT_ESCALAR = "Factura INV-301 de LatamDesign por 1850 USD, vence 2026-12-01, concepto: rediseño";

async function seedLedger(): Promise<InMemoryTransactionalLedger> {
  const ledger = new InMemoryTransactionalLedger();
  await ledger.seedCompany("jippay-us", "Jippay US", RULES, PERIOD);
  await ledger.seedMembership("jippay-us", CFO.email, CFO.role);
  await ledger.seedMembership("jippay-us", CONTROLLER.email, CONTROLLER.role);
  await ledger.seedMembership("jippay-us", AUDITOR.email, AUDITOR.role);
  return ledger;
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

describe("Flujo end-to-end (texto → ledger → lectura → aprobación)", () => {
  it("una factura de texto queda registrada en el ledger y es legible", async () => {
    setTransactionalLedger(await seedLedger());

    const res = await reservePost(jsonRequest("/api/finance/reserve", CFO, { rawText: TEXT_PAGAR }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; decision?: { estado?: string }; flowStatus?: string; result?: { status?: string } };
    expect(json.ok).toBe(true);
    expect(json.decision?.estado).toBe("PAGAR");
    expect(json.flowStatus).toBe("APPROVED_FOR_PAYMENT");
    expect(json.result?.status).toBe("committed");

    const list = await invoicesGet(getRequest("/api/finance/invoices", CFO));
    const listJson = (await list.json()) as { items?: Array<{ invoiceId: string; estado: string }> };
    expect(listJson.items?.some((i) => i.invoiceId === "INV-204" && i.estado === "PAGAR")).toBe(true);
  });

  it("una factura que escala por límite conserva su razón y queda pendiente de revisión", async () => {
    setTransactionalLedger(await seedLedger());

    const res = await reservePost(jsonRequest("/api/finance/reserve", CFO, { rawText: TEXT_ESCALAR }));
    const json = (await res.json()) as { decision?: { regla_disparada?: string }; flowStatus?: string; reservationStatus?: string };
    expect(json.decision?.regla_disparada).toBe("REGLA_3_LIMITE_AUTO");
    expect(json.flowStatus).toBe("PENDING_REVIEW");
    expect(json.reservationStatus).toBe("ACTIVE");
  });

  it("aprobar una excepción cambia el estado a aprobado para pago", async () => {
    const ledger = await seedLedger();
    setTransactionalLedger(ledger);
    await reservePost(jsonRequest("/api/finance/reserve", CFO, { rawText: TEXT_ESCALAR }));

    const approve = await approvalsPost(
      jsonRequest("/api/finance/approvals", CONTROLLER, {
        invoiceId: "INV-301",
        action: "APPROVE",
        justification: "Autorizado por revisión de límite.",
      }),
    );
    expect(approve.status).toBe(200);

    const list = await invoicesGet(getRequest("/api/finance/invoices", CFO));
    const listJson = (await list.json()) as { items?: Array<{ invoiceId: string; flowStatus: string }> };
    expect(listJson.items?.find((i) => i.invoiceId === "INV-301")?.flowStatus).toBe("APPROVED_FOR_PAYMENT");
  });

  it("rechazar una excepción libera la reserva", async () => {
    const ledger = await seedLedger();
    setTransactionalLedger(ledger);
    await reservePost(jsonRequest("/api/finance/reserve", CFO, { rawText: TEXT_ESCALAR }));

    const before = await budgetGet(getRequest("/api/finance/budget", CFO));
    const beforeJson = (await before.json()) as { reservedUsd: string };
    expect(Number(beforeJson.reservedUsd)).toBe(1850);

    const reject = await approvalsPost(
      jsonRequest("/api/finance/approvals", CONTROLLER, {
        invoiceId: "INV-301",
        action: "REJECT",
        justification: "Rechazado por política de gasto.",
      }),
    );
    expect(reject.status).toBe(200);

    const after = await budgetGet(getRequest("/api/finance/budget", CFO));
    const afterJson = (await after.json()) as { reservedUsd: string };
    expect(Number(afterJson.reservedUsd)).toBe(0);
  });

  it("aprobar una factura que solo existe en el cliente -> 404", async () => {
    setTransactionalLedger(await seedLedger());
    const approve = await approvalsPost(
      jsonRequest("/api/finance/approvals", CONTROLLER, {
        invoiceId: "INV-NOT-IN-LEDGER",
        action: "APPROVE",
        justification: "Justificación de prueba válida.",
      }),
    );
    expect(approve.status).toBe(404);
  });
});

describe("Acceso y aislamiento", () => {
  it("anónimo no puede registrar ni consultar", async () => {
    setTransactionalLedger(await seedLedger());
    const reserve = await reservePost(jsonRequest("/api/finance/reserve", undefined, { rawText: TEXT_PAGAR }));
    expect(reserve.status).toBe(401);
    const invoices = await invoicesGet(getRequest("/api/finance/invoices", undefined));
    expect(invoices.status).toBe(401);
  });

  it("AUDITOR_VIEWER puede leer pero no registrar ni aprobar", async () => {
    setTransactionalLedger(await seedLedger());
    const reserve = await reservePost(jsonRequest("/api/finance/reserve", AUDITOR, { rawText: TEXT_PAGAR }));
    expect(reserve.status).toBe(403);
    const invoices = await invoicesGet(getRequest("/api/finance/invoices", AUDITOR));
    expect(invoices.status).toBe(200);
  });

  it("una empresa no ve facturas de otra", async () => {
    const ledger = await seedLedger();
    // Segunda empresa con su propia membresía.
    await ledger.seedCompany("otra-empresa", "Otra", RULES, PERIOD);
    await ledger.seedMembership("otra-empresa", "cfo@other.co", "CFO_ADMIN");
    setTransactionalLedger(ledger);

    await reservePost(jsonRequest("/api/finance/reserve", CFO, { rawText: TEXT_PAGAR }));

    const stranger: SessionUser = { email: "cfo@other.co", role: "CFO_ADMIN", company_id: "otra-empresa" };
    const list = await invoicesGet(getRequest("/api/finance/invoices", stranger));
    const listJson = (await list.json()) as { items?: Array<{ invoiceId: string }> };
    // Solo ve sus propias facturas (ninguna), nunca las de jippay-us.
    expect(listJson.items?.some((i) => i.invoiceId === "INV-204")).toBe(false);
  });
});

describe("Lotes e idempotencia", () => {
  it("un lote devuelve un resultado por elemento", async () => {
    setTransactionalLedger(await seedLedger());
    const res = await reservePost(
      jsonRequest("/api/finance/reserve", CFO, { batch: [TEXT_PAGAR, TEXT_ESCALAR, "hola mundo"] }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { batch?: boolean; results?: Array<{ ok?: boolean }> };
    expect(json.batch).toBe(true);
    expect(json.results).toHaveLength(3);
  });

  it("reintento del lote no duplica facturas ya confirmadas", async () => {
    const ledger = await seedLedger();
    setTransactionalLedger(ledger);
    const body = { batch: [TEXT_PAGAR] };

    await reservePost(jsonRequest("/api/finance/reserve", CFO, body));
    const invoices1 = await ledger.listInvoices("jippay-us");
    expect(invoices1.filter((i) => i.invoiceId === "INV-204")).toHaveLength(1);

    // Reintento: la clave de idempotencia es estable por contenido, así que no duplica.
    await reservePost(jsonRequest("/api/finance/reserve", CFO, body));
    const invoices2 = await ledger.listInvoices("jippay-us");
    expect(invoices2.filter((i) => i.invoiceId === "INV-204")).toHaveLength(1);
  });

  it("facturas dentro de un lote que compiten por presupuesto no sobregiran", async () => {
    const ledger = await seedLedger();
    setTransactionalLedger(ledger);
    // CloudHost no tiene acuerdo previo: 4000 y 1500 escalan por límite y compiten
    // por el presupuesto 5000. Solo una puede reservar; la otra queda bloqueada.
    const bigA = "Factura INV-A1 de CloudHost por 4000 USD, vence 2026-11-15, concepto: infraestructura";
    const bigB = "Factura INV-B1 de CloudHost por 1500 USD, vence 2026-11-16, concepto: infraestructura";
    const res = await reservePost(jsonRequest("/api/finance/reserve", CFO, { batch: [bigA, bigB] }));
    const json = (await res.json()) as {
      results?: Array<{ decision?: { estado?: string; regla_disparada?: string }; reservationStatus?: string | null }>;
    };
    const results = json.results ?? [];
    // Solo una obtiene una reserva activa.
    expect(results.filter((r) => r.reservationStatus === "ACTIVE")).toHaveLength(1);
    // La otra queda bloqueada por presupuesto (FRENAR).
    expect(results.some((r) => r.decision?.estado === "FRENAR")).toBe(true);

    const budget = await budgetGet(getRequest("/api/finance/budget", CFO));
    const budgetJson = (await budget.json()) as {
      availableCents: number;
      reservedCents: number;
      consumedCents: number;
      approvedCents: number;
    };
    expect(budgetJson.availableCents).toBeGreaterThanOrEqual(0);
    expect(budgetJson.reservedCents + budgetJson.consumedCents).toBeLessThanOrEqual(budgetJson.approvedCents);
  });
});
