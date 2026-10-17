import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../auth/session";
import type { SessionUser } from "../auth/roles";
import { resolveCompanyContext } from "../finance/company-context";
import { setTransactionalLedger } from "../finance/factory";
import { InMemoryTransactionalLedger } from "../finance/in-memory-ledger";
import type { CommitInvoiceRequest, TransactionalLedger } from "../finance/ledger";
import { commercialIdFor, commitInvoiceTransaction, reservationKindFor, requestContentHash, rulesFingerprintFor } from "../finance/orchestrator";
import { evaluateInvoice } from "../engine";
import type { CompanyRules, Invoice } from "../schemas";

/**
 * Prompt 04 — Liquidez atómica, multi-tenancy y deduplicación concurrente.
 *
 * Las pruebas de concurrencia aquí ejecutadas son SIMULADAS en un único proceso
 * (el ledger en memoria serializa con un mutex). NO sustituyen una prueba real de
 * PostgreSQL; esas pruebas están preparadas al final, condicionadas a
 * `TEST_DATABASE_URL`.
 */

const RULES: CompanyRules = {
  limite_monto_automatico: 1000,
  presupuesto_mensual_restante: 5000,
  proveedores_permitidos: ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"],
  acuerdos_por_proveedor: { DevCorp: 800, LatamDesign: 2000 },
};

// Reglas con límite amplio para probar consumo directo (PAGAR) sin escalar por límite.
const HIGH_LIMIT_RULES: CompanyRules = {
  ...RULES,
  limite_monto_automatico: 100000,
};

const PERIOD = "2026-10";

const CFO: SessionUser = {
  email: "cfo@jippay.us",
  role: "CFO_ADMIN",
  company_id: "jippay-us",
};

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "INV-204",
    emisor: "DevCorp",
    monto: 450,
    moneda: "USD",
    fecha_vencimiento: "2026-11-15",
    concepto: "Desarrollo",
    confidence_score: 100,
    critical_fields: {
      emisor_reliable: true,
      monto_reliable: true,
      moneda_reliable: true,
      id_reliable: true,
      fecha_reliable: true,
    },
    monto_usd: 450,
    ...overrides,
  };
}

function buildRequest(overrides: Partial<CommitInvoiceRequest> = {}): CommitInvoiceRequest {
  return {
    companyId: "jippay-us",
    period: PERIOD,
    invoice: {
      id: "INV-204",
      emisor: "DevCorp",
      commercialId: "devcorp|inv-204",
      montoUsd: 450,
      fileHash: "aaa111",
    },
    decision: { estado: "PAGAR", regla_disparada: "APROBACION_AUTOMATICA", razon: "test" },
    reservationKind: "CONSUMED",
    idempotencyKey: "key-1",
    requestHash: "hash-1",
    rulesFingerprint: "rules-v1",
    creatorEmail: "cfo@jippay.us",
    actor: "cfo@jippay.us (CFO_ADMIN)",
    source: "test",
    moneda: "USD",
    fechaVencimiento: "2026-11-15",
    ...overrides,
  };
}

