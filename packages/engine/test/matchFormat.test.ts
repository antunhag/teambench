import { describe, expect, it } from "vitest";
import { isLastPeriod, isPeriodOverdue, periodDurationMs, periodLabel, totalPeriods } from "../src/matchFormat";
import type { MatchFormat } from "../src/types";

const sub15: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 2, overtimeMinutes: 5 };
const sub13: MatchFormat = { periodCount: 2, periodMinutes: 20, overtimePeriodCount: 0, overtimeMinutes: 0 };

describe("match format (duração de jogo configurável por clube/competição)", () => {
  it("cada clube pode ter uma duração de parte diferente", () => {
    expect(periodDurationMs(sub15, 1)).toBe(25 * 60000);
    expect(periodDurationMs(sub13, 1)).toBe(20 * 60000);
  });

  it("períodos além de periodCount usam a duração de prolongamento", () => {
    expect(periodDurationMs(sub15, 3)).toBe(5 * 60000);
  });

  it("periodLabel rotula partes regulares e prolongamentos corretamente", () => {
    expect(periodLabel(1, sub15)).toBe("1ª Parte");
    expect(periodLabel(2, sub15)).toBe("2ª Parte");
    expect(periodLabel(3, sub15)).toBe("Prolongamento 1");
    expect(periodLabel(4, sub15)).toBe("Prolongamento 2");
  });

  it("isPeriodOverdue avisa sem cortar o relógio (o treinador continua no controlo manual)", () => {
    expect(isPeriodOverdue(24 * 60000, sub15, 1)).toBe(false);
    expect(isPeriodOverdue(26 * 60000, sub15, 1)).toBe(true);
  });

  it("totalPeriods soma partes regulares e prolongamento", () => {
    expect(totalPeriods(sub15)).toBe(4); // 2 regulares + 2 de prolongamento
    expect(totalPeriods(sub13)).toBe(2); // sem prolongamento
  });

  it("isLastPeriod respeita o period_count de CADA formato — não um valor global fixo", () => {
    expect(isLastPeriod(1, sub13)).toBe(false);
    expect(isLastPeriod(2, sub13)).toBe(true); // Sub-13 sem prolongamento: termina na 2ª
    expect(isLastPeriod(2, sub15)).toBe(false); // Sub-15 com prolongamento: 2ª não é a última
    expect(isLastPeriod(4, sub15)).toBe(true); // só o prolongamento 2 termina o Sub-15
  });
});
