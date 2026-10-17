import { InMemoryTransactionalLedger } from "./in-memory-ledger";
import type { TransactionalLedger } from "./ledger";
import type { LedgerCapabilities } from "./model";
import { PostgresTransactionalLedger } from "./postgres-ledger";

/**
 * Fábrica del ledger transaccional.
 *
 * - Si `DATABASE_URL` está configurado -> PostgreSQL (transaccional, multi-instancia).
 * - En caso contrario -> ledger en memoria (demo/tests, un único proceso).
 *
 * La ausencia de persistencia transaccional o de identidad empresarial verificable
 * se refleja en `capabilities.productionSafe === false` y la operación financiera
 * queda bloqueada en producción.
 */

let singleton: TransactionalLedger | null = null;

export function getTransactionalLedger(): TransactionalLedger {
  if (singleton) return singleton;
  singleton = process.env.DATABASE_URL ? new PostgresTransactionalLedger() : new InMemoryTransactionalLedger();
  return singleton;
}

/** Útil en tests para inyectar un ledger concreto y evitar estado compartido. */
export function setTransactionalLedger(ledger: TransactionalLedger): void {
  singleton = ledger;
}

export function getLedgerCapabilities(): LedgerCapabilities {
  return getTransactionalLedger().capabilities;
}

/** True si el ledger actual cumple las garantías para operaciones financieras reales. */
export function isProductionFinanceReady(): boolean {
  return getTransactionalLedger().capabilities.productionSafe;
}