async function seededLedger(rules: CompanyRules = HIGH_LIMIT_RULES): Promise<TransactionalLedger> {
  const ledger = new InMemoryTransactionalLedger();
  await ledger.seedCompany("jippay-us", "Jippay US", rules, PERIOD);
  await ledger.seedMembership("jippay-us", CFO.email, CFO.role);
  return ledger;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "test");
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Regla B — Liquidez atómica", () => {
  it("dos commits concurrentes de 4000 y 1500 nunca comprometen ambos", async () => {
    const ledger = await seededLedger(); // presupuesto 5000
    const a = buildRequest({
      invoice: { id: "INV-A", emisor: "DevCorp", commercialId: "devcorp|inv-a", montoUsd: 4000, fileHash: "hash-a" },
      idempotencyKey: "key-a",
      requestHash: "req-a",
    });
    const b = buildRequest({
      invoice: { id: "INV-B", emisor: "DevCorp", commercialId: "devcorp|inv-b", montoUsd: 1500, fileHash: "hash-b" },
      idempotencyKey: "key-b",
      requestHash: "req-b",
    });

    const [ra, rb] = await Promise.all([ledger.commitInvoice(a), ledger.commitInvoice(b)]);

    const committed = [ra, rb].filter((r) => r.status === "committed");
    const insufficient = [ra, rb].filter((r) => r.status === "insufficient_funds");
    expect(committed).toHaveLength(1);
    expect(insufficient).toHaveLength(1);

    const snapshot = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    // El saldo jamás es negativo y el total comprometido no supera el aprobado.
    expect(snapshot.availableCents).toBeGreaterThanOrEqual(0);
    expect(snapshot.consumedCents).toBeLessThanOrEqual(snapshot.approvedCents);
    expect(snapshot.consumedCents).toBeLessThanOrEqual(snapshot.approvedCents);
  });

  it("dos solicitudes simultáneas para la misma factura dejan una única reserva activa", async () => {
    const ledger = await seededLedger();
    const req = buildRequest({ reservationKind: "RESERVE", decision: { estado: "ESCALAR", regla_disparada: "REGLA_3_LIMITE_AUTO", razon: "test" } });

    const [r1, r2] = await Promise.all([
      ledger.commitInvoice(req),
      ledger.commitInvoice({ ...req, idempotencyKey: "key-2", requestHash: "req-2" }),
    ]);

    // Una de las dos es duplicada (misma identidad comercial); la otra es la reserva.
    const reservations = await ledger.listReservations("jippay-us");
    const active = reservations.filter((r) => r.status === "ACTIVE" && r.invoiceId === "INV-204");
    expect(active).toHaveLength(1);
    expect([r1.status, r2.status].sort()).toEqual(["committed", "duplicate"]);
  });

  it("liberar una reserva recupera saldo sin borrar la traza", async () => {
    const ledger = await seededLedger();
    const req = buildRequest({ reservationKind: "RESERVE", decision: { estado: "ESCALAR", regla_disparada: "REGLA_3_LIMITE_AUTO", razon: "test" } });
    await ledger.commitInvoice(req);

    const before = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    expect(before.reservedCents).toBe(45000);

    const released = await ledger.releaseReservation("jippay-us", "INV-204", "cfo@jippay.us");
    expect(released?.status).toBe("RELEASED");

    const after = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    expect(after.reservedCents).toBe(0);
    expect(after.availableCents).toBe(before.availableCents + 45000);

    // La traza se conserva.
    const reservations = await ledger.listReservations("jippay-us");
    expect(reservations.some((r) => r.status === "RELEASED")).toBe(true);
  });

  it("consumir una reserva no descuenta dos veces el importe", async () => {
    const ledger = await seededLedger();
    const req = buildRequest({ reservationKind: "RESERVE", decision: { estado: "ESCALAR", regla_disparada: "REGLA_3_LIMITE_AUTO", razon: "test" } });
    await ledger.commitInvoice(req);

    const before = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    const consumed = await ledger.consumeReservation("jippay-us", "INV-204", "cfo@jippay.us");
    expect(consumed?.status).toBe("CONSUMED");

    const after = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    // La reserva activa desaparece y el importe se contabiliza una única vez.
    expect(after.reservedCents).toBe(0);
    expect(after.consumedCents).toBe(before.consumedCents + 45000);
    // El disponible neto no cambia (antes: 500000 - 45000 reservado; después: 500000 - 45000 consumido).
    expect(after.availableCents).toBe(before.availableCents);
  });

  it("una operación fallida (fondos insuficientes) no deja reserva huérfana", async () => {
    const ledger = await seededLedger();
    const big = buildRequest({
      invoice: { id: "INV-X", emisor: "DevCorp", commercialId: "devcorp|inv-x", montoUsd: 6000, fileHash: "hash-x" },
      idempotencyKey: "key-x",
      requestHash: "req-x",
    });
    const result = await ledger.commitInvoice(big);
    expect(result.status).toBe("insufficient_funds");

    const reservations = await ledger.listReservations("jippay-us");
    expect(reservations.filter((r) => r.status === "ACTIVE")).toHaveLength(0);
    const invoices = await ledger.listInvoices("jippay-us");
    expect(invoices.filter((i) => i.invoiceId === "INV-X")).toHaveLength(0);
  });
});

