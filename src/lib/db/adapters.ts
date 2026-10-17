import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256Hex } from "../security";

/**
 * Gestor Multi-DB: tres adaptadores conmutables.
 * Este módulo es de uso exclusivo en servidor (Node runtime).
 */

export interface DbConnectResult {
  adapter: string;
  ok: boolean;
  latencyMs: number;
  mode: string;
  detail?: string;
  error?: string;
}

export interface DbAdapter {
  readonly name: string;
  connect(): Promise<DbConnectResult>;
  writeLedger(rows: Record<string, unknown>[]): Promise<void>;
  readLedger(): Promise<Record<string, unknown>[]>;
}

// ---------------------------------------------------------------------------
// 1. LocalFileDB (.data/jippay-ledger.json con checksum SHA-256)
// ---------------------------------------------------------------------------

export class LocalFileDB implements DbAdapter {
  readonly name = "LocalFileDB";
  private readonly baseDir?: string;
  private memoryFallback = false;
  private memoryStore: Record<string, unknown>[] = [];

  constructor(baseDir?: string) {
    this.baseDir = baseDir;
  }

  private resolveDataDir(): string {
    if (this.baseDir) return this.baseDir;
    if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
      return path.join(os.tmpdir(), "jippay");
    }
    return path.join(process.cwd(), ".data");
  }

  private get dataDir(): string {
    return this.resolveDataDir();
  }

  private get ledgerFile(): string {
    return path.join(this.dataDir, "jippay-ledger.json");
  }

  private get checksumFile(): string {
    return path.join(this.dataDir, "jippay-ledger.sha256");
  }

  async connect(): Promise<DbConnectResult> {
    const start = performance.now();
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      if (!(await this.fileExists(this.ledgerFile))) {
        await fs.writeFile(this.ledgerFile, "[]", "utf-8");
        await this.writeChecksum("[]");
      }
      this.memoryFallback = false;
      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      return {
        adapter: this.name,
        ok: true,
        latencyMs,
        mode: this.dataDir.startsWith(os.tmpdir())
          ? "disco efímero (/tmp, Vercel)"
          : "disco local (.data/jippay-ledger.json)",
      };
    } catch {
      this.memoryFallback = true;
      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      return {
        adapter: this.name,
        ok: true,
        latencyMs,
        mode: "memoria (fallback read-only)",
      };
    }
  }

  async writeLedger(rows: Record<string, unknown>[]): Promise<void> {
    if (this.memoryFallback) {
      this.memoryStore = rows;
      return;
    }
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const json = JSON.stringify(rows, null, 2);
      await fs.writeFile(this.ledgerFile, json, "utf-8");
      await this.writeChecksum(json);
    } catch {
      this.memoryFallback = true;
      this.memoryStore = rows;
    }
  }

  async readLedger(): Promise<Record<string, unknown>[]> {
    if (this.memoryFallback) return this.memoryStore;
    try {
      const json = await fs.readFile(this.ledgerFile, "utf-8");
      return JSON.parse(json) as Record<string, unknown>[];
    } catch {
      return this.memoryStore;
    }
  }

  async checksum(): Promise<string> {
    if (this.memoryFallback) return sha256Hex(JSON.stringify(this.memoryStore));
    try {
      return (await fs.readFile(this.checksumFile, "utf-8")).trim();
    } catch {
      return "";
    }
  }

  private async writeChecksum(json: string): Promise<void> {
    await fs.writeFile(this.checksumFile, sha256Hex(json), "utf-8");
  }

  private async fileExists(file: string): Promise<boolean> {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. SupabasePostgresAdapter (conexión real con latencia + fallback)
// ---------------------------------------------------------------------------

export class SupabasePostgresAdapter implements DbAdapter {
  readonly name = "SupabasePostgres";

  async connect(): Promise<DbConnectResult> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    const start = performance.now();

    if (!url || !key) {
      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      return {
        adapter: this.name,
        ok: false,
        latencyMs,
        mode: "fallback sin credenciales",
        detail: "Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para conexión real.",
      };
    }

    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/jippay_ledger?limit=1`, {
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      });
      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      if (!response.ok && response.status !== 404) {
        return {
          adapter: this.name,
          ok: false,
          latencyMs,
          mode: "error de conexión",
          error: `HTTP ${response.status}`,
        };
      }
      return { adapter: this.name, ok: true, latencyMs, mode: "PostgreSQL (Supabase)" };
    } catch (error) {
      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      return {
        adapter: this.name,
        ok: false,
        latencyMs,
        mode: "fallback por error de red",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async writeLedger(rows: Record<string, unknown>[]): Promise<void> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return;
    await fetch(`${url.replace(/\/$/, "")}/rest/v1/jippay_ledger`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(rows),
    });
  }

  async readLedger(): Promise<Record<string, unknown>[]> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return [];
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/jippay_ledger?select=*`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!response.ok) return [];
      return (await response.json()) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// 3. MemoryEdgeAdapter (baja latencia, sincronizado con localStorage)
// ---------------------------------------------------------------------------

export class MemoryEdgeAdapter implements DbAdapter {
  readonly name = "MemoryEdge";
  private store: Record<string, unknown>[] = [];

  async connect(): Promise<DbConnectResult> {
    const start = performance.now();
    this.hydrateFromLocalStorage();
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      adapter: this.name,
      ok: true,
      latencyMs,
      mode: "memoria edge (sync localStorage)",
    };
  }

  async writeLedger(rows: Record<string, unknown>[]): Promise<void> {
    this.store = rows;
    this.persistToLocalStorage();
  }

  async readLedger(): Promise<Record<string, unknown>[]> {
    this.hydrateFromLocalStorage();
    return this.store;
  }

  private hydrateFromLocalStorage(): void {
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem("jippay_ledger_edge");
        if (raw) this.store = JSON.parse(raw) as Record<string, unknown>[];
      } catch {
        // Se conserva el estado en memoria.
      }
    }
  }

  private persistToLocalStorage(): void {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("jippay_ledger_edge", JSON.stringify(this.store));
      } catch {
        // Sin espacio o no disponible; no es crítico.
      }
    }
  }
}

export function getAllAdapters(): DbAdapter[] {
  return [new LocalFileDB(), new SupabasePostgresAdapter(), new MemoryEdgeAdapter()];
}

/**
 * Adaptador activo para persistir decisiones: Supabase si hay credenciales,
 * de lo contrario disco local (con fallback transparente a /tmp o memoria en Vercel).
 */
export function getActiveAdapter(): DbAdapter {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (url && key) return new SupabasePostgresAdapter();
  return new LocalFileDB();
}

/**
 * Registra una decisión de auditoría en el adaptador activo (append al ledger).
 * Nunca lanza: la persistencia es no bloqueante respecto a la respuesta HTTP.
 */
export async function persistDecision(decision: Record<string, unknown>): Promise<void> {
  try {
    const adapter = getActiveAdapter();
    const rows = await adapter.readLedger();
    rows.push({ ...decision, persisted_at: new Date().toISOString() });
    await adapter.writeLedger(rows);
  } catch {
    // No interrumpe el flujo de auditoría si el backend de persistencia no está disponible.
  }
}
