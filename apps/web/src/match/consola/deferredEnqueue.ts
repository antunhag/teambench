/**
 * Envio adiado do último lance com zona opcional (specs/009-captura-detalhada/
 * research.md Decisão 3). O lance entra logo no estado local (persistido),
 * mas só vai para a fila (outbox) quando acontece a primeira de: zona
 * escolhida, painel fechado, outra ação, prazo, sair da tela ou arranque
 * (recuperação depois de a app fechar). Assim a zona entra no evento ANTES de
 * ele ser enfileirado — um item enfileirado nunca é recalculado (outbox.ts,
 * guarda 0026). Lógica pura; quem chama faz o enqueue.
 */

export const PRAZO_ZONA_MS = 10_000;

export interface Pending {
  /** clientEventId do evento à espera de zona. */
  key: string;
  since: number;
}

export type Trigger =
  | { type: "zona" }
  | { type: "fechar" }
  | { type: "outra-acao" }
  | { type: "prazo"; now: number }
  | { type: "desmontar" }
  | { type: "arranque" }
  /** Desfazer: se o evento pendente foi removido, nunca chegou à fila — descarta-se. */
  | { type: "desfazer"; removedKeys: string[] };

export interface Resolution {
  /** Evento a enfileirar agora (no máximo um), ou null. */
  enqueueKey: string | null;
  next: Pending | null;
}

export function resolvePending(p: Pending | null, t: Trigger, prazoMs = PRAZO_ZONA_MS): Resolution {
  if (!p) return { enqueueKey: null, next: null };
  switch (t.type) {
    case "prazo":
      return t.now - p.since >= prazoMs ? { enqueueKey: p.key, next: null } : { enqueueKey: null, next: p };
    case "desfazer":
      return t.removedKeys.includes(p.key) ? { enqueueKey: null, next: null } : { enqueueKey: null, next: p };
    default:
      return { enqueueKey: p.key, next: null };
  }
}

/** Um lance novo com zona opcional: o anterior ainda pendente é enfileirado primeiro (ordem preservada). */
export function startPending(prev: Pending | null, key: string, now: number): Resolution {
  return { enqueueKey: prev ? prev.key : null, next: { key, since: now } };
}
