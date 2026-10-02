import { describe, expect, it } from "vitest";
import {
  currentStintFor,
  generateRotationPlan,
  nextStintInSlot,
  plannedSecondsByPlayer,
  plannedSecondsByPlayerPerPeriod,
} from "../src/rotationPlan";
import type { MatchFormat, Player } from "../src/types";

const FORMAT: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

const gr: Player = { id: "p-gr", num: "1", name: "Rafael", pos: "Guarda-Redes" };
const fixo: Player = { id: "p-fixo", num: "4", name: "Dani", pos: "Fixo" };
const ala1: Player = { id: "p-ala1", num: "6", name: "Felipe", pos: "Ala" };
const ala2: Player = { id: "p-ala2", num: "7", name: "Dinis", pos: "Ala" };
const pivo: Player = { id: "p-pivo", num: "19", name: "Cartucho", pos: "Pivô" };

describe("generateRotationPlan", () => {
  it("nunca gera turno para o guarda-redes — assume-se a parte inteira, sem troca prevista", () => {
    const stints = generateRotationPlan([gr, fixo, ala1], FORMAT);
    expect(stints.some((s) => s.playerId === gr.id)).toBe(false);
  });

  it("divide a parte em fatias iguais e contíguas por vaga, cobrindo a parte inteira sem buraco", () => {
    // fixo e ala1 caem em vagas diferentes (posições diferentes) — cada um sozinho na própria vaga,
    // então cada um cobre a parte inteira (1500s) na própria vaga.
    const stints = generateRotationPlan([fixo, ala1], FORMAT);
    const fixoStints = stints.filter((s) => s.playerId === fixo.id && s.period === 1);
    expect(fixoStints).toEqual([{ playerId: fixo.id, slotIndex: 0, period: 1, startSec: 0, endSec: 1500 }]);
  });

  it("REGRESSÃO — divisão não-exata nunca perde nem sobra um segundo entre fatias vizinhas (mesmo cuidado que fmtMinSec)", () => {
    // ala1 e ala2 têm a mesma posição — caem na mesma vaga e revezam.
    const stints = generateRotationPlan([ala1, ala2], FORMAT);
    const slot1Period1 = stints.filter((s) => s.period === 1).sort((a, b) => a.startSec - b.startSec);
    expect(slot1Period1).toHaveLength(2);
    expect(slot1Period1[0].startSec).toBe(0);
    expect(slot1Period1[0].endSec).toBe(slot1Period1[1].startSec); // contíguo — sem buraco nem sobreposição
    expect(slot1Period1[1].endSec).toBe(1500); // cobre a parte inteira (25min = 1500s)
  });

  it("gera turnos para todas as partes regulares do formato, sem preencher prolongamento", () => {
    const stints = generateRotationPlan([fixo], FORMAT);
    expect(new Set(stints.map((s) => s.period))).toEqual(new Set([1, 2]));
  });
});

describe("currentStintFor / nextStintInSlot", () => {
  const stints = generateRotationPlan([ala1, ala2], FORMAT); // revezam na mesma vaga, 750s cada

  it("acha o turno vigente de um atleta num instante dado", () => {
    expect(currentStintFor(stints, ala1.id, 1, 100)?.playerId).toBe(ala1.id);
    expect(currentStintFor(stints, ala2.id, 1, 100)).toBeNull(); // ala2 só entra depois dos 750s
    expect(currentStintFor(stints, ala2.id, 1, 800)?.playerId).toBe(ala2.id);
  });

  it("acha o próximo turno da mesma vaga — quem deveria entrar a seguir", () => {
    const next = nextStintInSlot(stints, 0, 1, 750);
    expect(next?.playerId).toBe(ala2.id);
    expect(nextStintInSlot(stints, 0, 1, 1500)).toBeNull(); // não há mais ninguém depois do fim da parte
  });
});

describe("plannedSecondsByPlayer / plannedSecondsByPlayerPerPeriod", () => {
  it("soma os segundos previstos por atleta, total e por parte", () => {
    const stints = generateRotationPlan([fixo, pivo], FORMAT); // cada um sozinho na própria vaga, 1500s por parte
    expect(plannedSecondsByPlayer(stints)[fixo.id]).toBe(3000); // 2 partes de 1500s
    const perPeriod = plannedSecondsByPlayerPerPeriod(stints);
    expect(perPeriod[fixo.id][1]).toBe(1500);
    expect(perPeriod[fixo.id][2]).toBe(1500);
  });
});
