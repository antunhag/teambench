// Contabilidade de tempo em campo por jogador.
//
// Porta direta de nowElapsedMs/settlePlayer/settleAll/markOnSince do
// banco.html original, com uma mudança deliberada: em vez de mutar um objeto
// `state` global por closure, cada função aqui recebe o estado e devolve um
// novo estado (imutável) — é o que torna isto testável isoladamente, sem
// precisar simular a app inteira.
import type { ClockAccounting } from "./types";

export interface ClockState {
  running: boolean;
  elapsedMs: number;
  startTs: number | null;
}

export function createClockAccounting(): ClockAccounting {
  return { secondsPlayed: {}, onCourtSince: {} };
}

/** Tempo decorrido "agora" no relógio de jogo (não no relógio da parede). */
export function nowElapsedMs(clock: ClockState, nowMs: number): number {
  if (clock.running && clock.startTs != null) {
    return clock.elapsedMs + (nowMs - clock.startTs);
  }
  return clock.elapsedMs;
}

/** Segundos jogados por um atleta até `nowMs`, incluindo o tempo em campo agora, se estiver. */
export function playerSeconds(acc: ClockAccounting, playerId: string, nowMs: number): number {
  let base = acc.secondsPlayed[playerId] || 0;
  const since = acc.onCourtSince[playerId];
  if (since != null) {
    base += Math.max(0, nowMs - since) / 1000;
  }
  return base;
}

/** Assenta o tempo em campo de UM atleta até `atMs` (ex.: ao sair, ao pausar). Sem efeito se ele não estava marcado como "em campo desde". */
export function settlePlayer(acc: ClockAccounting, playerId: string, atMs: number): ClockAccounting {
  const since = acc.onCourtSince[playerId];
  if (since == null) return acc;
  const secondsPlayed = {
    ...acc.secondsPlayed,
    [playerId]: (acc.secondsPlayed[playerId] || 0) + Math.max(0, atMs - since) / 1000,
  };
  const onCourtSince = { ...acc.onCourtSince };
  delete onCourtSince[playerId];
  return { secondsPlayed, onCourtSince };
}

/** Assenta o tempo em campo de TODOS os atletas na lista `onCourt` até `atMs`. */
export function settleAll(acc: ClockAccounting, onCourt: string[], atMs: number): ClockAccounting {
  return onCourt.reduce((next, id) => settlePlayer(next, id, atMs), acc);
}

/** Marca um atleta como "em campo desde" `atMs` (ex.: ao entrar, ao retomar o relógio). */
export function markOnSince(acc: ClockAccounting, playerId: string, atMs: number): ClockAccounting {
  return { ...acc, onCourtSince: { ...acc.onCourtSince, [playerId]: atMs } };
}

/**
 * Pedido de tempo [pauseStartMs, endMs]: o tempo da pausa não conta para
 * ninguém — o jogo tem os mesmos minutos efetivos com ou sem pedidos de
 * tempo. Para quem está em quadra no FIM da pausa, desconta só a parte dela
 * em que já estava em quadra: quem lá estava desde antes perde a pausa
 * inteira; quem entrou durante a pausa começa a contar no recomeço (`endMs`).
 * Achado real (jogo do Caxinas): uma troca feita durante o pedido de tempo
 * tirava a pausa inteira a quem entrou e não a tirava a quem saiu.
 */
export function discountPause(acc: ClockAccounting, onCourt: string[], pauseStartMs: number, endMs: number): ClockAccounting {
  const onCourtSince = { ...acc.onCourtSince };
  for (const id of onCourt) {
    const since = onCourtSince[id];
    if (since == null) continue;
    onCourtSince[id] = since <= pauseStartMs ? since + Math.max(0, endMs - pauseStartMs) : Math.max(since, endMs);
  }
  return { ...acc, onCourtSince };
}

/**
 * Assenta o tempo de quem SAI durante um pedido de tempo que começou em
 * `pauseStartMs`: o tempo dele acaba no início da pausa (ou é zero, se
 * entrou já durante ela) — a parte da pausa nunca lhe conta.
 */
export function settlePlayerDuringPause(acc: ClockAccounting, playerId: string, atMs: number, pauseStartMs: number): ClockAccounting {
  const since = acc.onCourtSince[playerId];
  if (since == null) return acc;
  return settlePlayer(acc, playerId, Math.min(atMs, Math.max(pauseStartMs, since)));
}
