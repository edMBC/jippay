import type { AgentDecision, CompanyRules, Invoice, ThreeWayMatch } from "./schemas";
import { ISO20022_STATUS_MAP } from "./schemas";
import {
  compositeFingerprint,
  convertToUsd,
  detectPromptInjection,
  detectVendorSpoofing,
  normalizeInvoiceId,
  normalizeText,
  sha256Hex,
} from "./security";

/**
 * Triple Cruce Contable (3-Way Match): proveedor, acuerdo y liquidez.
 * Independiente del orden de reglas y testeable de forma aislada.
 */
export function computeThreeWayMatch(
  invoice: Invoice,
  rules: CompanyRules,
  montoUsd: number,
  processedIds: string[],
  processedFingerprints: string[],
  processedFileHashes: string[],
): ThreeWayMatch {
  const emisorNormalizado = normalizeText(invoice.emisor);
  const proveedores = (rules.proveedores_permitidos ?? []).map(normalizeText);
  const vendorMatch = proveedores.includes(emisorNormalizado);

  const acuerdoExplicito = invoice.monto_acordado;
  const acuerdoPorProveedor = rules.acuerdos_por_proveedor?.[invoice.emisor];
  const montoAcordado =
    acuerdoExplicito != null
      ? acuerdoExplicito
      : acuerdoPorProveedor != null
        ? acuerdoPorProveedor
        : undefined;
  const agreementMatch = montoAcordado == null || montoUsd <= montoAcordado;

  const idNormalizado = normalizeInvoiceId(invoice.id);
  const fingerprint = compositeFingerprint(invoice.emisor, montoUsd, invoice.fecha_vencimiento);
  const fileHash = (invoice.fileHash ?? "").trim().toLowerCase();
  const duplicadoPorId = processedIds.some(
    (id) => normalizeInvoiceId(id) === idNormalizado,
  );
  const duplicadoPorHash =
    fileHash.length > 0 &&
    processedFileHashes.some((h) => h.trim().toLowerCase() === fileHash);
  const duplicadoPorHuella = processedFingerprints.some(
    (fp) => normalizeText(fp) === normalizeText(fingerprint),
  );
  const esDuplicado = duplicadoPorId || duplicadoPorHash || duplicadoPorHuella;

  const budgetLiquidityMatch =
    !esDuplicado && montoUsd <= rules.presupuesto_mensual_restante;

  return {
    vendor_match: vendorMatch,
    agreement_match: agreementMatch,
    budget_liquidity_match: budgetLiquidityMatch,
  };
}

/**
 * Motor determinista de auditoría: cero IA, cero aleatoriedad.
 * Evalúa las reglas de negocio en orden estricto e inflexible:
 *   0. Alerta de seguridad / prompt injection / monto inválido  -> FRENAR
 *   1. Cobro duplicado (ID, hash de archivo o huella compuesta) -> FRENAR
 *   2. Proveedor no autorizado o spoofing                       -> FRENAR
 *   3. Presupuesto insuficiente                                 -> FRENAR
 *   4. Discrepancia con acuerdo en ERP                          -> ESCALAR
 *   5. Supera límite de aprobación automática                   -> ESCALAR
 *   6. Cumplimiento total                                       -> PAGAR
 */
