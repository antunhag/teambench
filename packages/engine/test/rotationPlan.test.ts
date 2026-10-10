import { describe, expect, it } from "vitest";
import {
  aptitudeLabel,
  currentStintFor,
  isStintFuture,
  nextStintInSlot,
  plannedSecondsByPlayer,
  plannedSecondsByPlayerPerPeriod,
  playerOverlapsOtherSlot,
  sortedAptitudeSlots,
  stintsAfetadosPorIndisponibilidade,
  stintsOverlap,
  type AptitudeBySlot,
  type RotationStint,
} from "../src/rotationPlan";
import type { AvailabilityStatus } from "../src/rotationSuggestion";

const ala1 = "p-ala1";
const ala2 = "p-ala2";
const fixo = "p-fixo";
const pivo = "p-pivo";

describe("stintsOverlap", () => {
  const existing: RotationStint[] = [{ playerId: ala1, slotIndex: 1, period: 1, startSec: 0, endSec: 750 }];

  it("detecta sobreposição na mesma vaga e parte", () => {
    expect(stintsOverlap(existing, 1, 1, 700, 900)).toBe(true);
    expect(stintsOverlap(existing, 1, 1, 750, 1500)).toBe(false); // encosta mas não sobrepõe
  });

  it("ignora vagas ou partes diferentes", () => {
    expect(stintsOverlap(existing, 2, 1, 0, 750)).toBe(false); // outra vaga
    expect(stintsOverlap(existing, 1, 2, 0, 750)).toBe(false); // outra parte
  });

  it("exclui o próprio turno da checagem ao editar", () => {
    const editing = existing[0];
    expect(stintsOverlap(existing, 1, 1, 0, 1500, editing)).toBe(false);
  });
});

describe("playerOverlapsOtherSlot", () => {
  const cartucho = "p-cartucho";
  const stints: RotationStint[] = [
    { playerId: cartucho, slotIndex: 2, period: 1, startSec: 300, endSec: 1200 }, // Ala Direita
  ];

  it("detecta o atleta escalado em outra vaga no mesmo horário", () => {
    const conflict = playerOverlapsOtherSlot(stints, cartucho, 1, 3, 0, 1800); // tentando Pivô, 0 a 1800
    expect(conflict?.slotIndex).toBe(2);
  });

  it("não conflita consigo mesmo na MESMA vaga — pode voltar pra ela mais tarde", () => {
    expect(playerOverlapsOtherSlot(stints, cartucho, 1, 2, 1200, 1800)).toBeNull();
  });

  it("ignora vagas que só encostam (sem sobreposição real) ou partes diferentes", () => {
    expect(playerOverlapsOtherSlot(stints, cartucho, 1, 3, 1200, 1800)).toBeNull(); // encosta no fim, não sobrepõe
    expect(playerOverlapsOtherSlot(stints, cartucho, 2, 3, 0, 1800)).toBeNull(); // outra parte
  });

  it("ignora outros atletas", () => {
    expect(playerOverlapsOtherSlot(stints, "p-outro", 1, 3, 0, 1800)).toBeNull();
  });
});

describe("currentStintFor / nextStintInSlot", () => {
  const stints: RotationStint[] = [
    { playerId: ala1, slotIndex: 1, period: 1, startSec: 0, endSec: 750 },
    { playerId: ala2, slotIndex: 1, period: 1, startSec: 750, endSec: 1500 },
  ];

  it("acha o turno vigente de um atleta num instante dado", () => {
    expect(currentStintFor(stints, ala1, 1, 100)?.playerId).toBe(ala1);
    expect(currentStintFor(stints, ala2, 1, 100)).toBeNull(); // ala2 só entra depois dos 750s
    expect(currentStintFor(stints, ala2, 1, 800)?.playerId).toBe(ala2);
  });

  it("acha o próximo turno da mesma vaga — quem deveria entrar a seguir", () => {
    const next = nextStintInSlot(stints, 1, 1, 750);
    expect(next?.playerId).toBe(ala2);
    expect(nextStintInSlot(stints, 1, 1, 1500)).toBeNull(); // não há mais ninguém depois do fim da parte
  });
});

describe("sortedAptitudeSlots", () => {
  it("vazio dá lista vazia — atleta sem vaga habitual cadastrada", () => {
    expect(sortedAptitudeSlots({})).toEqual([]);
  });

  it("ordena por qualidade — A, depois B, depois C, sem-classificação por último", () => {
    const bySlot: AptitudeBySlot = { Pivô: "C", Fixo: "A", "Ala Direita": null, "Ala Esquerda": "B" };
    expect(sortedAptitudeSlots(bySlot)).toEqual(["Fixo", "Ala Esquerda", "Pivô", "Ala Direita"]);
  });

  it("empate na qualidade mantém a ordem fixa de ROTATION_SLOT_TYPES", () => {
    const bySlot: AptitudeBySlot = { Pivô: "A", Fixo: "A" };
    expect(sortedAptitudeSlots(bySlot)).toEqual(["Fixo", "Pivô"]); // Fixo vem antes de Pivô em ROTATION_SLOT_TYPES
  });

  it("vaga ausente do objeto não aparece, mesmo que outras estejam classificadas", () => {
    const bySlot: AptitudeBySlot = { Fixo: "A" };
    expect(sortedAptitudeSlots(bySlot)).toEqual(["Fixo"]);
  });
});

