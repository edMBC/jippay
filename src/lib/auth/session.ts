import { sha256Hex } from "../security";
import { ROLE_LABELS, type SessionUser, type UserRole } from "./roles";

export { ROLE_LABELS, ROLE_OPTIONS, type SessionUser, type UserRole } from "./roles";

/**
 * Capa de identidad SOX (Segregación de Funciones).
 * Sesiones firmadas en cookie HttpOnly, con usuarios corporativos preconfigurados
 * como fallback inmediato y preparada para Supabase Auth.
 *
 * Seguridad del secreto:
 * - En desarrollo/pruebas se permite un secreto de demostración para no romper el flujo local.
 * - En producción el secreto de demostración NO es aceptable: si falta un secreto seguro
 *   (o se configura explícitamente el secreto de demo), el mecanismo falla de forma segura
 *   (no firma ni acepta sesiones).
 */

export const DEMO_USERS: Record<string, SessionUser> = {
  "cfo@jippay.us": {
    email: "cfo@jippay.us",
    role: "CFO_ADMIN",
    company: "Jippay US",
    name: "CFO Admin",
  },
  "controller@jippay.us": {
    email: "controller@jippay.us",
    role: "CONTROLLER_APPROVER",
    company: "Jippay US",
    name: "Finance Controller",
  },
  "auditor@jippay.us": {
    email: "auditor@jippay.us",
    role: "AUDITOR_VIEWER",
    company: "External Audit",
    name: "ISO/SOX Auditor",
  },
};

export const ROLE_TO_DEMO_EMAIL: Record<UserRole, string> = {
  CFO_ADMIN: "cfo@jippay.us",
  CONTROLLER_APPROVER: "controller@jippay.us",
  AUDITOR_VIEWER: "auditor@jippay.us",
};

export const SESSION_COOKIE = "jippay_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const DEMO_SECRET = "jippay-demo-secret";
const KNOWN_ROLES: ReadonlyArray<UserRole> = [
  "CFO_ADMIN",
  "CONTROLLER_APPROVER",
  "AUDITOR_VIEWER",
];

interface TokenClaims extends SessionUser {
  exp: number;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && (KNOWN_ROLES as ReadonlyArray<string>).includes(role);
}

/**
 * Devuelve el secreto utilizable o `null` si no hay un secreto seguro disponible.
 * En producción el secreto de demo es inaceptable: se devuelve `null` para fallar seguro.
 */
export function resolveSessionSecret(): string | null {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.trim()) {
    if (isProduction() && configured === DEMO_SECRET) return null;
    return configured;
  }
  if (isProduction()) return null;
  return DEMO_SECRET;
}

/** Indica si el backend puede emitir/validar sesiones con la configuración actual. */
export function canIssueSessions(): boolean {
  return resolveSessionSecret() !== null;
}

function b64urlEncode(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

export interface CreateSessionOptions {
  maxAgeSeconds?: number;
  now?: () => Date;
}

export function createSessionToken(user: SessionUser, options?: CreateSessionOptions): string {
  const secret = resolveSessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured securely");
  const maxAge = options?.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const nowMs = options?.now?.().getTime() ?? Date.now();
  const claims: TokenClaims = { ...user, exp: Math.floor(nowMs / 1000) + maxAge };
  const payload = b64urlEncode(JSON.stringify(claims));
  const signature = sha256Hex(`${payload}.${secret}`);
  return `${payload}.${signature}`;
}

export function parseSessionToken(token: string): SessionUser | null {
  const secret = resolveSessionSecret();
  if (!secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (sha256Hex(`${payload}.${secret}`) !== signature) return null;
  try {
    const claims = JSON.parse(b64urlDecode(payload)) as TokenClaims;
    if (!claims || typeof claims.email !== "string" || !isValidRole(claims.role)) {
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) {
      return null;
    }
    const { exp, ...user } = claims;
    void exp;
    return user as SessionUser;
  } catch {
    return null;
  }
}

export function getSessionUser(
  cookieHeader: string | null | undefined,
): SessionUser | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!sessionCookie) return null;
  const token = sessionCookie.slice(SESSION_COOKIE.length + 1);
  return parseSessionToken(token);
}

export function serializeSessionCookie(user: SessionUser): string {
  const token = createSessionToken(user);
  const secure = isProduction() ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  const secure = isProduction() ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

export function canEditRules(user: SessionUser | null): boolean {
  return user?.role === "CFO_ADMIN";
}

export function canApprove(user: SessionUser | null): boolean {
  return user?.role === "CFO_ADMIN" || user?.role === "CONTROLLER_APPROVER";
}

export function userLabel(user: SessionUser | null): string {
  if (!user) return "Sin sesión";
  return ROLE_LABELS[user.role] ?? user.role;
}