export function evaluateInvoice(
  invoice: Invoice,
  rules: CompanyRules,
  processedIds: string[],
  processedFingerprints: string[] = [],
  processedFileHashes: string[] = [],
  now: () => Date = () => new Date(),
): AgentDecision {
  const traza: string[] = [];
  const timestamp = now().toISOString();

  const build = (
    estado: AgentDecision["estado"],
    regla: string,
    razon: string,
  ): AgentDecision => {
    // ISO 20022: mapa de veredicto interno a código bancario internacional.
    const iso20022_status = ISO20022_STATUS_MAP[estado];
    const three_way_match = computeThreeWayMatch(
      invoice,
      rules,
      montoUsd,
      processedIds,
      processedFingerprints,
      processedFileHashes,
    );
    // Hash determinista sobre contenido financiero (sin reloj) para verificar integridad.
    const hashPayload = `${invoice.id}|${invoice.emisor}|${montoUsd}|${estado}|${regla}`;
    return {
      invoice_id: invoice.id,
      factura: invoice,
      estado,
      regla_disparada: regla,
      razon,
      traza_evaluacion: traza,
      timestamp,
      iso20022_status,
      three_way_match,
      hash_auditoria: sha256Hex(hashPayload),
    };
  };

  // Conversión multimoneda auditable a USD.
  const conversion = convertToUsd(invoice.monto, invoice.moneda);
  const montoUsd = invoice.monto_usd ?? conversion.monto_usd;
  if (conversion.moneda_original !== "USD") {
    traza.push(`MONEDA: ${conversion.nota}`);
  }

  if (invoice.fecha_vencimiento_inferida === true) {
    traza.push(
      "ADVERTENCIA_FECHA: la factura no incluía fecha de vencimiento; se infirió la fecha de hoy.",
    );
  }

  // Regla 0: seguridad e invariante de monto.
  const montoInvalido = !Number.isFinite(invoice.monto) || invoice.monto <= 0;
  const promptInjection =
    detectPromptInjection(invoice.concepto) || invoice.security_alert === true;
  traza.push(
    `REGLA_0_SEGURIDAD: ${
      montoInvalido
        ? "monto inválido"
        : promptInjection
          ? "alerta de seguridad detectada"
          : "sin alertas"
    }`,
  );
  if (montoInvalido) {
    return build(
      "FRENAR",
      "REGLA_SEGURIDAD_MONTO_INVALIDO",
      `El monto de la factura "${invoice.id}" no es válido (${invoice.monto}). Se frena el pago.`,
    );
  }
  if (promptInjection) {
    return build(
      "FRENAR",
      "REGLA_SEGURIDAD_PROMPT_INJECTION",
      `Se detectó un intento de manipulación (prompt injection) en la factura "${invoice.id}". Se frena el pago por seguridad.`,
    );
  }

  // Regla 1: cobro duplicado (ID, hash de archivo o huella compuesta).
  const idNormalizado = normalizeInvoiceId(invoice.id);
  const fingerprint = compositeFingerprint(invoice.emisor, montoUsd, invoice.fecha_vencimiento);
  const fileHash = (invoice.fileHash ?? "").trim().toLowerCase();

  const duplicadoPorId = processedIds.some(
    (id) => normalizeInvoiceId(id) === idNormalizado,
  );
  const duplicadoPorHash =
    fileHash.length > 0 &&
    processedFileHashes.some((h) => h.trim().toLowerCase() === fileHash);
  const duplicadoPorHuella = processedFingerprints.some(
    (fp) => normalizeText(fp) === normalizeText(fingerprint),
  );

  traza.push(
    `REGLA_1_DUPLICADA: id=${duplicadoPorId ? "SÍ" : "no"}, hash=${duplicadoPorHash ? "SÍ" : "no"}, huella=${duplicadoPorHuella ? "SÍ" : "no"}`,
  );
  if (duplicadoPorId || duplicadoPorHash || duplicadoPorHuella) {
    const motivo = duplicadoPorId
      ? "mismo ID"
      : duplicadoPorHash
        ? "mismo hash de archivo"
        : "misma huella financiera (emisor + monto + fecha)";
    return build(
      "FRENAR",
      "REGLA_0_DUPLICADA",
      `La factura "${invoice.id}" ya fue procesada (${motivo}). Se frena para evitar un cobro duplicado.`,
    );
  }

  // Regla 2: proveedor autorizado + anti-spoofing.
  const emisorNormalizado = normalizeText(invoice.emisor);
  const proveedores = (rules.proveedores_permitidos ?? []).map(normalizeText);
  const proveedorPermitido = proveedores.includes(emisorNormalizado);

  if (!proveedorPermitido) {
    const spoofing = detectVendorSpoofing(invoice.emisor, rules.proveedores_permitidos ?? []);
    if (spoofing.spoofed && spoofing.closest) {
      traza.push(
        `REGLA_2_SPOOFING: "${invoice.emisor}" se parece a "${spoofing.closest}" (distancia ${spoofing.distance})`,
      );
      return build(
        "FRENAR",
        "REGLA_SPOOFING_VENDOR",
        `Alerta de suplantación de proveedor: "${invoice.emisor}" intenta imitar a "${spoofing.closest}" (distancia de Levenshtein ${spoofing.distance}). Se frena el pago.`,
      );
    }
    traza.push(`REGLA_2_PROVEEDOR: "${invoice.emisor}" NO autorizado`);
    return build(
      "FRENAR",
      "REGLA_1_PROVEEDOR",
      `El proveedor "${invoice.emisor}" no está en la lista blanca de proveedores permitidos. Se frena el pago.`,
    );
  }
  traza.push(`REGLA_2_PROVEEDOR: "${invoice.emisor}" autorizado`);

  // Regla 3: presupuesto disponible.
  const presupuestoSuficiente = montoUsd <= rules.presupuesto_mensual_restante;
  traza.push(
    `REGLA_3_PRESUPUESTO: $${montoUsd} vs presupuesto $${rules.presupuesto_mensual_restante}`,
  );
  if (!presupuestoSuficiente) {
    return build(
      "FRENAR",
      "REGLA_2_PRESUPUESTO",
      `El monto $${montoUsd} supera el presupuesto mensual restante de $${rules.presupuesto_mensual_restante}. No hay saldo suficiente.`,
    );
  }

  // Regla 4: discrepancia con acuerdo comercial en ERP.
  const acuerdoExplicito = invoice.monto_acordado;
  const acuerdoPorProveedor = rules.acuerdos_por_proveedor?.[invoice.emisor];
  const montoAcordado =
    acuerdoExplicito != null
      ? acuerdoExplicito
      : acuerdoPorProveedor != null
        ? acuerdoPorProveedor
        : undefined;

  if (montoAcordado != null) {
    const cumpleAcuerdo = montoUsd <= montoAcordado;
    traza.push(`REGLA_4_ACUERDO: $${montoUsd} vs acordado $${montoAcordado}`);
    if (!cumpleAcuerdo) {
      return build(
        "ESCALAR",
        "REGLA_ACUERDO_PREVIO",
        `El monto $${montoUsd} no cuadra con lo acordado para "${invoice.emisor}" (acordado: $${montoAcordado}). Se escala para revisión humana.`,
      );
    }
  } else {
    traza.push("REGLA_4_ACUERDO: sin acuerdo previo registrado");
  }

  // Regla 5: límite de aprobación automática.
  const dentroDelLimite = montoUsd <= rules.limite_monto_automatico;
  traza.push(
    `REGLA_5_LIMITE_AUTO: $${montoUsd} vs límite $${rules.limite_monto_automatico}`,
  );
  if (!dentroDelLimite) {
    return build(
      "ESCALAR",
      "REGLA_3_LIMITE_AUTO",
      `El monto $${montoUsd} supera el límite de aprobación automática de $${rules.limite_monto_automatico}. Requiere aprobación humana.`,
    );
  }

  // Regla 6: cumplimiento total.
  const saldoRestante = rules.presupuesto_mensual_restante - montoUsd;
  traza.push(`REGLA_6_CUMPLIMIENTO: pago aprobado, saldo restante $${saldoRestante}`);
  return build(
    "PAGAR",
    "APROBACION_AUTOMATICA",
    `Factura validada: proveedor "${invoice.emisor}" autorizado, monto $${montoUsd} USD dentro del límite $${rules.limite_monto_automatico}. Tras el pago quedarán $${saldoRestante} de presupuesto mensual.`,
  );
}
