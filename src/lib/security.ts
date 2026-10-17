/**
 * Blindaje de seguridad financiera: utilidades puras y deterministas.
 * Sin dependencias externas y seguras tanto en servidor como en navegador.
 */

// ---------------------------------------------------------------------------
// Hashing SHA-256 (implementación pura JS, funciona en Node y en el navegador)
// ---------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Hex(input: string | Uint8Array): string {
  const msg = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const byteLength = msg.length;
  const bitLength = byteLength * 8;
  const paddedLength = (((byteLength + 8) >> 6) + 1) << 6;

  const padded = new Uint8Array(paddedLength);
  padded.set(msg);
  padded[byteLength] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let i = 0; i < paddedLength; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  let out = "";
  for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, "0");
  return out;
}

// ---------------------------------------------------------------------------
// Anti-prompt injection
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+all\s+previous\s+instructions/i,
  /ignore\s+previous\s+rules/i,
  /ignore\s+your\s+instructions/i,
  /system\s+override/i,
  /system\s+prompt/i,
  /override\s+the\s+rules/i,
  /forget\s+(all\s+)?(your\s+)?instructions/i,
  /disregard\s+(all|previous|the\s+above)/i,
  /bypass\s+(the\s+)?(rules|security|policy)/i,
  /aprueba\s+este\s+pago/i,
  /approve\s+this\s+(payment|invoice)/i,
  /pay\s+this\s+invoice\s+immediately/i,
  /cambia\s+el\s+l[ií]mite\s+a\s+\d/i,
  /change\s+the\s+limit\s+to/i,
  /autoriza\s+sin\s+revisi[ió]n/i,
  /99999999/,
];

export interface SanitizeResult {
  alert: boolean;
  flaggedPatterns: string[];
}

export function detectPromptInjection(text: string): boolean {
  return sanitizeInvoiceInput(text).alert;
}

export function sanitizeInvoiceInput(text: string): SanitizeResult {
  const flaggedPatterns: string[] = [];
  const source = text ?? "";
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(source)) {
      flaggedPatterns.push(pattern.source);
    }
  }
  return { alert: flaggedPatterns.length > 0, flaggedPatterns };
}

// ---------------------------------------------------------------------------
// Detección de spoofing / homógrafos (Levenshtein)
// ---------------------------------------------------------------------------

export function levenshteinDistance(a: string, b: string): number {
  const s = a.length;
  const t = b.length;
  if (s === 0) return t;
  if (t === 0) return s;

  let prev = new Array<number>(t + 1);
  let curr = new Array<number>(t + 1);
  for (let j = 0; j <= t; j++) prev[j] = j;

  for (let i = 1; i <= s; i++) {
    curr[0] = i;
    for (let j = 1; j <= t; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t];
}

export interface SpoofingResult {
  spoofed: boolean;
  closest: string | null;
  distance: number;
}

export function detectVendorSpoofing(emisor: string, whitelist: string[]): SpoofingResult {
  const normalized = normalizeText(emisor);
  const providers = whitelist ?? [];

  if (providers.some((p) => normalizeText(p) === normalized)) {
    return { spoofed: false, closest: null, distance: 0 };
  }

  let closest: string | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const provider of providers) {
    const d = levenshteinDistance(normalized, normalizeText(provider));
    if (d < distance) {
      distance = d;
      closest = provider;
    }
  }

  const spoofed = distance <= 2;
  return { spoofed, closest: spoofed ? closest : null, distance };
}

// ---------------------------------------------------------------------------
// Normalización y huellas compuestas
// ---------------------------------------------------------------------------

export function normalizeText(value: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeInvoiceId(id: string): string {
  return normalizeText(id).toUpperCase();
}

export function compositeFingerprint(emisor: string, montoUsd: number, fecha: string): string {
  const rounded = Math.round(montoUsd * 100) / 100;
  return `${normalizeText(emisor)}|${rounded}|${(fecha ?? "").trim()}`;
}

// ---------------------------------------------------------------------------
// Conversión multimoneda auditable a USD
// ---------------------------------------------------------------------------

export const FX_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  COP: 4000,
  MXN: 18,
  ARS: 1000,
  BRL: 5,
  EUR: 0.92,
};

export interface CurrencyConversion {
  monto_original: number;
  moneda_original: string;
  monto_usd: number;
  tasa_cambio: number;
  nota: string;
}

export function convertToUsd(monto: number, moneda: string): CurrencyConversion {
  const monedaOriginal = (moneda ?? "USD").toUpperCase();
  const tasa = FX_RATES_TO_USD[monedaOriginal] ?? 1;
  const montoUsd = Math.round((monto / tasa) * 100) / 100;
  return {
    monto_original: monto,
    moneda_original: monedaOriginal,
    monto_usd: montoUsd,
    tasa_cambio: tasa,
    nota: `Conversión ${monto} ${monedaOriginal} → ${montoUsd} USD (tasa 1 ${monedaOriginal} = ${tasa} USD)`,
  };
}
