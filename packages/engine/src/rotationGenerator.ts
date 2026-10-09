// Gera 3 opções de plano de rotação completo a partir de pesos por
// atleta/vaga (specs/004-rotation-plan-generation/) — pura, sem rede. O jogo
// é dividido em janelas fixas de 5 minutos (teto pedido pelo treinador — uma
// vaga nunca segura o mesmo atleta por mais que isso SEM reavaliar); a cada
// janela, decide de uma vez quem entra em cada uma das 4 vagas. Um atleta
// com peso em mais de uma vaga pode ser escolhido ora numa, ora noutra — ele
// RODA DE POSIÇÃO dentro do próprio jogo, não fica preso a uma vaga só.
//
// As 3 opções NÃO são 3 tamanhos de turno — são 3 FILOSOFIAS de rotação
// (Decisão 7, specs/004-rotation-plan-generation/research.md): quanto tempo
// SEGUIDO um atleta pode segurar a mesma vaga antes da pressão pra trocar
// ficar grande o bastante pra vencer qualquer vantagem de peso. Isso garante
// que mesmo o atleta claramente melhor numa vaga segura a maior parte do
// tempo (peso ainda manda), mas ninguém trava um lugar o jogo inteiro —
// todo mundo que tem alguma aptidão ali acaba entrando de verdade.
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

/** Janela fixa pras 3 opções — nunca mais que isso sem reavaliar quem está na vaga. */
const WINDOW_SEC = 5 * 60;
/** Só pesa pra decidir ENTRE pesos parecidos (ex.: 4 vs. 5) — nunca derruba um peso claramente maior sozinho. */
const REPEAT_PENALTY = 2;
/** Maior que qualquer diferença de peso possível (escala 1-5) — garante a troca quando o limite de janelas seguidas estoura. */
const FORCE_OUT_PENALTY = 10;

/** Quantas janelas SEGUIDAS um atleta pode segurar a mesma vaga antes de ser forçado a sair, mesmo tendo o maior peso. */
const OPTION_CONFIGS: { label: string; streakLimit: number }[] = [
  { label: "Foco nos mais aptos", streakLimit: 3 }, // até 15 min seguidos antes de ceder
  { label: "Equilibrada", streakLimit: 2 }, // até 10 min seguidos
  { label: "Dá minutos a todos", streakLimit: 1 }, // nunca mais que 5 min seguidos, nem pro melhor
];

export function generateRotationOptions(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  availabilityByPlayer: Record<string, AvailabilityStatus>,
  format: MatchFormat
): RotationPlanOption[] {
  const available = players.filter((p) => availabilityByPlayer[p.id] !== "indisponivel");

  return OPTION_CONFIGS.map(({ label, streakLimit }) => {
    const stints: RotationStint[] = [];
    const periodSec = format.periodMinutes * 60;
    for (let period = 1; period <= format.periodCount; period++) {
      stints.push(...scheduleWindowed(available, weightsBySlot, periodSec, streakLimit, period));
    }
    return { label, stints, totalSecondsByPlayer: plannedSecondsByPlayer(stints) };
  });
}

/**
 * Preenche um período inteiro, janela de 5 min por janela — em cada uma,
 * decide de uma vez só quem entra em cada uma das 4 vagas (nunca vaga por
 * vaga em sequência).
 */
function scheduleWindowed(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  periodSec: number,
  streakLimit: number,
  period: number
): RotationStint[] {
  const accumulated: Record<string, number> = {};
  // Vaga que o atleta ocupou na janela IMEDIATAMENTE anterior — null se ficou de fora.
  let lastSlot: Record<string, RotationSlotType | null> = {};
  // Quantas janelas SEGUIDAS (sem interrupção) o atleta já está nessa mesma vaga.
  let streak: Record<string, number> = {};
  players.forEach((p) => {
    accumulated[p.id] = 0;
    lastSlot[p.id] = null;
    streak[p.id] = 0;
  });

  const stints: RotationStint[] = [];
  let cursor = 0;
  while (cursor < periodSec) {
    const windowEnd = Math.min(periodSec, cursor + WINDOW_SEC);
    const assignments = assignWindow(players, weightsBySlot, lastSlot, streak, accumulated, streakLimit);

    const nextLastSlot: Record<string, RotationSlotType | null> = {};
    const nextStreak: Record<string, number> = {};
    players.forEach((p) => {
      nextLastSlot[p.id] = null;
      nextStreak[p.id] = 0;
    });
    assignments.forEach(({ slotIndex, playerId }) => {
      const slot = ROTATION_SLOT_TYPES[slotIndex];
      nextLastSlot[playerId] = slot;
      nextStreak[playerId] = lastSlot[playerId] === slot ? streak[playerId] + 1 : 1;
      accumulated[playerId] += windowEnd - cursor;
      stints.push({ playerId, slotIndex, period, startSec: cursor, endSec: windowEnd });
    });
    lastSlot = nextLastSlot;
    streak = nextStreak;

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

/**
 * Decide, pra UMA janela, quem entra em cada uma das 4 vagas — uma
 * correspondência gulosa só, olhando todas as vagas de uma vez: entre os
 * pares (vaga, atleta), sempre fecha primeiro o de maior peso efetivo. Peso
 * efetivo = peso cadastrado pra essa vaga, com um desconto se o atleta
 * acabou de vir dela — pequeno enquanto ele não estourou o limite de janelas
 * seguidas (só decide entre pesos parecidos), grande o bastante pra forçar a
 * troca assim que estoura (nunca derrotado por peso nenhum, dado que a
 * escala de peso vai só até 5). Empate de peso efetivo é desfeito por quem
 * acumulou menos tempo até agora — nunca sorteio, sempre determinístico pro
 * mesmo conjunto de pesos.
 */
function assignWindow(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  lastSlot: Record<string, RotationSlotType | null>,
  streak: Record<string, number>,
  accumulated: Record<string, number>,
  streakLimit: number
): { slotIndex: number; playerId: string }[] {
  const filledSlot = new Array(ROTATION_SLOT_TYPES.length).fill(false);
  const usedPlayer = new Set<string>();
  const result: { slotIndex: number; playerId: string }[] = [];

  const pairs: SlotPlayerPair[] = ROTATION_SLOT_TYPES.flatMap((slot, slotIndex) =>
    players.map((player) => {
      const rawWeight = weightsBySlot[player.id]?.[slot] ?? 1;
      let effectiveWeight = rawWeight;
      if (lastSlot[player.id] === slot) {
        effectiveWeight -= streak[player.id] >= streakLimit ? FORCE_OUT_PENALTY : REPEAT_PENALTY;
      }
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
