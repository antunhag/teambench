// Minutos recentes — contexto de maturação pra sugestão de rotação
// (specs/003-data-driven-rotation/), nunca fator de ordenação (FR-006).
//
// Reaproveita `replayEvents`, já a única fonte de verdade pra "quanto tempo
// um atleta esteve em quadra" (Resumo/Timeline do jogo usa o mesmo motor) —
// ver Decisão 3 em specs/003-data-driven-rotation/research.md.
import { playerSeconds } from "./clock";
import { replayEvents } from "./replay";
import type { MatchEvent, MatchFormat } from "./types";

export interface RecentMatchInput {
  convocadoIds: string[];
  events: MatchEvent[];
  format: MatchFormat;
}

export interface RecentMinutes {
  playerId: string;
  totalMs: number;
  /** Em quantos dos jogos de entrada esse atleta teve algum tempo em quadra (não só convocação). */
  gamesCounted: number;
}

export function aggregateRecentMinutes(matches: RecentMatchInput[]): RecentMinutes[] {
  const totals = new Map<string, { totalMs: number; gamesCounted: number }>();

  for (const match of matches) {
    const state = replayEvents(match.convocadoIds, match.events, match.format);
    for (const playerId of match.convocadoIds) {
      const seconds = playerSeconds(state.clockAcc, playerId, state.clock.elapsedMs);
      const prev = totals.get(playerId) ?? { totalMs: 0, gamesCounted: 0 };
      totals.set(playerId, {
        totalMs: prev.totalMs + seconds * 1000,
        gamesCounted: prev.gamesCounted + (seconds > 0 ? 1 : 0),
      });
    }
  }

  return [...totals.entries()].map(([playerId, v]) => ({ playerId, ...v }));
}
