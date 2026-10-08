import { describe, expect, it } from "vitest";
import { explainSuggestion, suggestOrder } from "../src/rotationSuggestion";
import type { AptitudeBySlot } from "../src/rotationPlan";
import type { Player } from "../src/types";

function player(id: string): Player {
  return { id, num: id, name: id, pos: "Ala Esquerda" };
}

const p1 = player("p1"); // A na vaga
const p2 = player("p2"); // B na vaga
const p3 = player("p3"); // C na vaga
const p4 = player("p4"); // habitual, sem classificação
const p5 = player("p5"); // A na vaga, mas indisponível
const p6 = player("p6"); // recém-chegado, sem nenhuma aptidão cadastrada, sem histórico

const SLOT = "Ala Esquerda" as const;

const aptitudesBySlot: Record<string, AptitudeBySlot> = {
  p1: { [SLOT]: "A" },
  p2: { [SLOT]: "B" },
  p3: { [SLOT]: "C" },
  p4: { [SLOT]: null },
  p5: { [SLOT]: "A" },
};

describe("suggestOrder", () => {
  it("ordena por qualidade: A, B, C, sem classificação", () => {
    const order = suggestOrder([p4, p3, p1, p2], aptitudesBySlot, {}, {}, SLOT).map((s) => s.playerId);
    expect(order).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("indisponível vai sempre para o fim, mesmo sendo A na vaga", () => {
    const order = suggestOrder([p1, p5, p2], aptitudesBySlot, { p5: "indisponivel" }, {}, SLOT).map((s) => s.playerId);
    expect(order).toEqual(["p1", "p2", "p5"]);
  });

  it("a_retomar não muda a posição na ordenação, só o motivo", () => {
    const order = suggestOrder([p1, p2], aptitudesBySlot, { p2: "a_retomar" }, {}, SLOT).map((s) => s.playerId);
    expect(order).toEqual(["p1", "p2"]);
    const p2Suggestion = suggestOrder([p1, p2], aptitudesBySlot, { p2: "a_retomar" }, {}, SLOT).find((s) => s.playerId === "p2");
    expect(p2Suggestion?.reason).toContain("a retomar");
  });

  it("atleta sem nenhum jogo anterior é ordenado só pela aptidão — falta de histórico não prioriza nem penaliza (FR-006)", () => {
    const withoutHistory = suggestOrder([p1, p6], aptitudesBySlot, {}, {}, SLOT);
    // p6 não tem aptidão cadastrada pra essa vaga → mesma posição de "sem classificação", nunca primeiro nem último por causa da falta de minutos.
    expect(withoutHistory.map((s) => s.playerId)).toEqual(["p1", "p6"]);
    expect(withoutHistory.find((s) => s.playerId === "p6")?.reason).toBe("Sem classificação nesta vaga · sem jogos recentes registados");
  });

  it("empate de qualidade mantém a ordem de entrada (sort estável)", () => {
    const order = suggestOrder([p3, p2], { p3: { [SLOT]: "A" }, p2: { [SLOT]: "A" } }, {}, {}, SLOT).map((s) => s.playerId);
    expect(order).toEqual(["p3", "p2"]);
  });
});

describe("explainSuggestion", () => {
  it("só aptidão, sem estado nem minutos recentes", () => {
    expect(explainSuggestion("A", "apto", null)).toBe("A na vaga · sem jogos recentes registados");
  });

  it("aptidão + a retomar", () => {
    expect(explainSuggestion("B", "a_retomar", null)).toBe("B na vaga · a retomar, dosear entrada · sem jogos recentes registados");
  });

  it("aptidão + indisponível", () => {
    expect(explainSuggestion("A", "indisponivel", null)).toBe("A na vaga · indisponível · sem jogos recentes registados");
  });

  it("aptidão + contexto de minutos recentes", () => {
    const reason = explainSuggestion("A", "apto", { playerId: "p1", totalMs: 3 * 20 * 60_000, gamesCounted: 3 });
    expect(reason).toBe("A na vaga · média de 20 min nos últimos 3 jogos");
  });

  it("atleta sem classificação nesta vaga", () => {
    expect(explainSuggestion(null, "apto", null)).toBe("Sem classificação nesta vaga · sem jogos recentes registados");
  });
});
