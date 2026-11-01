import type { MatchEvent } from "@teambench/engine";

/**
 * Há quanto tempo (s) um atleta do banco está fora, nesta parte — para o
 * mosaico do banco mostrar quem descansou mais (contracts/consola-visual.md,
 * decisão 8). Conta desde a última saída dele nesta parte (substituição ou
 * vermelho); se não saiu nesta parte (não jogou, ou saiu numa parte
 * anterior), está no banco desde o início da parte. Lógica pura.
 */
export function benchSeconds(events: MatchEvent[], playerId: string, period: number, elapsedMs: number): number {
  let saida: number | null = null;
  for (const e of events) {
    if (e.period !== period) continue;
    if (e.type === "substituicao" && e.outId === playerId) saida = e.ms;
    if (e.type === "substituicao" && e.playerId === playerId) saida = null;
  }
  const desde = saida ?? 0;
  return Math.max(0, Math.floor((elapsedMs - desde) / 1000));
}
