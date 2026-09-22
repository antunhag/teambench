// Registo de eventos — a única fonte de verdade do jogo.
//
// Porta de logEvent/recomputeScoreFor do banco.html. O placar NUNCA é um
// contador guardado à parte: é sempre a contagem de eventos "golo"/
// "golo_sofrido" na lista. Isto garante que corrigir, apagar ou adicionar um
// evento esquecido nunca deixa placar e registo cronológico dessincronizados.
import type { EventType, MatchEvent, Score } from "./types";

/** Gera um identificador de evento. Não criptográfico — suficiente para uso local; a fila de sincronização usa `clientEventId` separado (crypto.randomUUID) para idempotência com o servidor. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createEvent(
  type: EventType,
  playerId: string | null,
  ms: number,
  period: number,
  nowTs: number,
  extra: Partial<MatchEvent> = {}
): MatchEvent {
  return {
    id: uid(),
    // UUID real gerado já na criação — é a chave de idempotência que a
    // sincronização usa (upsert onConflict: client_event_id), permitindo
    // reenviar com segurança se a conexão cair a meio de uma resposta.
    clientEventId: crypto.randomUUID(),
    type,
    playerId,
    ms,
    min: Math.floor(ms / 60000),
    sec: Math.floor((ms % 60000) / 1000),
    period,
    ts: nowTs,
    ...extra,
  };
}

export function recomputeScoreFor(events: MatchEvent[]): Score {
  return {
    nos: events.filter((e) => e.type === "golo").length,
    advers: events.filter((e) => e.type === "golo_sofrido").length,
  };
}
