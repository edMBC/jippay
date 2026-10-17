import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt, finalizeDeterministicExtraction } from "../extractor";
import { computeThreeWayMatch, evaluateInvoice } from "../engine";
import { ISO20022_STATUS_MAP, type CriticalFields, type Invoice } from "../schemas";
import {
  canApprove,
  canEditRules,
  createSessionToken,
  getSessionUser,
  parseSessionToken,
  type SessionUser,
} from "../auth/session";

const rules = {
  limite_monto_automatico: 1000,
  presupuesto_mensual_restante: 5000,
  proveedores_permitidos: ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"],
  acuerdos_por_proveedor: { DevCorp: 800, LatamDesign: 2000 },
};

const CONFIDENT_FIELDS: CriticalFields = {
  emisor_reliable: true,
  monto_reliable: true,
  moneda_reliable: true,
  id_reliable: true,
  fecha_reliable: true,
};

const baseInvoice: Invoice = {
  id: "INV-204",
  emisor: "DevCorp",
  monto: 450,
  moneda: "USD",
  fecha_vencimiento: "2026-11-15",
  concepto: "Desarrollo de módulo de pagos",
  confidence_score: 100,
  critical_fields: CONFIDENT_FIELDS,
};

describe("ISO 20022 & 3-Way Match", () => {
  it("mapea PAGAR -> ACCP", () => {
    const decision = evaluateInvoice(baseInvoice, rules, []);
    expect(decision.estado).toBe("PAGAR");
    expect(decision.iso20022_status).toBe(ISO20022_STATUS_MAP.PAGAR);
    expect(decision.iso20022_status).toBe("ACCP");
  });

  it("mapea ESCALAR -> PDNG", () => {
    const decision = evaluateInvoice({ ...baseInvoice, monto: 950 }, rules, []);
    expect(decision.estado).toBe("ESCALAR");
    expect(decision.iso20022_status).toBe("PDNG");
  });

  it("mapea FRENAR -> RJCT", () => {
    const decision = evaluateInvoice(
      { ...baseInvoice, id: "INV-999", emisor: "HackerLabs", monto: 300 },
      rules,
      [],
    );
    expect(decision.estado).toBe("FRENAR");
    expect(decision.iso20022_status).toBe("RJCT");
  });

  it("calcula three_way_match correctamente", () => {
    const match = computeThreeWayMatch(baseInvoice, rules, 450, [], [], []);
    expect(match).toEqual({
      vendor_match: true,
      agreement_match: true,
      budget_liquidity_match: true,
    });

    const badVendor = computeThreeWayMatch(
      { ...baseInvoice, emisor: "HackerLabs" },
      rules,
      450,
      [],
      [],
      [],
    );
    expect(badVendor.vendor_match).toBe(false);

    const overAgreement = computeThreeWayMatch({ ...baseInvoice, monto: 950 }, rules, 950, [], [], []);
    expect(overAgreement.agreement_match).toBe(false);

    const noBudget = computeThreeWayMatch(
      { ...baseInvoice, monto: 6000 },
      rules,
      6000,
      [],
      [],
      [],
    );
    expect(noBudget.budget_liquidity_match).toBe(false);
  });

  it("genera hash determinista sin depender del reloj", () => {
    const a = evaluateInvoice(baseInvoice, rules, [], [], [], () => new Date("2026-01-01T00:00:00Z"));
    const b = evaluateInvoice(baseInvoice, rules, [], [], [], () => new Date("2027-06-15T12:00:00Z"));
    expect(a.hash_auditoria).toBe(b.hash_auditoria);
    expect(a.hash_auditoria).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Context Prompt del Agente (ISO/IEC 42001)", () => {
  it("inyecta reglas dinámicas en el System Prompt", () => {
    const prompt = buildAgentSystemPrompt(rules);
    expect(prompt).toContain("DevCorp");
    expect(prompt).toContain("DevCorp=800");
    expect(prompt).toContain("1000 USD");
    expect(prompt).toContain("5000 USD");
  });

  it("finalizeDeterministicExtraction rellena telemetría y normalización", () => {
    const invoice = finalizeDeterministicExtraction(
      { ...baseInvoice, fecha_vencimiento_inferida: false },
      rules,
    );
    expect(invoice.extraction_engine).toBe("deterministic-fallback");
    expect(invoice.monto_usd).toBe(450);
    expect(invoice.tasa_cambio).toBe(1);
    expect(invoice.confidence_score).toBeGreaterThanOrEqual(0);
    expect(invoice.confidence_score).toBeLessThanOrEqual(100);
    expect(invoice.agent_reasoning).toContain("INV-204");
    expect(invoice.system_prompt_preview).toContain("DevCorp");
  });
});

describe("SOX RBAC (session.ts)", () => {
  const cfo: SessionUser = { email: "cfo@jippay.us", role: "CFO_ADMIN" };
  const controller: SessionUser = { email: "controller@jippay.us", role: "CONTROLLER_APPROVER" };
  const auditor: SessionUser = { email: "auditor@jippay.us", role: "AUDITOR_VIEWER" };

  it("round-trip de token de sesión", () => {
    const token = createSessionToken(cfo);
    const parsed = parseSessionToken(token);
    expect(parsed).toEqual(cfo);
  });

  it("rechaza tokens manipulados", () => {
    const token = createSessionToken(cfo);
    const tampered = `${token.slice(0, -4)}aaaa`;
    expect(parseSessionToken(tampered)).toBeNull();
  });

  it("lee sesión desde cookie header", () => {
    const token = createSessionToken(controller);
    const cookie = `other=1; jippay_session=${token}; foo=bar`;
    const user = getSessionUser(cookie);
    expect(user?.role).toBe("CONTROLLER_APPROVER");
  });

  it("segrega funciones: solo CFO edita reglas", () => {
    expect(canEditRules(cfo)).toBe(true);
    expect(canEditRules(controller)).toBe(false);
    expect(canEditRules(auditor)).toBe(false);
    expect(canEditRules(null)).toBe(false);
  });

  it("CFO y Controller aprueban; auditor no", () => {
    expect(canApprove(cfo)).toBe(true);
    expect(canApprove(controller)).toBe(true);
    expect(canApprove(auditor)).toBe(false);
    expect(canApprove(null)).toBe(false);
  });
});