describe("Reservas para facturas escaladas", () => {
  it("escalada por límite con datos fiables reserva una vez", async () => {
    const ledger = await seededLedger(RULES); // límite 1000
    const invoice = baseInvoice({ id: "INV-301", emisor: "LatamDesign", monto: 1850, monto_usd: 1850 });
    const decision = evaluateInvoice(invoice, RULES, []);
    expect(decision.estado).toBe("ESCALAR");
    expect(reservationKindFor(decision)).toBe("RESERVE");

    const outcome = await commitInvoiceTransaction({
      ledger,
      user: CFO,
      invoice,
      idempotencyKey: "k-escalado",
      requestContent: "factura 1850 LatamDesign",
      source: "test",
      period: PERIOD,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.reservationKind).toBe("RESERVE");
      expect(outcome.result.status).toBe("committed");
    }
    const active = (await ledger.listReservations("jippay-us")).filter((r) => r.status === "ACTIVE");
    expect(active).toHaveLength(1);
    expect(active[0].invoiceId).toBe("INV-301");
  });

  it("escalada por calidad no crea reserva definitiva", async () => {
    const ledger = await seededLedger(RULES);
    const invoice = baseInvoice({
      id: "INV-204",
      confidence_score: 40,
      critical_fields: {
        emisor_reliable: true,
        monto_reliable: false,
        moneda_reliable: true,
        id_reliable: true,
        fecha_reliable: true,
      },
    });
    const decision = evaluateInvoice(invoice, RULES, []);
    expect(decision.estado).toBe("ESCALAR");
    expect(reservationKindFor(decision)).toBe("NONE");

    const outcome = await commitInvoiceTransaction({
      ledger,
      user: CFO,
      invoice,
      idempotencyKey: "k-calidad",
      requestContent: "factura calidad baja",
      source: "test",
      period: PERIOD,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reservationKind).toBe("NONE");

    const reservations = await ledger.listReservations("jippay-us");
    expect(reservations.filter((r) => r.status === "ACTIVE")).toHaveLength(0);
  });
});

describe("Idempotencia y deduplicación", () => {
  it("misma clave + mismo contenido devuelve el resultado anterior sin nueva reserva", async () => {
    const ledger = await seededLedger();
    const req = buildRequest({ idempotencyKey: "same-key", requestHash: "same-hash" });
    const first = await ledger.commitInvoice(req);
    expect(first.status).toBe("committed");

    const replay = await ledger.commitInvoice(req);
    expect(replay.status).toBe("idempotency_replay");
    const consumed = (await ledger.getBudgetSnapshot("jippay-us", PERIOD)).consumedCents;
    expect(consumed).toBe(45000); // una única vez
  });

  it("misma clave con contenido distinto produce conflicto explícito", async () => {
    const ledger = await seededLedger();
    await ledger.commitInvoice(buildRequest({ idempotencyKey: "k", requestHash: "h1" }));
    const conflict = await ledger.commitInvoice(buildRequest({ idempotencyKey: "k", requestHash: "h2" }));
    expect(conflict.status).toBe("idempotency_conflict");
  });

  it("hash de archivo duplicado se bloquea sin doble reserva", async () => {
    const ledger = await seededLedger();
    const first = buildRequest({
      invoice: { id: "INV-1", emisor: "DevCorp", commercialId: "devcorp|inv-1", montoUsd: 450, fileHash: "same-hash" },
    });
    await ledger.commitInvoice(first);

    // Mismo hash binario, distinta identidad comercial -> dedup por hash.
    const second = await ledger.commitInvoice(
      buildRequest({
        invoice: { id: "INV-2", emisor: "DevCorp", commercialId: "devcorp|inv-2", montoUsd: 450, fileHash: "same-hash" },
        idempotencyKey: "k2",
        requestHash: "h2",
      }),
    );
    expect(second.status).toBe("duplicate");
    expect((second as { reason: string }).reason).toBe("hash");
    const reservations = await ledger.listReservations("jippay-us");
    expect(reservations.filter((r) => r.status === "ACTIVE" || r.status === "CONSUMED")).toHaveLength(1);
  });

  it("identidad comercial duplicada se bloquea", async () => {
    const ledger = await seededLedger();
    await ledger.commitInvoice(buildRequest());
    const second = await ledger.commitInvoice(
      buildRequest({
        invoice: { id: "INV-204", emisor: "DevCorp", commercialId: "devcorp|inv-204", montoUsd: 450, fileHash: "different-hash" },
        idempotencyKey: "k3",
        requestHash: "h3",
      }),
    );
    expect(second.status).toBe("duplicate");
    expect((second as { reason: string }).reason).toBe("commercial_id");
  });

  it("dos facturas legítimas con huella compuesta coincidente NO se rechazan por coincidencia", async () => {
    const ledger = await seededLedger();
    // Mismo emisor + monto + fecha, pero distinta identidad comercial y distinto hash.
    const a = buildRequest({
      invoice: { id: "INV-1", emisor: "DevCorp", commercialId: "devcorp|inv-1", montoUsd: 450, fileHash: "h1" },
      idempotencyKey: "k1",
      requestHash: "r1",
    });
    const b = buildRequest({
      invoice: { id: "INV-2", emisor: "DevCorp", commercialId: "devcorp|inv-2", montoUsd: 450, fileHash: "h2" },
      idempotencyKey: "k2",
      requestHash: "r2",
    });
    const [ra, rb] = await Promise.all([ledger.commitInvoice(a), ledger.commitInvoice(b)]);
    expect(ra.status).toBe("committed");
    expect(rb.status).toBe("committed");
  });

  it("doble confirmación no produce doble compromiso presupuestario", async () => {
    const ledger = await seededLedger();
    const req = buildRequest();
    await ledger.commitInvoice(req);
    await ledger.commitInvoice(req); // mismo idempotencyKey + requestHash -> replay
    const snapshot = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    expect(snapshot.consumedCents).toBe(45000);
  });
});

describe("Multi-tenancy y aislamiento", () => {
  it("una empresa no lee facturas, presupuesto ni reglas de otra", async () => {
    const ledger = new InMemoryTransactionalLedger();
    await ledger.seedCompany("jippay-us", "Jippay US", HIGH_LIMIT_RULES, PERIOD);
    await ledger.seedCompany("otra-empresa", "Otra", HIGH_LIMIT_RULES, PERIOD);
    await ledger.commitInvoice(buildRequest());

    const otherInvoices = await ledger.listInvoices("otra-empresa");
    expect(otherInvoices).toHaveLength(0);
    const otherRules = await ledger.getCompanyRules("otra-empresa");
    expect(otherRules?.presupuesto_mensual_restante).toBe(HIGH_LIMIT_RULES.presupuesto_mensual_restante);
  });

  it("la empresa se obtiene de la sesión, nunca de un company_id del cuerpo", () => {
    const ok = resolveCompanyContext(CFO);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.context.companyId).toBe("jippay-us");

    // Sin company_id en la sesión -> falla seguro.
    const noCompany: SessionUser = { email: "x@y.z", role: "CFO_ADMIN" };
    expect(resolveCompanyContext(noCompany).ok).toBe(false);
  });

  it("los hashes y claves de una empresa no colisionan con otra", async () => {
    const ledger = new InMemoryTransactionalLedger();
    await ledger.seedCompany("jippay-us", "Jippay US", HIGH_LIMIT_RULES, PERIOD);
    await ledger.seedCompany("otra-empresa", "Otra", HIGH_LIMIT_RULES, PERIOD);
    // Mismo hash y misma identidad comercial en empresas distintas: ambas deben comprometerse.
    const reqA = buildRequest({
      companyId: "jippay-us",
      idempotencyKey: "k",
      requestHash: "r",
      invoice: { id: "INV-1", emisor: "DevCorp", commercialId: "devcorp|inv-1", montoUsd: 450, fileHash: "shared-hash" },
    });
    const reqB = buildRequest({
      companyId: "otra-empresa",
      idempotencyKey: "k",
      requestHash: "r",
      invoice: { id: "INV-1", emisor: "DevCorp", commercialId: "devcorp|inv-1", montoUsd: 450, fileHash: "shared-hash" },
    });
    const [ra, rb] = await Promise.all([ledger.commitInvoice(reqA), ledger.commitInvoice(reqB)]);
    expect(ra.status).toBe("committed");
    expect(rb.status).toBe("committed");
  });

  it("en producción, sin membresía verificada la operación falla seguro", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const ledger = await seededLedger(HIGH_LIMIT_RULES);
    // Usuario con company_id pero sin membresía en el ledger.
    const stranger: SessionUser = { email: "unknown@corp.com", role: "CFO_ADMIN", company_id: "jippay-us" };
    const outcome = await commitInvoiceTransaction({
      ledger,
      user: stranger,
      invoice: baseInvoice(),
      idempotencyKey: "k",
      requestContent: "factura test",
      source: "test",
      period: PERIOD,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.httpStatus).toBe(403);
  });
});

