// Gera 3 opções de plano de rotação completo a partir de pesos por
// atleta/vaga (specs/004-rotation-plan-generation/) — pura, sem rede. O jogo
// é dividido em janelas fixas de 5 minutos (teto pedido pelo treinador); a
// cada janela, decide de uma vez quem entra em cada uma das 4 vagas. Um
// atleta com peso em mais de uma vaga pode ser escolhido ora numa, ora
// noutra — ele RODA DE POSIÇÃO dentro do próprio jogo, não fica preso a uma
// vaga só, podendo somar mais de 5 min "em quadra" trocando entre vagas.
//
// Nenhuma vaga segura o MESMO atleta por mais de uma janela seguida, em
// NENHUMA das 3 opções (Decisão 8, specs/004-rotation-plan-generation/
// research.md) — teto de 5 min por permanência contínua numa vaga é
// absoluto, nunca negociável. O que varia entre as 3 opções é quanto tempo
// (em janelas) um atleta que acabou de sair de uma vaga fica "esfriando"
// antes de poder voltar a competir por ela em pé de igualdade: um esfriamento
// curto deixa os 2-3 mais aptos ali alternando quase só entre eles; um
// esfriamento longo abre espaço de verdade pra quem tem menos aptidão também
// jogar ali, não só nos minutos que sobram.
import { ROTATION_SLOT_TYPES, plannedSecondsByPlayer, type RotationSlotType, type RotationStartPoint, type RotationStint } from "./rotationPlan";
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
/**
 * Só pesa pra decidir ENTRE pesos parecidos (ex.: 4 vs. 5, empata e desfaz por tempo acumulado) —
 * tem que ficar em 1: qualquer coisa maior derrubaria um peso real (ex.: 2, "alguma confiança")
 * pra ABAIXO do padrão de quem não tem peso nenhum ali (1), violando a garantia de que peso real
 * nunca perde pro padrão só por causa do mecanismo de repetição (mesmo princípio da Decisão 6).
 */
const COOLDOWN_PENALTY = 1;
/** Maior que qualquer diferença de peso possível (escala 1-5) — garante a troca na janela logo seguinte, sempre. */
const FORCE_OUT_PENALTY = 10;

/** Quantas janelas de "esfriamento" depois de sair de uma vaga até poder voltar a competir por ela em pé de igualdade. */
const OPTION_CONFIGS: { label: string; cooldownWindows: number }[] = [
  { label: "Foco nos mais aptos", cooldownWindows: 1 }, // volta em força assim que passa 1 janela fora
  { label: "Equilibrada", cooldownWindows: 2 },
  { label: "Dá minutos a todos", cooldownWindows: 4 }, // fica mais tempo "esfriando", abre espaço pra mais gente
];

/**
 * `startPoint` opcional — ausente (ou undefined) gera o jogo inteiro desde o
 * período 1, minuto 0, EXATAMENTE como sempre (nunca muda o plano pré-jogo,
 * ver teste de regressão). Presente, gera só a partir dali: períodos
 * inteiramente anteriores a `startPoint.period` não produzem nenhum stint (a
 * UI é quem preserva os turnos já jogados, reaproveitando-os sem alteração —
 * ver `isStintFuture`/Decisão 4, specs/006-live-rotation-replan/research.md),
 * e o período de `startPoint.period` começa a janela em
 * `startPoint.elapsedSec` em vez de 0.
 */
export function generateRotationOptions(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  availabilityByPlayer: Record<string, AvailabilityStatus>,
  format: MatchFormat,
  startPoint?: RotationStartPoint
): RotationPlanOption[] {
  const available = players.filter((p) => availabilityByPlayer[p.id] !== "indisponivel");

  return OPTION_CONFIGS.map(({ label, cooldownWindows }) => {
    const stints: RotationStint[] = [];
    const periodSec = format.periodMinutes * 60;
    for (let period = 1; period <= format.periodCount; period++) {
      if (startPoint && period < startPoint.period) continue; // período inteiro já no passado — nada a gerar
      const startSec = startPoint && period === startPoint.period ? startPoint.elapsedSec : 0;
      if (startSec >= periodSec) continue; // ponto de início já no fim (ou depois) da parte
      stints.push(...scheduleWindowed(available, weightsBySlot, periodSec, cooldownWindows, period, startSec));
    }
    return { label, stints, totalSecondsByPlayer: plannedSecondsByPlayer(stints) };
  });
}

