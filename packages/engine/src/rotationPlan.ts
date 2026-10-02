// Planeador de rotações — previsão de tempo em quadra e substituições a
// partir de quem foi convocado para o jogo. Ao contrário do resto do motor
// (sempre event-sourced, olhando para o que já aconteceu), isto é um plano
// hipotético pré-jogo: nunca lê nem escreve em MatchEvent, e vive numa
// tabela própria no Supabase — nunca em match_events.
import type { MatchFormat, Player } from "./types";

export interface RotationStint {
  playerId: string;
  /** 0..3 — vaga de linha que este turno ocupa (guarda-redes fica de fora da rotação). */
  slotIndex: number;
  period: number;
  startSec: number;
  endSec: number;
}

// Uma vaga por posição distinta entre os de linha (nunca mistura Ala com
// Pivô na mesma vaga) — não assume uma formação fixa (ex.: não sabe que
// "Ala" normalmente tem duas vagas em quadra simultâneas; se houver 3 Alas
// convocados, os 3 revezam numa vaga só). É só um ponto de partida: o
// treinador ajusta os instantes de troca depois; se quiser outro
// agrupamento, regenera o plano com outra convocação. Como só há 4 posições
// de linha possíveis, nunca passa de 4 vagas.
const POSITION_ORDER = ["Fixo", "Ala", "Pivô", "Universal"];

function groupIntoSlots(outfield: Player[]): Player[][] {
  const byPosition = new Map<string, Player[]>();
  outfield.forEach((p) => {
    const arr = byPosition.get(p.pos) ?? [];
    arr.push(p);
    byPosition.set(p.pos, arr);
  });
  return POSITION_ORDER.map((pos) => byPosition.get(pos) ?? []).filter((group) => group.length > 0);
}

/**
 * Gera o ponto de partida do plano: exclui guarda-redes (assume-se que jogam
 * a parte inteira, sem troca prevista), agrupa o resto em até 4 vagas, e
 * divide cada parte regular em fatias iguais e contíguas por vaga — os
 * limites de cada fatia são calculados independentemente a partir do índice
 * (nunca somando a fatia anterior), então nunca sobra nem falta um segundo
 * entre duas fatias vizinhas, mesmo quando a divisão não é exata (ex.: 3
 * atletas numa parte de 1500s → 500/500/500; com 1501s → 500/500/501, sem
 * criar um buraco de 1s em lugar nenhum). Não preenche prolongamento
 * automaticamente — fica para o treinador decidir se/como ajustar depois.
 */
export function generateRotationPlan(players: Player[], format: MatchFormat): RotationStint[] {
  const outfield = players.filter((p) => p.pos !== "Guarda-Redes");
  const slots = groupIntoSlots(outfield);
  const stints: RotationStint[] = [];

  for (let period = 1; period <= format.periodCount; period++) {
    const durSec = format.periodMinutes * 60;
    slots.forEach((slotPlayers, slotIndex) => {
      const n = slotPlayers.length;
      if (n === 0) return;
      slotPlayers.forEach((p, i) => {
        const startSec = Math.round((i * durSec) / n);
        const endSec = Math.round(((i + 1) * durSec) / n);
        if (endSec > startSec) stints.push({ playerId: p.id, slotIndex, period, startSec, endSec });
      });
    });
  }
  return stints;
}

/** O turno que um atleta deveria estar cumprindo num instante `atSec` da parte, se houver. */
export function currentStintFor(
  stints: RotationStint[],
  playerId: string,
  period: number,
  atSec: number
): RotationStint | null {
  return stints.find((s) => s.playerId === playerId && s.period === period && atSec >= s.startSec && atSec < s.endSec) ?? null;
}

/** O próximo turno previsto para a mesma vaga, a partir de `afterSec` (inclusive) — "quem entra depois". */
export function nextStintInSlot(
  stints: RotationStint[],
  slotIndex: number,
  period: number,
  afterSec: number
): RotationStint | null {
  const candidates = stints.filter((s) => s.slotIndex === slotIndex && s.period === period && s.startSec >= afterSec);
  if (!candidates.length) return null;
  return candidates.reduce((best, s) => (s.startSec < best.startSec ? s : best));
}

/** Total de segundos previstos por atleta, somando todas as partes. */
export function plannedSecondsByPlayer(stints: RotationStint[]): Record<string, number> {
  const out: Record<string, number> = {};
  stints.forEach((s) => {
    out[s.playerId] = (out[s.playerId] ?? 0) + (s.endSec - s.startSec);
  });
  return out;
}

/** Segundos previstos por atleta, abertos por parte — para a tabela "1ª/2ª/Total". */
export function plannedSecondsByPlayerPerPeriod(stints: RotationStint[]): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  stints.forEach((s) => {
    const byPeriod = out[s.playerId] ?? (out[s.playerId] = {});
    byPeriod[s.period] = (byPeriod[s.period] ?? 0) + (s.endSec - s.startSec);
  });
  return out;
}
