import { describe, expect, it } from "vitest";
import { evaluateInvoice } from "../engine";
import { finalizeDeterministicExtraction, deterministicExtract } from "../extractor";
import { getJurisdictionRules } from "../jurisdictions";
import type { CompanyRules, Invoice } from "../schemas";

/**
 * Integración de legislación fiscal por país en el motor determinista.
 * La jurisdicción es un control aditivo: solo escala/escala según la legislación
 * seleccionada y jamás debilita las reglas anteriores.
 */

const BASE_RULES: CompanyRules = {
  limite_monto_automatico: 5000,
  presupuesto_mensual_restante: 50000,
  proveedores_permitidos: ["DevCorp", "LatamDesign"],
  acuerdos_por_proveedor: {},
};

function invoiceFrom(rawText: string): Invoice {
  return finalizeDeterministicExtraction(deterministicExtract(rawText), BASE_RULES);
}

describe("getJurisdictionRules", () => {
  it("devuelve null sin país", () => {
    expect(getJurisdictionRules(undefined)).toBeNull();
  });

  it("devuelve reglas para un país conocido (insensible a mayúsculas)", () => {
    expect(getJurisdictionRules("co")?.nombre).toBe("Colombia");
  });

  it("devuelve null para un país desconocido", () => {
    expect(getJurisdictionRules("XX")).toBeNull();
  });
});

describe("evaluateInvoice con jurisdicción", () => {
  const rawText =
    "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software";

  it("sin país, una factura normal se aprueba sin reglas de jurisdicción", () => {
    const decision = evaluateInvoice(invoiceFrom(rawText), BASE_RULES, [], [], []);
    expect(decision.estado).toBe("PAGAR");
    expect(decision.traza_evaluacion.some((t) => t.startsWith("JURISDICCION"))).toBe(false);
  });

  it("con EE. UU., refleja SOX en la traza y no aplica umbral de retención", () => {
    const decision = evaluateInvoice(invoiceFrom(rawText), { ...BASE_RULES, pais: "US" }, [], [], []);
    expect(decision.estado).toBe("PAGAR");
    expect(decision.traza_evaluacion.some((t) => t.includes("SOX"))).toBe(true);
    expect(decision.traza_evaluacion.some((t) => t.includes("JURISDICCION_REQUISITOS"))).toBe(true);
  });

  it("con Colombia, un monto que supera el umbral de retención se escala", () => {
    const decision = evaluateInvoice(
      invoiceFrom("Factura INV-301 de LatamDesign por 1850 USD, vence 2026-12-01, concepto: rediseño"),
      { ...BASE_RULES, pais: "CO" },
      [],
      [],
      [],
    );
    expect(decision.estado).toBe("ESCALAR");
    expect(decision.regla_disparada).toBe("REGLA_JURISDICCION_RETENCION");
  });

  it("la jurisdicción no debilita el frenado por proveedor no autorizado", () => {
    const decision = evaluateInvoice(
      invoiceFrom("Factura INV-999 de HackerLabs por 300 USD, vence 2026-11-20, concepto: consultoría"),
      { ...BASE_RULES, pais: "CO" },
      [],
      [],
      [],
    );
    // El proveedor no autorizado frena antes que la retención (que es un escalado posterior).
    expect(decision.estado).toBe("FRENAR");
    expect(decision.regla_disparada).toBe("REGLA_1_PROVEEDOR");
  });
});
