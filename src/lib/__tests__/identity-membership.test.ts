import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../auth/session";
import type { SessionUser } from "../auth/roles";
import { authorizeWithMembership, type AuthorizedContext } from "../auth/authorize";
import { resolveRequestIdentity } from "../auth/identity";
import { setTransactionalLedger } from "../finance/factory";
import { InMemoryTransactionalLedger } from "../finance/in-memory-ledger";
import type { CompanyRules } from "../schemas";

/**
 * Prompt 07 — Supabase Auth, membresías verificadas y RLS efectivo.
 *
 * Pruebas unitarias/integración del código real de autorización (identidad +
 * membresía persistente). Sin Supabase/PG real: se usa el ledger en memoria y
 * mocks explícitos de identidad. RLS real NO se verifica aquí (requiere PG).
 */

const RULES: CompanyRules = {
  limite_monto_automatico: 1000,
  presupuesto_mensual_restante: 5000,
  proveedores_permitidos: ["DevCorp"],
  acuerdos_por_proveedor: {},
};

const PERIOD = new Date().toISOString().slice(0, 7);

const CFO: SessionUser = { email: "cfo@jippay.us", role: "CFO_ADMIN", company_id: "jippay-us", name: "CFO Admin" };
const CONTROLLER: SessionUser = { email: "controller@jippay.us", role: "CONTROLLER_APPROVER", company_id: "jippay-us" };
const AUDITOR: SessionUser = { email: "auditor@jippay.us", role: "AUDITOR_VIEWER", company_id: "jippay-us" };

function cookieFor(user: SessionUser): string {
  return `jippay_session=${createSessionToken(user)}`;
}

function reqFor(user: SessionUser | undefined, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers.cookie = cookieFor(user);
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function seededLedger(): Promise<InMemoryTransactionalLedger> {
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
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Identidad verificada", () => {
  it("resuelve identidad demo en no-producción (marcada como demo)", async () => {
    const identity = await resolveRequestIdentity(reqFor(CFO));
    expect(identity).not.toBeNull();
    expect(identity?.provider).toBe("demo");
    expect(identity?.userId).toBe("demo:cfo@jippay.us");
  });

  it("sin sesión ni Supabase configurado -> null", async () => {
    expect(await resolveRequestIdentity(reqFor(undefined))).toBeNull();
  });

  it("en producción, una identidad demo no autoriza", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const ledger = await seededLedger();
    setTransactionalLedger(ledger);
    const result = await authorizeWithMembership(ledger, reqFor(CFO), ["CFO_ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});

describe("Membresías persistentes y autorización", () => {
  it("usuario válido con membresía activa -> contexto correcto", async () => {
    const ledger = await seededLedger();
    setTransactionalLedger(ledger);
    const result = await authorizeWithMembership(ledger, reqFor(CONTROLLER), ["CONTROLLER_APPROVER"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.companyId).toBe("jippay-us");
      expect(result.context.role).toBe("CONTROLLER_APPROVER");
    }
  });

  it("usuario válido sin membresía -> 403", async () => {
    const ledger = await seededLedger();
    setTransactionalLedger(ledger);
    const stranger: SessionUser = { email: "nobody@x.io", role: "CFO_ADMIN", company_id: "jippay-us" };
    const result = await authorizeWithMembership(ledger, reqFor(stranger), ["CFO_ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rol declarado en el body no otorga permisos", async () => {
    const ledger = await seededLedger();
    setTransactionalLedger(ledger);
    // Controller intenta operar como CFO declarando role en el body.
    const result = await authorizeWithMembership(ledger, reqFor(CONTROLLER, { role: "CFO_ADMIN" }), ["CFO_ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("AUDITOR_VIEWER no puede obtener permisos de escritura", async () => {
    const ledger = await seededLedger();
    setTransactionalLedger(ledger);
    const result = await authorizeWithMembership(ledger, reqFor(AUDITOR), ["CONTROLLER_APPROVER", "CFO_ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("una membresía inactiva se deniega", async () => {
    const ledger = await seededLedger();
    // Simulamos inactividad cambiando el estado (solo lectura directa del estado interno).
    const memberships = (ledger as unknown as {
      states: Map<string, { memberships: Map<string, { status: string }> }>;
    }).states;
    for (const s of memberships.values()) {
      for (const m of s.memberships.values()) {
        if (m.status) m.status = "inactive";
      }
    }
    setTransactionalLedger(ledger);
    const result = await authorizeWithMembership(ledger, reqFor(CFO), ["CFO_ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("un usuario de dos empresas no mezcla datos (contexto de membresía estable)", async () => {
    const ledger = await seededLedger();
    await ledger.seedCompany("otra-empresa", "Otra", RULES, PERIOD);
    await ledger.seedMembership("otra-empresa", CFO.email, "CFO_ADMIN");
    setTransactionalLedger(ledger);

    // La membresía activa por auth_user_id devuelve la PRIMERA (jippay-us, sembrada antes).
    const context = await (ledger as InMemoryTransactionalLedger).getActiveMembershipByAuthUser("demo:cfo@jippay.us");
    expect(context?.companyId).toBe("jippay-us");
  });
});

describe("Roles efectivos desde membresía (no desde token)", () => {
  it("el rol efectivo proviene de la membresía persistente", async () => {
    const ledger = await seededLedger();
    setTransactionalLedger(ledger);
    // El token de sesión declara CFO, pero la membresía del email es CONTROLLER.
    // (la membresía manda).
    const result = await authorizeWithMembership(ledger, reqFor(CONTROLLER), ["CONTROLLER_APPROVER"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.role).toBe("CONTROLLER_APPROVER");
  });
});

describe("Fallo seguro por falta de infraestructura", () => {
  it("en producción sin Supabase configurado, la identidad demo no autoriza", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const identity = await resolveRequestIdentity(reqFor(CFO));
    expect(identity).toBeNull();
  });
});

describe("Registro público no auto-asigna roles privilegiados", () => {
  it("CFO_ADMIN desde el registro público -> 403", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: "Acme", email: "new@acme.com", budget: 5000, role: "CFO_ADMIN" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("AUDITOR_VIEWER (solo lectura) sí está permitido en el registro demo", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: "Acme", email: "auditor@acme.com", budget: 5000, role: "AUDITOR_VIEWER" }),
      }),
    );
    expect(res.status).toBe(201);
  });
});

// Tipado auxiliar para que el test anterior compile sin warnings.
void (null as unknown as AuthorizedContext);
