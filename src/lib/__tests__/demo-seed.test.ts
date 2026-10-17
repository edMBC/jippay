import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COMPANY_ID, ensureDemoCompany, isDemoSeedAllowed } from "../finance/demo-seed";
import { InMemoryTransactionalLedger } from "../finance/in-memory-ledger";

/**
 * Siembra demo (Prompt de conexión/seed en Supabase).
 *
 * Verifica la decisión de siembra (`isDemoSeedAllowed`) y que `ensureDemoCompany`
 * sea idempotente y no siembre cuando está desactivada. No requiere PostgreSQL:
 * usa el ledger en memoria.
 */

function envCleanup() {
  vi.unstubAllEnvs();
  delete process.env.ALLOW_DEMO_SEED;
  vi.stubEnv("NODE_ENV", "test");
}

beforeEach(envCleanup);
afterEach(() => vi.unstubAllEnvs());

describe("isDemoSeedAllowed", () => {
  it("permite la siembra en desarrollo por defecto", () => {
    expect(isDemoSeedAllowed()).toBe(true);
  });

  it("desactiva la siembra con ALLOW_DEMO_SEED=false", () => {
    vi.stubEnv("ALLOW_DEMO_SEED", "false");
    expect(isDemoSeedAllowed()).toBe(false);
  });

  it("desactiva la siembra en producción por defecto", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDemoSeedAllowed()).toBe(false);
  });

  it("permite la siembra en producción solo con opt-in explícito ALLOW_DEMO_SEED=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEMO_SEED", "true");
    expect(isDemoSeedAllowed()).toBe(true);
  });
});

describe("ensureDemoCompany", () => {
  it("siembra empresa + membresías demo y es idempotente", async () => {
    const ledger = new InMemoryTransactionalLedger();

    await ensureDemoCompany(ledger);

    const company = await ledger.getCompany(DEMO_COMPANY_ID);
    expect(company).not.toBeNull();
    expect(company?.name).toBe("Jippay US");

    const rules = await ledger.getCompanyRules(DEMO_COMPANY_ID);
    expect(rules).not.toBeNull();

    const cfo = await ledger.getMembership(DEMO_COMPANY_ID, "cfo@jippay.us");
    expect(cfo?.role).toBe("CFO_ADMIN");
    const controller = await ledger.getMembership(DEMO_COMPANY_ID, "controller@jippay.us");
    expect(controller?.role).toBe("CONTROLLER_APPROVER");

    // Idempotente: una segunda llamada no sobrescribe la empresa existente.
    const before = await ledger.getCompany(DEMO_COMPANY_ID);
    await ensureDemoCompany(ledger);
    const after = await ledger.getCompany(DEMO_COMPANY_ID);
    expect(after?.name).toBe(before?.name);
    expect(after?.createdAt).toBe(before?.createdAt);
  });

  it("no siembra cuando ALLOW_DEMO_SEED=false", async () => {
    vi.stubEnv("ALLOW_DEMO_SEED", "false");
    const ledger = new InMemoryTransactionalLedger();

    await ensureDemoCompany(ledger);

    expect(await ledger.getCompany(DEMO_COMPANY_ID)).toBeNull();
  });

  it("no siembra en producción sin opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const ledger = new InMemoryTransactionalLedger();

    await ensureDemoCompany(ledger);

    expect(await ledger.getCompany(DEMO_COMPANY_ID)).toBeNull();
  });
});
