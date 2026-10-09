import { describe, expect, it } from "vitest";
import { generateRotationOptions, type PlayerSlotWeights } from "../src/rotationGenerator";
import type { AvailabilityStatus } from "../src/rotationSuggestion";
import type { MatchFormat, Player } from "../src/types";

function player(id: string): Player {
  return { id, num: id, name: id, pos: "Ala Esquerda" };
}

const ONE_PERIOD: MatchFormat = { periodCount: 1, periodMinutes: 20, overtimePeriodCount: 0, overtimeMinutes: 0 };
const PERIOD_SEC = 20 * 60;
const MAX_STINT_SEC = 5 * 60;

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

  it("devolve 3 opções nomeadas por filosofia de rotação, não por tamanho de turno", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    expect(options.map((o) => o.label)).toEqual(["Foco nos mais aptos", "Equilibrada", "Dá minutos a todos"]);
  });

  it("nenhum turno, em nenhuma opção, passa de 5 minutos", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    for (const option of options) {
      for (const stint of option.stints) {
        expect(stint.endSec - stint.startSec).toBeLessThanOrEqual(MAX_STINT_SEC);
      }
    }
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

  it("nenhum atleta aparece em duas vagas ao mesmo tempo", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    for (const option of options) {
      const byPlayer = new Map<string, typeof option.stints>();
      option.stints.forEach((s) => {
        const list = byPlayer.get(s.playerId) ?? [];
        list.push(s);
        byPlayer.set(s.playerId, list);
      });
      byPlayer.forEach((stints) => {
        const sorted = [...stints].sort((a, b) => a.startSec - b.startSec);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].startSec).toBeGreaterThanOrEqual(sorted[i - 1].endSec);
        }
      });
    }
  });

  it("atleta indisponível nunca aparece em nenhuma opção", () => {
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, { p2: "indisponivel" }, ONE_PERIOD);
    for (const option of options) {
      expect(option.stints.some((s) => s.playerId === "p2")).toBe(false);
    }
  });

  it("atleta com peso em 2 vagas roda entre as duas (não fica preso numa só)", () => {
    const twoSlotWeights: PlayerSlotWeights = { ...weights, p1: { Fixo: 4, "Ala Direita": 4 } };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], twoSlotWeights, noAvailability(), ONE_PERIOD);
    const focoNosMaisAptos = options[0];
    const p1Slots = new Set(focoNosMaisAptos.stints.filter((s) => s.playerId === "p1").map((s) => s.slotIndex));
    expect(p1Slots.size).toBeGreaterThan(1);
  });

  it("'Dá minutos a todos' dá mais tempo real ao substituto que 'Foco nos mais aptos' pra um atleta dominante numa vaga", () => {
    const longPeriod: MatchFormat = { periodCount: 1, periodMinutes: 30, overtimePeriodCount: 0, overtimeMinutes: 0 };
    const soloSpecialistWeights: PlayerSlotWeights = { p1: { Fixo: 5 }, p2: { "Ala Esquerda": 5 }, p4: { "Ala Direita": 4 }, p5: { Pivô: 5 } };
    const options = generateRotationOptions([p1, p2, p4, p5], soloSpecialistWeights, noAvailability(), longPeriod);
    const [focoNosMaisAptos, , daMinutosATodos] = options;

    // p5 é o único com peso de verdade no Pivô — em ambas as opções ele segue dominando o tempo,
    // mas a pressão de troca mais forte de "Dá minutos a todos" deve abrir mais tempo real pra
    // quem assume o Pivô quando ele é forçado a sair (aqui, p4 — o fallback determinístico).
    const secondsAt = (stints: typeof focoNosMaisAptos.stints, slotIndex: number, playerId: string) =>
      stints.filter((s) => s.slotIndex === slotIndex && s.playerId === playerId).reduce((sum, s) => sum + (s.endSec - s.startSec), 0);

    expect(secondsAt(daMinutosATodos.stints, 3, "p4")).toBeGreaterThan(secondsAt(focoNosMaisAptos.stints, 3, "p4"));
    expect(secondsAt(focoNosMaisAptos.stints, 3, "p5")).toBeGreaterThan(secondsAt(daMinutosATodos.stints, 3, "p5"));
  });

  it("mesmo em 'Foco nos mais aptos', o peso domina — o melhor numa vaga joga bem mais que uma alternativa sem aptidão ali", () => {
    const dinis = player("dinis"); // sem nenhum peso explícito em lugar nenhum — cai no padrão 1 em toda vaga.
    const longPeriod: MatchFormat = { periodCount: 1, periodMinutes: 30, overtimePeriodCount: 0, overtimeMinutes: 0 };
    const soloSpecialistWeights: PlayerSlotWeights = {
      p1: { Fixo: 5 },
      p2: { "Ala Esquerda": 5 },
      p4: { "Ala Direita": 4 },
      p5: { "Pivô": 5 }, // único com peso de verdade no Pivô
      // dinis fica sem nenhuma entrada — peso 1 (padrão) em todas as vagas
    };
    const [focoNosMaisAptos] = generateRotationOptions([p1, p2, p4, p5, dinis], soloSpecialistWeights, noAvailability(), longPeriod);
    const pivoSecondsFor = (playerId: string) =>
      focoNosMaisAptos.stints
        .filter((s) => s.slotIndex === 3 && s.playerId === playerId)
        .reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
    expect(pivoSecondsFor("p5")).toBeGreaterThan(pivoSecondsFor("dinis") * 2);
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