describe("Orquestador: reglas del servidor y confianza", () => {
  it("PAGAR consume presupuesto", async () => {
    const ledger = await seededLedger(HIGH_LIMIT_RULES);
    const outcome = await commitInvoiceTransaction({
      ledger,
      user: CFO,
      invoice: baseInvoice({ monto: 450, monto_usd: 450 }),
      idempotencyKey: "k",
      requestContent: "factura 450",
      source: "test",
      period: PERIOD,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.decision.estado).toBe("PAGAR");
      expect(outcome.reservationKind).toBe("CONSUMED");
    }
    const snapshot = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    expect(snapshot.consumedCents).toBe(45000);
  });

  it("usa las reglas del servidor, no un objeto rules arbitrario", async () => {
    // El orquestador solo recibe `invoice`, no `rules`: las carga del ledger.
    const ledger = await seededLedger(HIGH_LIMIT_RULES);
    const outcome = await commitInvoiceTransaction({
      ledger,
      user: CFO,
      invoice: baseInvoice({ monto: 200, monto_usd: 200 }),
      idempotencyKey: "k",
      requestContent: "factura 200",
      source: "test",
      period: PERIOD,
    });
    expect(outcome.ok).toBe(true);
    // Con límite 100000 el PAGAR se autoriza; si se hubiera usado el límite 1000 se escalaría.
    if (outcome.ok) expect(outcome.decision.estado).toBe("PAGAR");
  });

  it("commercialIdFor solo devuelve identidad cuando emisor y número son fiables", () => {
    expect(commercialIdFor(baseInvoice())).toBe("devcorp|INV-204");
    expect(
      commercialIdFor(
        baseInvoice({
          critical_fields: {
            emisor_reliable: true,
            monto_reliable: true,
            moneda_reliable: true,
            id_reliable: false,
            fecha_reliable: true,
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("Endpoint /api/finance/reserve", () => {
  async function callRoute(user: SessionUser | undefined, body: unknown): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (user) headers.cookie = `jippay_session=${createSessionToken(user)}`;
    const { POST } = await import("@/app/api/finance/reserve/route");
    return POST(new Request("http://localhost/api/finance/reserve", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }));
  }

  beforeEach(() => {
    setTransactionalLedger(new InMemoryTransactionalLedger());
  });

  it("anónimo -> 401 y auditor -> 403", async () => {
    const anon = await callRoute(undefined, { rawText: "Factura INV-204 DevCorp 450 USD" });
    expect(anon.status).toBe(401);
    const auditor: SessionUser = { email: "auditor@jippay.us", role: "AUDITOR_VIEWER", company_id: "jippay-us" };
    const aud = await callRoute(auditor, { rawText: "Factura INV-204 DevCorp 450 USD" });
    expect(aud.status).toBe(403);
  });

  it("CFO obtiene resultado transaccional funcional", async () => {
    const res = await callRoute(CFO, { rawText: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { decision?: { estado?: string }; result?: { status?: string }; capabilities?: { productionSafe?: boolean } };
    expect(json.decision?.estado).toBe("PAGAR");
    expect(json.result?.status).toBe("committed");
    expect(json.capabilities?.productionSafe).toBe(false); // demo en memoria
  });

  it("la confianza no puede ser inyectada por el cliente", async () => {
    // El body intenta declarar una confianza alta; la ruta re-extrae en el servidor.
    const res = await callRoute(CFO, {
      rawText: "hola mundo",
      confidence_score: 100,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { decision?: { estado?: string }; result?: { status?: string } };
    // Documento sin información -> escalado por calidad, sin reserva.
    expect(json.decision?.estado).toBe("ESCALAR");
    expect(json.result?.status).toBe("committed");
  });

  it("en producción sin persistencia transaccional -> 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "test-secret-abc-123");
    setTransactionalLedger(new InMemoryTransactionalLedger()); // productionSafe: false
    const res = await callRoute(CFO, { rawText: "Factura INV-204 DevCorp 450 USD" });
    expect(res.status).toBe(503);
  });
});

describe("Prompt 04.1 — Idempotencia, estados y capacidades", () => {
  it("requestContentHash es independiente de las reglas y del presupuesto", () => {
    const content = "Factura INV-204 DevCorp 450 USD";
    const h1 = requestContentHash("jippay-us", "finance-reserve", content);
    const h2 = requestContentHash("jippay-us", "finance-reserve", content);
    expect(h1).toBe(h2);

    // El hash de reglas cambia con el presupuesto; el hash de contenido no.
    const rulesA = rulesFingerprintFor(RULES);
    const rulesB = rulesFingerprintFor({ ...RULES, presupuesto_mensual_restante: 1 });
    expect(rulesA).not.toBe(rulesB);
  });

  it("reintento de una operación confirmada devuelve el resultado original (replay, sin recomprometer)", async () => {
    const ledger = await seededLedger(HIGH_LIMIT_RULES);
    const input = {
      ledger,
      user: CFO,
      invoice: baseInvoice({ monto: 450, monto_usd: 450 }),
      idempotencyKey: "k-replay",
      requestContent: "Factura INV-204 DevCorp 450 USD",
      source: "test",
      period: PERIOD,
    };
    const first = await commitInvoiceTransaction(input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.replay).toBe(false);
    expect(first.result.status).toBe("committed");
    if (first.result.status === "committed") {
      expect(first.result.rulesFingerprint).toBeTruthy();
    }

    // Reintento con el mismo contenido: devuelve el original sin nuevo commit.
    const replay = await commitInvoiceTransaction(input);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replay).toBe(true);
    expect(replay.result.status).toBe("committed");
    if (replay.result.status === "committed") {
      expect(replay.result.decision.estado).toBe("PAGAR");
      expect(replay.result.rulesFingerprint).toBe(
        (first.result as { rulesFingerprint?: string }).rulesFingerprint,
      );
    }

    const snapshot = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    expect(snapshot.consumedCents).toBe(45000); // una única vez
  });

  it("clave reutilizada con contenido distinto produce conflicto explícito (409)", async () => {
    const ledger = await seededLedger(HIGH_LIMIT_RULES);
    const base = {
      ledger,
      user: CFO,
      invoice: baseInvoice({ monto: 450, monto_usd: 450 }),
      idempotencyKey: "k-conflict",
      source: "test",
      period: PERIOD,
    };
    const first = await commitInvoiceTransaction({ ...base, requestContent: "contenido A" });
    expect(first.ok).toBe(true);

    const conflict = await commitInvoiceTransaction({ ...base, requestContent: "contenido B" });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.httpStatus).toBe(409);
  });

  it("una reserva liberada recupera disponibilidad y una consumida no descuenta dos veces", async () => {
    const ledger = await seededLedger();
    const req = buildRequest({
      reservationKind: "RESERVE",
      decision: { estado: "ESCALAR", regla_disparada: "REGLA_3_LIMITE_AUTO", razon: "test" },
    });
    await ledger.commitInvoice(req);

    // Release recupera saldo.
    const beforeRelease = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    await ledger.releaseReservation("jippay-us", "INV-204", "cfo@jippay.us");
    const afterRelease = await ledger.getBudgetSnapshot("jippay-us", PERIOD);
    expect(afterRelease.availableCents).toBe(beforeRelease.availableCents + 45000);
    expect(afterRelease.reservedCents).toBe(0);

    // Una reserva RELEASED no se puede volver a consumir.
    const consumedAgain = await ledger.consumeReservation("jippay-us", "INV-204", "cfo@jippay.us");
    expect(consumedAgain).toBeNull();
  });

  it("una operación fallida por fondos insuficientes no deja factura ni reserva huérfana", async () => {
    const ledger = await seededLedger();
    const big = buildRequest({
      invoice: { id: "INV-X", emisor: "DevCorp", commercialId: "devcorp|inv-x", montoUsd: 6000, fileHash: "hash-x" },
      idempotencyKey: "key-x",
      requestHash: "req-x",
    });
    const result = await ledger.commitInvoice(big);
    expect(result.status).toBe("insufficient_funds");

    expect((await ledger.listInvoices("jippay-us")).filter((i) => i.invoiceId === "INV-X")).toHaveLength(0);
    expect((await ledger.listReservations("jippay-us")).filter((r) => r.status === "ACTIVE")).toHaveLength(0);
  });

  it("las capacidades reflejan garantías reales: memoria no es productionSafe", async () => {
    const mem = new InMemoryTransactionalLedger();
    expect(mem.capabilities.productionSafe).toBe(false);
    expect(mem.capabilities.multiInstanceSafe).toBe(false);
    const v = await mem.verify();
    expect(v.ok).toBe(true);
    // verify() no convierte un ledger de memoria en productionSafe.
    expect(mem.capabilities.productionSafe).toBe(false);
  });

  it("PostgreSQL no es productionSafe hasta verificar el esquema", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://localhost:1/none");
    const { PostgresTransactionalLedger } = await import("../finance/postgres-ledger");
    const pg = new PostgresTransactionalLedger();
    expect(pg.capabilities.productionSafe).toBe(false);
    const v = await pg.verify();
    // Sin servidor accesible, la verificación falla y productionSafe permanece false.
    expect(v.ok).toBe(false);
    expect(pg.capabilities.productionSafe).toBe(false);
  });

  it("el resultado confirmado conserva la decisión y las reglas aplicadas", async () => {
    const ledger = await seededLedger(HIGH_LIMIT_RULES);
    const outcome = await commitInvoiceTransaction({
      ledger,
      user: CFO,
      invoice: baseInvoice({ monto: 450, monto_usd: 450 }),
      idempotencyKey: "k-apply",
      requestContent: "Factura INV-204 DevCorp 450 USD",
      source: "test",
      period: PERIOD,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok && outcome.result.status === "committed") {
      expect(outcome.result.decision).toMatchObject({ estado: "PAGAR", regla_disparada: "APROBACION_AUTOMATICA" });
      expect(outcome.result.rulesFingerprint).toBeTruthy();
    }
  });
});

describe("PostgreSQL real (solo si TEST_DATABASE_URL está configurado)", () => {
  const skip = !process.env.TEST_DATABASE_URL;
  it.skipIf(skip)("commit atómico contra PostgreSQL real", async () => {
    // Ejecutado únicamente cuando TEST_DATABASE_URL apunta a una base desechable.
    vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
    const { PostgresTransactionalLedger } = await import("../finance/postgres-ledger");
    const ledger = new PostgresTransactionalLedger();
    await ledger.seedCompany("itest-co", "ITest", HIGH_LIMIT_RULES, PERIOD);
    const result = await ledger.commitInvoice(
      buildRequest({ companyId: "itest-co", invoice: { id: "INV-P", emisor: "DevCorp", commercialId: "devcorp|inv-p", montoUsd: 100, fileHash: "pg-hash" } }),
    );
    expect(result.status).toBe("committed");
  });
});
