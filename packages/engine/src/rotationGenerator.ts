// Gera 3 opções de plano de rotação completo a partir de pesos por
// atleta/vaga (specs/004-rotation-plan-generation/) — pura, sem rede. Cada
// atleta ocupa só UMA vaga por geração (Decisão 5, research.md): a de maior
// peso ajustado, empate pela ordem fixa de ROTATION_SLOT_TYPES. O tempo de
// cada vaga/parte é dividido entre os atletas elegíveis proporcionalmente ao
// peso — igual nas 3 opções (Decisão 4) — e o que varia é em quantos turnos
// esse tempo se fragmenta: "Turnos longos" (1 turno por atleta sempre que
// possível), "Equilibrada" (quebra quem passa de metade da parte em 2),
// "Mais rotativa" (quebra em pedaços menores, mais trocas/descanso).
import { ROTATION_SLOT_TYPES, plannedSecondsByPlayer, type RotationSlotType, type RotationStint } from "./rotationPlan";
import type { AvailabilityStatus } from "./rotationSuggestion";
import type { MatchFormat, Player } from "./types";

/** Peso (1-5) por atleta, por vaga — vaga ausente do mapa do atleta = ele não concorre a ela nesta geração. */
export type PlayerSlotWeights = Record<string, Partial<Record<RotationSlotType, number>>>;

export interface RotationPlanOption {
  label: string;
  stints: RotationStint[];
  totalSecondsByPlayer: Record<string, number>;
}

const OPTION_CONFIGS: { label: string; stintFraction: number }[] = [
  { label: "Turnos longos", stintFraction: 1 },
  { label: "Equilibrada", stintFraction: 1 / 2 },
  { label: "Mais rotativa", stintFraction: 1 / 3 },
];

export function generateRotationOptions(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  availabilityByPlayer: Record<string, AvailabilityStatus>,
  format: MatchFormat
): RotationPlanOption[] {
  const available = players.filter((p) => availabilityByPlayer[p.id] !== "indisponivel");
  const assignment = assignSlots(available, weightsBySlot);

  return OPTION_CONFIGS.map(({ label, stintFraction }) => {
    const stints: RotationStint[] = [];
    const periodSec = format.periodMinutes * 60;
    const maxStintSec = Math.max(1, Math.round(periodSec * stintFraction));

    for (let period = 1; period <= format.periodCount; period++) {
      ROTATION_SLOT_TYPES.forEach((slot, slotIndex) => {
        const slotPlayers = assignment[slot];
        if (slotPlayers.length === 0) return;
        const targets = proportionalSeconds(
          periodSec,
          slotPlayers.map((p) => weightsBySlot[p.id]?.[slot] ?? 1)
        );
        stints.push(
          ...buildStints(
            slotPlayers.map((p, i) => ({ playerId: p.id, targetSec: targets[i] })),
            maxStintSec,
            period,
            slotIndex
          )
        );
      });
    }

    return { label, stints, totalSecondsByPlayer: plannedSecondsByPlayer(stints) };
  });
}

/** Cada atleta disponível vai pra sua vaga de maior peso — nunca mais de uma vaga por geração (Decisão 5). */
function assignSlots(players: Player[], weightsBySlot: PlayerSlotWeights): Record<RotationSlotType, Player[]> {
  const bySlot = Object.fromEntries(ROTATION_SLOT_TYPES.map((s) => [s, [] as Player[]])) as Record<RotationSlotType, Player[]>;
  const unassigned: Player[] = [];

  for (const p of players) {
    let bestSlot: RotationSlotType | null = null;
    let bestWeight = 0;
    for (const slot of ROTATION_SLOT_TYPES) {
      const w = weightsBySlot[p.id]?.[slot] ?? 0;
      if (w > bestWeight) {
        bestWeight = w;
        bestSlot = slot;
      }
    }
    if (bestSlot) bySlot[bestSlot].push(p);
    else unassigned.push(p);
  }

  // Nunca deixa uma vaga vazia só por falta de peso cadastrado pra ela (Edge Cases, spec.md)
  // — pede emprestado da vaga com mais gente, ou usa quem ficou de fora por completo.
  for (const slot of ROTATION_SLOT_TYPES) {
    if (bySlot[slot].length > 0) continue;
    const donor = [...ROTATION_SLOT_TYPES]
      .filter((s) => bySlot[s].length > 1)
      .sort((a, b) => bySlot[b].length - bySlot[a].length)[0];
    if (donor) {
      const weakest = [...bySlot[donor]].sort(
        (a, b) => (weightsBySlot[a.id]?.[donor] ?? 0) - (weightsBySlot[b.id]?.[donor] ?? 0)
      )[0];
      bySlot[donor] = bySlot[donor].filter((p) => p.id !== weakest.id);
      bySlot[slot].push(weakest);
    } else if (unassigned.length > 0) {
      bySlot[slot].push(unassigned.shift()!);
    }
  }

  return bySlot;
}

/** Reparte `totalSec` entre `weights` proporcionalmente, por maior resto — soma sempre bate exatamente com `totalSec`. */
function proportionalSeconds(totalSec: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (totalSec * w) / sumWeights);
  const floors = raw.map(Math.floor);
  const remainder = totalSec - floors.reduce((a, b) => a + b, 0);
  const byFracDesc = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[byFracDesc[k % byFracDesc.length].i] += 1;
  }
  return result;
}

/** Quebra um alvo de segundos em pedaços de no máximo `maxStintSec` — último pedaço fica com o resto. */
function chunksFor(targetSec: number, maxStintSec: number): number[] {
  const chunks: number[] = [];
  let remaining = targetSec;
  while (remaining > maxStintSec) {
    chunks.push(maxStintSec);
    remaining -= maxStintSec;
  }
  if (remaining > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Intercala os pedaços de cada atleta (round-robin, um pedaço de cada por vez) e
 * encaixa tudo sequencialmente na vaga/parte — cobre o período inteiro sem buraco
 * nem sobreposição, e cria descanso entre os pedaços do mesmo atleta sempre que ele
 * tem mais de um (os pedaços de outros atletas ficam entre eles na linha do tempo).
 */
function buildStints(
  targets: { playerId: string; targetSec: number }[],
  maxStintSec: number,
  period: number,
  slotIndex: number
): RotationStint[] {
  const queues = targets.map((t) => chunksFor(t.targetSec, maxStintSec));
  const idx = targets.map(() => 0);
  const chunks: { playerId: string; sec: number }[] = [];
  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (let i = 0; i < targets.length; i++) {
      if (idx[i] < queues[i].length) {
        chunks.push({ playerId: targets[i].playerId, sec: queues[i][idx[i]] });
        idx[i]++;
        anyLeft = true;
      }
    }
  }

  let cursor = 0;
  return chunks.map((c) => {
    const stint: RotationStint = { playerId: c.playerId, slotIndex, period, startSec: cursor, endSec: cursor + c.sec };
    cursor += c.sec;
    return stint;
  });
}
