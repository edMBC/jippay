/**
 * Roles SOX y metadatos compartidos (seguro para navegador y servidor).
 */

export type UserRole = "CFO_ADMIN" | "CONTROLLER_APPROVER" | "AUDITOR_VIEWER";

export interface SessionUser {
  email: string;
  role: UserRole;
  company?: string;
  /** Identificador estable de la empresa a la que pertenece el usuario. */
  company_id?: string;
  /** ID estable del usuario de Supabase Auth (fuente de identidad real). */
  auth_user_id?: string;
  /** Origen de la identidad: Supabase Auth o demo local. */
  identity_provider?: "supabase" | "demo";
  name?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  CFO_ADMIN: "CFO / Policy Admin",
  CONTROLLER_APPROVER: "Finance Controller",
  AUDITOR_VIEWER: "ISO/SOX External Auditor",
};

export const ROLE_OPTIONS: { value: UserRole; label: string; email: string }[] = [
  { value: "CFO_ADMIN", label: "CFO", email: "cfo@jippay.us" },
  { value: "CONTROLLER_APPROVER", label: "Controller / Approver", email: "controller@jippay.us" },
  { value: "AUDITOR_VIEWER", label: "Auditor SOX", email: "auditor@jippay.us" },
];
