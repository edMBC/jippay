import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Aislamos la persistencia real: los tests de autorización no deben tocar el disco.
vi.mock("@/lib/db/adapters", () => ({
  persistDecision: vi.fn().mockResolvedValue(undefined),
  getAllAdapters: () => [],
  getActiveAdapter: () => ({ readLedger: async () => [], writeLedger: async () => {} }),
  LocalFileDB: class {},
  SupabasePostgresAdapter: class {},
  MemoryEdgeAdapter: class {},
}));

import { persistDecision } from "@/lib/db/adapters";
import { POST as processInvoice } from "@/app/api/process-invoice/route";
import { POST as ingestFile } from "@/app/api/ingest-file/route";
import { POST as erpSync } from "@/app/api/erp-sync/route";
import {
  canIssueSessions,
  createSessionToken,
  parseSessionToken,
} from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/roles";

const TEST_SECRET = "test-secret-abc-123";
const CFO: SessionUser = { email: "cfo@jippay.us", role: "CFO_ADMIN" };
const CONTROLLER: SessionUser = { email: "controller@jippay.us", role: "CONTROLLER_APPROVER" };
const AUDITOR: SessionUser = { email: "auditor@jippay.us", role: "AUDITOR_VIEWER" };

const RULES = {
  limite_monto_automatico: 1000,
  presupuesto_mensual_restante: 5000,
  proveedores_permitidos: ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"],
  acuerdos_por_proveedor: { DevCorp: 800, LatamDesign: 2000 },
};

function cookieFor(user: SessionUser): string {
  return `jippay_session=${createSessionToken(user)}`;
}

