import { describe, expect, it } from "vitest";
import { createLiveMatchState, doSub, endPeriod, resumeOrStart } from "../src/liveMatch";
import { aggregateRecentMinutes } from "../src/recentMinutes";
import type { MatchFormat } from "../src/types";

const UM_PERIODO: MatchFormat = { periodCount: 1, periodMinutes: 20, overtimePeriodCount: 0, overtimeMinutes: 0 };

const p1 = "athlete-1";
const p2 = "athlete-2";
const p3 = "athlete-3";

function finishedMatch(onCourt: string[], convocadoIds: string[], build: (live: ReturnType<typeof createLiveMatchState>) => ReturnType<typeof createLiveMatchState>) {
  let live = createLiveMatchState(convocadoIds);
  live = { ...live, onCourt };
  live = resumeOrStart(live, 0);
  live = build(live);
  live = endPeriod(live, UM_PERIODO, 20 * 60_000);
  return { convocadoIds, events: live.events, format: UM_PERIODO };
}

describe("aggregateRecentMinutes", () => {
  it("soma os minutos do mesmo atleta através de 2+ jogos", () => {
    const match1 = finishedMatch([p1, p2], [p1, p2], (live) => live);
    const match2 = finishedMatch([p1, p2], [p1, p2], (live) => live);

    const result = aggregateRecentMinutes([match1, match2]);

    const p1Totals = result.find((r) => r.playerId === p1);
    expect(p1Totals?.totalMs).toBeCloseTo(2 * 20 * 60_000, -2);
    expect(p1Totals?.gamesCounted).toBe(2);
  });

  it("atleta convocado mas sem minutos num jogo específico não conta esse jogo em gamesCounted", () => {
    // p3 convocado mas nunca entra em quadra no jogo todo.
    const match1 = finishedMatch([p1, p2], [p1, p2, p3], (live) => live);

    const result = aggregateRecentMinutes([match1]);
    const p3Totals = result.find((r) => r.playerId === p3);

    expect(p3Totals?.totalMs).toBe(0);
    expect(p3Totals?.gamesCounted).toBe(0);
  });

  it("atleta que entra a meio do jogo (substituição) tem só o tempo em quadra contado, e o jogo conta em gamesCounted", () => {
    const match1 = finishedMatch([p1, p2], [p1, p2, p3], (live) => doSub(live, p2, p3, 10 * 60_000));

    const result = aggregateRecentMinutes([match1]);
    const p3Totals = result.find((r) => r.playerId === p3);

    expect(p3Totals?.totalMs).toBeCloseTo(10 * 60_000, -2);
    expect(p3Totals?.gamesCounted).toBe(1);
  });

  it("sem nenhum jogo de entrada, devolve lista vazia", () => {
    expect(aggregateRecentMinutes([])).toEqual([]);
  });
});
