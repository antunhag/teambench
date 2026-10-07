// Lógica pura da trava genérica "uma conta, um recurso, até libertar" —
// generaliza o mesmo padrão já usado pro jogo ao vivo (migração 0009,
// matches.live_holder_id), agora pras telas de gestão da equipa (Plantel,
// Formato de Jogo, Convites — ver supabase/migrations/0016_resource_locks.sql).
//
// O servidor (claim_resource_lock) já resolve a reivindicação de forma
// atómica e é a fonte de verdade — isto aqui só traduz a linha que ele
// devolve num estado de UI (igual ao que useMatchLock já faz inline), de
// forma pura e testável sem precisar de rede/Supabase.

export type ResourceLockRow = {
  holderId: string | null;
  /** ISO timestamp (como vem do Supabase), ou null se livre. */
  heartbeatAt: string | null;
};

export type LockStatus = "master" | "readonly";

/** Mesmo limiar do SQL (claim_resource_lock) — 2 ciclos de heartbeat (20s) + folga. */
export const LOCK_STALE_MS = 45_000;

/**
 * Estado da trava pra quem está a olhar `row` agora: "master" quando a vaga
 * está livre, já é minha, ou o heartbeat de quem segurava ficou obsoleto
 * (posso reivindicar); "readonly" quando outra conta segura de verdade.
 * Recebe `nowMs` explícito (nunca Date.now() interno), mesmo padrão de
 * matchElapsedMs — torna a função determinística e testável.
 */
export function lockStatusFor(row: ResourceLockRow | null, currentUserId: string, nowMs: number): LockStatus {
  if (!row || row.holderId === null) return "master";
  if (row.holderId === currentUserId) return "master";
  if (row.heartbeatAt !== null && nowMs - Date.parse(row.heartbeatAt) > LOCK_STALE_MS) return "master";
  return "readonly";
}
