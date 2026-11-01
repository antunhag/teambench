import type { MatchEvent } from "@teambench/engine";
import { describe, expect, it } from "vitest";
import { benchSeconds } from "./bench";

const sub = (inId: string, outId: string, ms: number, period = 1) =>
  ({ id: `${inId}-${ms}`, type: "substituicao", playerId: inId, outId, ms, min: 0, sec: 0, period, ts: ms }) as MatchEvent;

describe("benchSeconds", () => {
  it("desde a última saída nesta parte", () => {
    expect(benchSeconds([sub("b", "a", 60_000)], "a", 1, 300_000)).toBe(240);
  });
  it("voltou a entrar e saiu de novo: conta da última saída", () => {
    const ev = [sub("b", "a", 60_000), sub("a", "b", 120_000), sub("c", "a", 200_000)];
    expect(benchSeconds(ev, "a", 1, 300_000)).toBe(100);
  });
  it("não saiu nesta parte: desde o início da parte", () => {
    expect(benchSeconds([sub("b", "a", 60_000, 1)], "a", 2, 90_000)).toBe(90);
  });
});