function jsonRequest(url: string, user?: SessionUser, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers.cookie = cookieFor(user);
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function txtFileRequest(url: string, user?: SessionUser): Request {
  const headers: Record<string, string> = {};
  if (user) headers.cookie = cookieFor(user);
  const fd = new FormData();
  fd.append("file", new File(["Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo"], "factura.txt"));
  fd.append("rules", JSON.stringify(RULES));
  return new Request(`http://localhost${url}`, { method: "POST", headers, body: fd });
}

const INVOICE_BODY = {
  rawText: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo",
  rules: RULES,
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("SESSION_SECRET", TEST_SECRET);
  vi.stubEnv("NODE_ENV", "test");
  delete process.env.DEEPSEEK_API_KEY;
  vi.mocked(persistDecision).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Autorización server-side de rutas mutables", () => {
  it("petición anónima a process-invoice -> 401", async () => {
    const res = await processInvoice(jsonRequest("/api/process-invoice", undefined, INVOICE_BODY));
    expect(res.status).toBe(401);
  });

  it("petición anónima a ingest-file -> 401", async () => {
    const res = await ingestFile(txtFileRequest("/api/ingest-file"));
    expect(res.status).toBe(401);
  });

  it("petición anónima a erp-sync -> 401", async () => {
    const res = await erpSync(jsonRequest("/api/erp-sync", undefined, { provider: "odoo", rules: RULES }));
    expect(res.status).toBe(401);
  });

  it("cookie manipulada -> 401", async () => {
    const tampered = `${cookieFor(CFO)}aabbccdd`;
    const req = new Request("http://localhost/api/process-invoice", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: tampered },
      body: JSON.stringify(INVOICE_BODY),
    });
    const res = await processInvoice(req);
    expect(res.status).toBe(401);
  });

  it("sesión expirada -> 401", async () => {
    const expired = createSessionToken(CFO, {
      maxAgeSeconds: 1,
      now: () => new Date("2020-01-01T00:00:00Z"),
    });
    const req = new Request("http://localhost/api/process-invoice", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `jippay_session=${expired}` },
      body: JSON.stringify(INVOICE_BODY),
    });
    const res = await processInvoice(req);
    expect(res.status).toBe(401);
  });

  it("AUDITOR_VIEWER -> 403 en las tres rutas", async () => {
    const p = await processInvoice(jsonRequest("/api/process-invoice", AUDITOR, INVOICE_BODY));
    expect(p.status).toBe(403);

    const f = await ingestFile(txtFileRequest("/api/ingest-file", AUDITOR));
    expect(f.status).toBe(403);

    const e = await erpSync(jsonRequest("/api/erp-sync", AUDITOR, { provider: "odoo", rules: RULES }));
    expect(e.status).toBe(403);
  });

  it("CONTROLLER_APPROVER -> 403 en erp-sync", async () => {
    const res = await erpSync(jsonRequest("/api/erp-sync", CONTROLLER, { provider: "odoo", rules: RULES }));
    expect(res.status).toBe(403);
  });

  it("CONTROLLER_APPROVER -> permitido en process-invoice e ingest-file", async () => {
    const p = await processInvoice(jsonRequest("/api/process-invoice", CONTROLLER, INVOICE_BODY));
    expect(p.status).toBe(200);

    const f = await ingestFile(txtFileRequest("/api/ingest-file", CONTROLLER));
    expect(f.status).toBe(200);
  });

  it("CFO_ADMIN -> pasa autorización y obtiene resultado funcional", async () => {
    const p = await processInvoice(jsonRequest("/api/process-invoice", CFO, INVOICE_BODY));
    expect(p.status).toBe(200);
    const pJson = (await p.json()) as { decision?: { estado?: string } };
    expect(pJson.decision?.estado).toBe("PAGAR");

    const f = await ingestFile(txtFileRequest("/api/ingest-file", CFO));
    expect(f.status).toBe(200);

    const e = await erpSync(jsonRequest("/api/erp-sync", CFO, { provider: "odoo", rules: RULES }));
    expect(e.status).toBe(200);
    const eJson = (await e.json()) as { updatedProviders?: number };
    expect(eJson.updatedProviders).toBeGreaterThan(0);
  });

  it("rol falso en el body no otorga permisos -> 403", async () => {
    // El body declara un rol de CFO, pero la cookie autentica a un controller.
    const body = { role: "CFO_ADMIN", provider: "odoo", rules: RULES };
    const res = await erpSync(jsonRequest("/api/erp-sync", CONTROLLER, body));
    expect(res.status).toBe(403);
  });

  it("petición denegada no persiste en el ledger", async () => {
    const res = await erpSync(jsonRequest("/api/erp-sync", AUDITOR, { provider: "odoo", rules: RULES }));
    expect(res.status).toBe(403);
    expect(persistDecision).not.toHaveBeenCalled();
  });

  it("documento no procesable (monto 0) es rechazado por Zod y no persiste", async () => {
    const res = await processInvoice(
      jsonRequest("/api/process-invoice", CFO, { rawText: "hola mundo", rules: RULES }),
    );
    // El esquema rechaza el importe 0 antes de llegar al motor; nunca se autoriza.
    expect(res.status).toBe(422);
    expect(persistDecision).not.toHaveBeenCalled();
  });
});

describe("Secreto de firma y sesiones", () => {
  it("desarrollo/pruebas funciona sin credenciales reales", () => {
    delete process.env.SESSION_SECRET;
    expect(canIssueSessions()).toBe(true);
  });

  it("producción sin secreto seguro no puede emitir sesiones", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SESSION_SECRET;
    expect(canIssueSessions()).toBe(false);
    expect(() => createSessionToken(CFO)).toThrow();
    // Incluso un token firmado con el secreto demo debe rechazarse en producción.
    vi.stubEnv("SESSION_SECRET", "jippay-demo-secret");
    expect(canIssueSessions()).toBe(false);
  });

  it("producción con secreto demo explícito no puede emitir sesiones", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "jippay-demo-secret");
    expect(canIssueSessions()).toBe(false);
    expect(() => createSessionToken(CFO)).toThrow();
  });

  it("producción con secreto seguro sí permite sesiones", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "a-strong-production-secret");
    expect(canIssueSessions()).toBe(true);
    const token = createSessionToken(CFO);
    expect(parseSessionToken(token)?.role).toBe("CFO_ADMIN");
  });
});