/**
 * Preenche um período inteiro (ou só a janela restante, a partir de
 * `startSec`), janela de 5 min por janela — em cada uma, decide de uma vez só
 * quem entra em cada uma das 4 vagas (nunca vaga por vaga em sequência).
 * `startSec` vira o novo "zero" da sequência de janelas desta chamada —
 * cooldown/force-out contam a partir daqui, nunca em relação ao início real
 * da parte (cada geração é sempre independente, mesmo princípio já usado
 * entre partes diferentes).
 */
function scheduleWindowed(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  periodSec: number,
  cooldownWindows: number,
  period: number,
  startSec = 0
): RotationStint[] {
  const accumulated: Record<string, number> = {};
  // Por atleta, por vaga: índice da ÚLTIMA janela em que ele ocupou aquela vaga — ausente se nunca ocupou.
  const lastHeldWindow: Record<string, Partial<Record<RotationSlotType, number>>> = {};
  players.forEach((p) => {
    accumulated[p.id] = 0;
    lastHeldWindow[p.id] = {};
  });

  const stints: RotationStint[] = [];
  let cursor = startSec;
  let windowIndex = 0;
  while (cursor < periodSec) {
    const windowEnd = Math.min(periodSec, cursor + WINDOW_SEC);
    const assignments = assignWindow(players, weightsBySlot, lastHeldWindow, windowIndex, accumulated, cooldownWindows);

    assignments.forEach(({ slotIndex, playerId }) => {
      const slot = ROTATION_SLOT_TYPES[slotIndex];
      lastHeldWindow[playerId][slot] = windowIndex;
      accumulated[playerId] += windowEnd - cursor;
      stints.push({ playerId, slotIndex, period, startSec: cursor, endSec: windowEnd });
    });

    cursor = windowEnd;
    windowIndex++;
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
 * ocupou essa MESMA vaga recentemente: se foi na janela IMEDIATAMENTE
 * anterior, o desconto é grande o bastante pra forçar a troca sempre (nunca
 * vencido por peso nenhum, dado que a escala vai só até 5) — é o que garante
 * o teto de 5 min seguidos, igual nas 3 opções. Se foi há mais de 1 janela
 * mas ainda dentro do "esfriamento" da opção, o desconto é pequeno (só
 * decide entre pesos parecidos). Fora da janela de esfriamento, volta ao
 * peso cheio. Empate de peso efetivo é desfeito por quem acumulou menos
 * tempo até agora — nunca sorteio, sempre determinístico pro mesmo conjunto
 * de pesos.
 */
function assignWindow(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  lastHeldWindow: Record<string, Partial<Record<RotationSlotType, number>>>,
  windowIndex: number,
  accumulated: Record<string, number>,
  cooldownWindows: number
): { slotIndex: number; playerId: string }[] {
  const filledSlot = new Array(ROTATION_SLOT_TYPES.length).fill(false);
  const usedPlayer = new Set<string>();
  const result: { slotIndex: number; playerId: string }[] = [];

  const pairs: SlotPlayerPair[] = ROTATION_SLOT_TYPES.flatMap((slot, slotIndex) =>
    players.map((player) => {
      const rawWeight = weightsBySlot[player.id]?.[slot] ?? 1;
      const lastWindow = lastHeldWindow[player.id]?.[slot];
      const windowsSince = lastWindow === undefined ? Infinity : windowIndex - lastWindow;
      let effectiveWeight = rawWeight;
      if (windowsSince === 1) {
        effectiveWeight -= FORCE_OUT_PENALTY;
      } else if (windowsSince > 1 && windowsSince <= cooldownWindows) {
        effectiveWeight -= COOLDOWN_PENALTY;
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
