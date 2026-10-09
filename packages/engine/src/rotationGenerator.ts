// Gera 3 opções de plano de rotação completo a partir de pesos por
// atleta/vaga (specs/004-rotation-plan-generation/) — pura, sem rede. O jogo
// é dividido em janelas de tempo (no máximo 5 minutos — pedido direto do
// treinador, pra forçar rodízio real em vez de turnos longos parados numa
// vaga só); a cada janela, escolhe quem entra em cada vaga. Um atleta com
// peso em mais de uma vaga pode ser escolhido ora numa, ora noutra — ele
// RODA DE POSIÇÃO dentro do próprio jogo, não fica preso a uma vaga só
// (revisão de 2026-10, substitui a versão anterior que travava cada atleta
// numa única vaga por geração).
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

/** Nunca ultrapassado em NENHUMA das 3 opções — pedido explícito do treinador. */
const MAX_STINT_SEC = 5 * 60;
/** As 3 opções variam só no tamanho da janela (todas ≤ MAX_STINT_SEC) — janela menor = troca mais frequente. */
const OPTION_WINDOW_SECONDS = [5 * 60, 3 * 60, 2 * 60];
const OPTION_LABELS = ["Até 5 minutos por turno", "Até 3 minutos por turno", "Até 2 minutos por turno"];

export function generateRotationOptions(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  availabilityByPlayer: Record<string, AvailabilityStatus>,
  format: MatchFormat
): RotationPlanOption[] {
  const available = players.filter((p) => availabilityByPlayer[p.id] !== "indisponivel");

  return OPTION_WINDOW_SECONDS.map((windowSec, i) => {
    const stints: RotationStint[] = [];
    const periodSec = format.periodMinutes * 60;
    for (let period = 1; period <= format.periodCount; period++) {
      stints.push(...scheduleWindowed(available, weightsBySlot, periodSec, Math.min(windowSec, MAX_STINT_SEC), period));
    }
    return { label: OPTION_LABELS[i], stints, totalSecondsByPlayer: plannedSecondsByPlayer(stints) };
  });
}

/**
 * Preenche um período inteiro, janela por janela — em cada janela, decide
 * de uma vez só quem entra em cada uma das 4 vagas (nunca vaga por vaga em
 * sequência: um atleta bloqueado numa vaga por já ter vindo dela precisa
 * poder "tentar" outra vaga onde também tem peso ANTES de alguém decidir
 * por ele — é isso que produz o rodízio de posição de verdade).
 */
function scheduleWindowed(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  periodSec: number,
  windowSec: number,
  period: number
): RotationStint[] {
  const accumulated: Record<string, number> = {};
  // Vaga que o atleta ocupou na janela IMEDIATAMENTE anterior — null se ficou de fora.
  // Reconstruído do zero a cada janela (nunca "última vez que jogou alguma coisa"): quem
  // fica de fora de uma janela não pode continuar bloqueado pra sempre na janela seguinte.
  let lastSlot: Record<string, RotationSlotType | null> = {};
  players.forEach((p) => {
    accumulated[p.id] = 0;
    lastSlot[p.id] = null;
  });

  const stints: RotationStint[] = [];
  let cursor = 0;
  while (cursor < periodSec) {
    const windowEnd = Math.min(periodSec, cursor + windowSec);
    const assignments = assignWindow(players, weightsBySlot, lastSlot, accumulated);

    const nextLastSlot: Record<string, RotationSlotType | null> = {};
    players.forEach((p) => {
      nextLastSlot[p.id] = null;
    });
    assignments.forEach(({ slotIndex, playerId }) => {
      nextLastSlot[playerId] = ROTATION_SLOT_TYPES[slotIndex];
      accumulated[playerId] += windowEnd - cursor;
      stints.push({ playerId, slotIndex, period, startSec: cursor, endSec: windowEnd });
    });
    lastSlot = nextLastSlot;

    cursor = windowEnd;
  }

  return stints;
}

interface SlotPlayerPair {
  slotIndex: number;
  player: Player;
  effectiveWeight: number;
  accumulated: number;
}

/** Só pesa na hora de decidir ENTRE pesos parecidos (ex.: 4 vs. 5) — nunca derruba um peso claramente maior (ex.: 5 vs. 1). */
const REPEAT_PENALTY = 2;

/**
 * Decide, pra UMA janela, quem entra em cada uma das 4 vagas — uma
 * correspondência gulosa só, olhando todas as vagas de uma vez (nunca vaga
 * por vaga isolada): entre os pares (vaga, atleta), sempre fecha primeiro o
 * de maior peso efetivo — peso cadastrado pra essa vaga, com um desconto
 * pequeno se o atleta acabou de vir dessa mesma vaga na janela anterior
 * (gera rodízio entre atletas de peso PARECIDO, sem nunca tirar quem é
 * claramente o melhor pra pôr alguém de peso bem menor só por pôr — ver
 * feedback real do treinador em specs/004-rotation-plan-generation/research.md,
 * Decisão 4). Empate de peso efetivo é desfeito por quem acumulou menos
 * tempo até agora (justiça entre pesos iguais) — nunca sorteio, sempre
 * determinístico pro mesmo conjunto de pesos.
 */
function assignWindow(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  lastSlot: Record<string, RotationSlotType | null>,
  accumulated: Record<string, number>
): { slotIndex: number; playerId: string }[] {
  const filledSlot = new Array(ROTATION_SLOT_TYPES.length).fill(false);
  const usedPlayer = new Set<string>();
  const result: { slotIndex: number; playerId: string }[] = [];

  const pairs: SlotPlayerPair[] = ROTATION_SLOT_TYPES.flatMap((slot, slotIndex) =>
    players.map((player) => {
      const rawWeight = weightsBySlot[player.id]?.[slot] ?? 1;
      const effectiveWeight = lastSlot[player.id] === slot ? rawWeight - REPEAT_PENALTY : rawWeight;
      return { slotIndex, player, effectiveWeight, accumulated: accumulated[player.id] };
    })
  );

  pairs
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight || a.accumulated - b.accumulated)
    .forEach(({ slotIndex, player }) => {
      if (filledSlot[slotIndex] || usedPlayer.has(player.id)) return;
      filledSlot[slotIndex] = true;
      usedPlayer.add(player.id);
      result.push({ slotIndex, playerId: player.id });
    });

  return result;
}
