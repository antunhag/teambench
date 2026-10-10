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

  it("nenhuma opção deixa um atleta segurar a mesma vaga por 2 janelas seguidas — nem o mais apto", () => {
    const longPeriod: MatchFormat = { periodCount: 1, periodMinutes: 30, overtimePeriodCount: 0, overtimeMinutes: 0 };
    const soloSpecialistWeights: PlayerSlotWeights = { p1: { Fixo: 5 }, p2: { "Ala Esquerda": 5 }, p3: { "Ala Direita": 4 }, p5: { Pivô: 5 } };
    const options = generateRotationOptions([p1, p2, p3, p5], soloSpecialistWeights, noAvailability(), longPeriod);
    for (const option of options) {
      for (let slotIndex = 0; slotIndex < 4; slotIndex++) {
        const slotStints = option.stints.filter((s) => s.slotIndex === slotIndex).sort((a, b) => a.startSec - b.startSec);
        for (let i = 1; i < slotStints.length; i++) {
          expect(slotStints[i].playerId).not.toBe(slotStints[i - 1].playerId);
        }
      }
    }
  });

  it("'Dá minutos a todos' espalha uma vaga disputada entre mais atletas distintos que 'Foco nos mais aptos', sem derrubar o domínio de quem tem o peso real", () => {
    const longPeriod: MatchFormat = { periodCount: 1, periodMinutes: 30, overtimePeriodCount: 0, overtimeMinutes: 0 };
    // p6 é o único substituto real no Pivô (peso 2) — p1/p2/p3 só concorrem lá no piso (1), quando sobram de folga nas próprias vagas.
    const p6 = player("p6");
    const soloSpecialistWeights: PlayerSlotWeights = {
      p1: { Fixo: 5 },
      p2: { "Ala Esquerda": 5 },
      p3: { "Ala Direita": 4 },
      p5: { Pivô: 5 },
      p6: { Pivô: 2 },
    };
    const options = generateRotationOptions([p1, p2, p3, p5, p6], soloSpecialistWeights, noAvailability(), longPeriod);
    const [focoNosMaisAptos, , daMinutosATodos] = options;

    const pivoPlayers = (stints: typeof focoNosMaisAptos.stints) => new Set(stints.filter((s) => s.slotIndex === 3).map((s) => s.playerId));
    const secondsAt = (stints: typeof focoNosMaisAptos.stints, playerId: string) =>
      stints.filter((s) => s.slotIndex === 3 && s.playerId === playerId).reduce((sum, s) => sum + (s.endSec - s.startSec), 0);

    // Mais gente passa pelo Pivô na opção mais generosa — o domínio de p5 (peso real mais alto) não muda
    // (ele só pode ser forçado a sair a cada janela, igual nas 3 opções), mas quem ocupa o resto varia mais.
    expect(pivoPlayers(daMinutosATodos.stints).size).toBeGreaterThan(pivoPlayers(focoNosMaisAptos.stints).size);
    expect(secondsAt(focoNosMaisAptos.stints, "p5")).toBe(secondsAt(daMinutosATodos.stints, "p5"));
    // p6 tem peso real (2) no Pivô — nunca fica de fora completamente, nem na opção mais concentrada.
    expect(secondsAt(focoNosMaisAptos.stints, "p6")).toBeGreaterThan(0);
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

describe("generateRotationOptions com RotationStartPoint (specs/006-live-rotation-replan/)", () => {
  const weights: PlayerSlotWeights = {
    p1: { Fixo: 5 },
    p2: { "Ala Esquerda": 5 },
    p3: { "Ala Esquerda": 3 },
    p4: { "Ala Direita": 4 },
    p5: { "Pivô": 2 },
  };
  const TWO_PERIODS: MatchFormat = { periodCount: 2, periodMinutes: 20, overtimePeriodCount: 0, overtimeMinutes: 0 };

  it("omitido = comportamento idêntico a não passar o parâmetro nenhum (regressão: nunca muda o plano pré-jogo)", () => {
    const semArgumento = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD);
    const comUndefined = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD, undefined);
    expect(comUndefined).toEqual(semArgumento);
  });

  it("com startPoint no meio da parte: nenhum stint começa antes do ponto de início, cobertura exata até o fim", () => {
    const startPoint = { period: 1, elapsedSec: 320 };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD, startPoint);
    for (const option of options) {
      for (let slotIndex = 0; slotIndex < 4; slotIndex++) {
        const slotStints = option.stints.filter((s) => s.slotIndex === slotIndex && s.period === 1).sort((a, b) => a.startSec - b.startSec);
        expect(slotStints.length).toBeGreaterThan(0);
        expect(slotStints[0].startSec).toBe(320); // nunca antes do ponto de início
        expect(slotStints[slotStints.length - 1].endSec).toBe(PERIOD_SEC);
        for (let i = 1; i < slotStints.length; i++) {
          expect(slotStints[i].startSec).toBe(slotStints[i - 1].endSec); // sem buraco nem sobreposição
        }
      }
    }
  });

  it("partes inteiramente antes do período do startPoint não geram nenhum stint — só a UI preserva os turnos já jogados, o motor não os repete", () => {
    const startPoint = { period: 2, elapsedSec: 0 };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), TWO_PERIODS, startPoint);
    for (const option of options) {
      expect(option.stints.some((s) => s.period === 1)).toBe(false);
      expect(option.stints.some((s) => s.period === 2)).toBe(true);
    }
  });

  it("parte depois do período do startPoint continua cobrindo do minuto 0, normalmente", () => {
    const startPoint = { period: 1, elapsedSec: 600 };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), TWO_PERIODS, startPoint);
    for (const option of options) {
      const periodo2 = option.stints.filter((s) => s.period === 2 && s.slotIndex === 0).sort((a, b) => a.startSec - b.startSec);
      expect(periodo2[0].startSec).toBe(0);
    }
  });

  it("atleta indisponível nunca aparece, mesmo com startPoint", () => {
    const startPoint = { period: 1, elapsedSec: 320 };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, { p2: "indisponivel" }, ONE_PERIOD, startPoint);
    for (const option of options) {
      expect(option.stints.some((s) => s.playerId === "p2")).toBe(false);
    }
  });

  it("teto de 5 min seguidos continua valendo dentro da janela restrita", () => {
    const longPeriod: MatchFormat = { periodCount: 1, periodMinutes: 30, overtimePeriodCount: 0, overtimeMinutes: 0 };
    const soloSpecialistWeights: PlayerSlotWeights = { p1: { Fixo: 5 }, p2: { "Ala Esquerda": 5 }, p3: { "Ala Direita": 4 }, p5: { Pivô: 5 } };
    const startPoint = { period: 1, elapsedSec: 320 };
    const options = generateRotationOptions([p1, p2, p3, p5], soloSpecialistWeights, noAvailability(), longPeriod, startPoint);
    for (const option of options) {
      for (const stint of option.stints) {
        expect(stint.endSec - stint.startSec).toBeLessThanOrEqual(MAX_STINT_SEC);
      }
      for (let slotIndex = 0; slotIndex < 4; slotIndex++) {
        const slotStints = option.stints.filter((s) => s.slotIndex === slotIndex).sort((a, b) => a.startSec - b.startSec);
        for (let i = 1; i < slotStints.length; i++) {
          expect(slotStints[i].playerId).not.toBe(slotStints[i - 1].playerId);
        }
      }
    }
  });

  it("startPoint exatamente no fim (ou depois) da parte não gera nenhum stint pra essa parte", () => {
    const startPoint = { period: 1, elapsedSec: PERIOD_SEC };
    const options = generateRotationOptions([p1, p2, p3, p4, p5], weights, noAvailability(), ONE_PERIOD, startPoint);
    for (const option of options) {
      expect(option.stints).toEqual([]);
    }
  });
});
