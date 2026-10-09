import { describe, expect, it } from "vitest";
import { generateRotationOptions, type PlayerSlotWeights } from "../src/rotationGenerator";
import type { AvailabilityStatus } from "../src/rotationSuggestion";
import type { MatchFormat, Player } from "../src/types";

function player(id: string): Player {
  return { id, num: id, name: id, pos: "Ala Esquerda" };
}

const ONE_PERIOD: MatchFormat = { periodCount: 1, periodMinutes: 20, overtimePeriodCount: 0, overtimeMinutes: 0 };
const PERIOD_SEC = 20 * 60;

const p1 = player("p1");
const p2 = player("p2");
const p3 = player("p3");
const p4 = player("p4");
const p5 = player("p5");

function noAvailability(): Record<string, AvailabilityStatus> {
  return {};
}

describe("generateRotationOptions", () => {
  const weights: PlayerSlotWeights = {
    p1: { Fixo: 5 },
    p2: { "Ala Esquerda": 5 },
    p3: { "Ala Esquerda": 3 },
    p4: { "Ala Direita": 4 },
    p5: { "Pivô": 2 },
  };

  it("devolve 3 opções nomeadas", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    expect(options.map((o) => o.label)).toEqual(["Turnos longos", "Equilibrada", "Mais rotativa"]);
  });

  it("cada vaga com atletas fica preenchida do início ao fim da parte, sem buraco nem sobreposição", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    for (const option of options) {
      for (let slotIndex = 0; slotIndex < 4; slotIndex++) {
        const slotStints = option.stints
          .filter((s) => s.slotIndex === slotIndex && s.period === 1)
          .sort((a, b) => a.startSec - b.startSec);
        expect(slotStints.length).toBeGreaterThan(0);
        expect(slotStints[0].startSec).toBe(0);
        expect(slotStints[slotStints.length - 1].endSec).toBe(PERIOD_SEC);
        for (let i = 1; i < slotStints.length; i++) {
          expect(slotStints[i].startSec).toBe(slotStints[i - 1].endSec);
        }
      }
    }
  });

  it("atleta indisponível nunca aparece em nenhuma opção", () => {
    const options = generateRotationOptions(
      [p1, p2, p3, p4, p5],
      weights,
      { p2: "indisponivel" },
      ONE_PERIOD
    );
    for (const option of options) {
      expect(option.stints.some((s) => s.playerId === "p2")).toBe(false);
    }
  });

  it("atleta com peso em 2 vagas aparece só numa — a de maior peso", () => {
    const twoSlotWeights: PlayerSlotWeights = { ...weights, p1: { Fixo: 3, "Ala Esquerda": 5 } };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], twoSlotWeights, noAvailability(), ONE_PERIOD);
    for (const option of options) {
      const p1Slots = new Set(option.stints.filter((s) => s.playerId === "p1").map((s) => s.slotIndex));
      expect(p1Slots.size).toBe(1);
      expect(p1Slots.has(1)).toBe(true); // Ala Esquerda = índice 1
    }
  });

  it("tempo total por atleta não varia entre as 3 opções — só o número de turnos muda", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    const [longos, equilibrada, rotativa] = options;
    for (const playerId of ["p1", "p2", "p3", "p4", "p5"]) {
      expect(equilibrada.totalSecondsByPlayer[playerId]).toBe(longos.totalSecondsByPlayer[playerId]);
      expect(rotativa.totalSecondsByPlayer[playerId]).toBe(longos.totalSecondsByPlayer[playerId]);
    }
  });

  it("'Turnos longos' dá um turno contínuo por atleta quando só há um atleta na vaga", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    const longos = options[0];
    const fixoStints = longos.stints.filter((s) => s.slotIndex === 0);
    expect(fixoStints).toHaveLength(1);
    expect(fixoStints[0].playerId).toBe("p1");
  });

  it("'Mais rotativa' fragmenta mais turnos que 'Turnos longos' quando há disputa na vaga", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    const [longos, , rotativa] = options;
    const aeStintsLongos = longos.stints.filter((s) => s.slotIndex === 1).length;
    const aeStintsRotativa = rotativa.stints.filter((s) => s.slotIndex === 1).length;
    expect(aeStintsRotativa).toBeGreaterThan(aeStintsLongos);
  });

  it("vaga sem nenhum atleta com peso cadastrado ainda é preenchida (fallback)", () => {
    const noWeightForPivo: PlayerSlotWeights = {
      p1: { Fixo: 5 },
      p2: { "Ala Esquerda": 5 },
      p3: { "Ala Esquerda": 3 },
      p4: { "Ala Direita": 4 },
      // p5 sem nenhum peso em nenhuma vaga, e ninguém tem peso em Pivô
    };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], noWeightForPivo, noAvailability(), ONE_PERIOD);
    for (const option of options) {
      const pivoStints = option.stints.filter((s) => s.slotIndex === 3);
      expect(pivoStints.length).toBeGreaterThan(0);
    }
  });
});