describe("aptitudeLabel", () => {
  it("inclui a letra quando classificado", () => {
    expect(aptitudeLabel("Ala Esquerda", "A")).toBe("Ala Esquerda (A)");
  });

  it("mostra só o nome da vaga quando ainda sem classificação (null ou undefined)", () => {
    expect(aptitudeLabel("Pivô", null)).toBe("Pivô");
    expect(aptitudeLabel("Pivô", undefined)).toBe("Pivô");
  });
});

describe("isStintFuture", () => {
  it("parte depois do startPoint é sempre futuro, independente do segundo", () => {
    const stint: RotationStint = { playerId: ala1, slotIndex: 1, period: 2, startSec: 0, endSec: 300 };
    expect(isStintFuture(stint, { period: 1, elapsedSec: 1700 })).toBe(true);
  });

  it("parte antes do startPoint nunca é futuro", () => {
    const stint: RotationStint = { playerId: ala1, slotIndex: 1, period: 1, startSec: 1000, endSec: 1300 };
    expect(isStintFuture(stint, { period: 2, elapsedSec: 0 })).toBe(false);
  });

  it("mesma parte: futuro só se o turno começa no momento atual ou depois", () => {
    const antes: RotationStint = { playerId: ala1, slotIndex: 1, period: 1, startSec: 0, endSec: 300 };
    const agora: RotationStint = { playerId: ala1, slotIndex: 1, period: 1, startSec: 300, endSec: 600 };
    const depois: RotationStint = { playerId: ala1, slotIndex: 1, period: 1, startSec: 600, endSec: 900 };
    const startPoint = { period: 1, elapsedSec: 300 };
    expect(isStintFuture(antes, startPoint)).toBe(false);
    expect(isStintFuture(agora, startPoint)).toBe(true); // em andamento no momento atual conta como futuro (ainda não terminou)
    expect(isStintFuture(depois, startPoint)).toBe(true);
  });
});

describe("stintsAfetadosPorIndisponibilidade", () => {
  const indisponivel = "p-indisponivel";
  const disponivel = "p-disponivel";
  const stints: RotationStint[] = [
    { playerId: indisponivel, slotIndex: 0, period: 1, startSec: 0, endSec: 300 }, // já passado
    { playerId: indisponivel, slotIndex: 0, period: 1, startSec: 900, endSec: 1200 }, // futuro
    { playerId: indisponivel, slotIndex: 1, period: 2, startSec: 0, endSec: 300 }, // futuro (parte 2)
    { playerId: disponivel, slotIndex: 2, period: 1, startSec: 900, endSec: 1200 }, // futuro, mas atleta disponível
  ];
  const startPoint = { period: 1, elapsedSec: 300 };

  it("devolve só os turnos FUTUROS do atleta indisponível, agrupados por atleta", () => {
    const availability: Record<string, AvailabilityStatus> = { [indisponivel]: "indisponivel", [disponivel]: "apto" };
    const resultado = stintsAfetadosPorIndisponibilidade(stints, availability, startPoint);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].playerId).toBe(indisponivel);
    expect(resultado[0].stints).toHaveLength(2);
    expect(resultado[0].stints.every((s) => s.startSec >= 300 || s.period > 1)).toBe(true);
  });

  it("devolve vazio quando o atleta indisponível só aparece em turnos já passados", () => {
    const soTurnoPassado: RotationStint[] = [{ playerId: indisponivel, slotIndex: 0, period: 1, startSec: 0, endSec: 300 }];
    const availability: Record<string, AvailabilityStatus> = { [indisponivel]: "indisponivel" };
    expect(stintsAfetadosPorIndisponibilidade(soTurnoPassado, availability, startPoint)).toEqual([]);
  });

  it("devolve vazio quando nenhum atleta está indisponível", () => {
    const availability: Record<string, AvailabilityStatus> = { [indisponivel]: "apto", [disponivel]: "apto" };
    expect(stintsAfetadosPorIndisponibilidade(stints, availability, startPoint)).toEqual([]);
  });

  it("cobre múltiplos atletas indisponíveis ao mesmo tempo", () => {
    const availability: Record<string, AvailabilityStatus> = { [indisponivel]: "indisponivel", [disponivel]: "indisponivel" };
    const resultado = stintsAfetadosPorIndisponibilidade(stints, availability, startPoint);
    expect(resultado.map((r) => r.playerId).sort()).toEqual([disponivel, indisponivel].sort());
  });

  it("'a_retomar' nunca conta como indisponível — só 'indisponivel' dispara o aviso", () => {
    const availability: Record<string, AvailabilityStatus> = { [indisponivel]: "a_retomar" };
    expect(stintsAfetadosPorIndisponibilidade(stints, availability, startPoint)).toEqual([]);
  });
});

describe("plannedSecondsByPlayer / plannedSecondsByPlayerPerPeriod", () => {
  it("soma os segundos previstos por atleta, total e por parte", () => {
    const stints: RotationStint[] = [
      { playerId: fixo, slotIndex: 0, period: 1, startSec: 0, endSec: 1500 },
      { playerId: fixo, slotIndex: 0, period: 2, startSec: 0, endSec: 1500 },
      { playerId: pivo, slotIndex: 3, period: 1, startSec: 0, endSec: 1500 },
    ];
    expect(plannedSecondsByPlayer(stints)[fixo]).toBe(3000); // 2 partes de 1500s
    const perPeriod = plannedSecondsByPlayerPerPeriod(stints);
    expect(perPeriod[fixo][1]).toBe(1500);
    expect(perPeriod[fixo][2]).toBe(1500);
  });
});
