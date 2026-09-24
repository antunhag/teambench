// Orquestração do jogo ao vivo — porta das funções de ação do banco.html
// (resumeOrStart, doPause, doGoal, doCard, doFoul, doSub, endPeriod, etc.),
// reescritas como funções puras: recebem o estado e devolvem um novo estado,
// nunca mutam nada por fora. Isso é o que torna esta camada testável sem
// precisar simular a interface, e é também o que a torna segura para rodar
// tanto localmente offline quanto (no futuro) num worker de sincronização.
import { createClockAccounting, markOnSince, nowElapsedMs as clockNowElapsedMs, playerSeconds, settleAll, settlePlayer } from "./clock";
import type { ClockState } from "./clock";
import { createEvent, recomputeScoreFor } from "./events";
import { isLastPeriod } from "./matchFormat";
import type { ClockAccounting, MatchEvent, MatchFormat, Score } from "./types";

export interface Treatment {
  playerId: string;
  startedAtMs: number;
}

export interface LiveMatchState {
  convocadoIds: string[];
  onCourt: string[];
  titularIds: string[];
  clock: ClockState;
  period: number;
  events: MatchEvent[];
  score: Score;
  treatment: Treatment | null;
  periodFouls: number;
  /** Faltas sofridas pelos nossos jogadores (cometidas pelo adversário) na parte atual. */
  periodFoulsAdvers: number;
  clockAcc: ClockAccounting;
  started: boolean;
  /** Verdadeiro depois de terminar a última parte do formato configurado (regulares + prolongamento). */
  finished: boolean;
}

export function createLiveMatchState(convocadoIds: string[] = []): LiveMatchState {
  return {
    convocadoIds,
    onCourt: [],
    titularIds: [],
    clock: { running: false, elapsedMs: 0, startTs: null },
    period: 1,
    events: [],
    score: { nos: 0, advers: 0 },
    treatment: null,
    periodFouls: 0,
    periodFoulsAdvers: 0,
    clockAcc: createClockAccounting(),
    started: false,
    finished: false,
  };
}

/** Tempo decorrido no relógio de jogo (não no relógio da parede) para o estado atual do jogo ao vivo. */
export function matchElapsedMs(state: LiveMatchState, nowMs: number): number {
  return clockNowElapsedMs(state.clock, nowMs);
}

export function toggleConvocado(state: LiveMatchState, playerId: string): LiveMatchState {
  const has = state.convocadoIds.includes(playerId);
  return {
    ...state,
    convocadoIds: has ? state.convocadoIds.filter((id) => id !== playerId) : [...state.convocadoIds, playerId],
  };
}

/** Só antes do jogo começar — depois de "started", troca de titular é sempre uma substituição registada. */
export function toggleTitular(state: LiveMatchState, playerId: string): LiveMatchState {
  if (state.started) return state;
  const has = state.onCourt.includes(playerId);
  if (has) return { ...state, onCourt: state.onCourt.filter((id) => id !== playerId) };
  if (state.onCourt.length >= 5) return state;
  return { ...state, onCourt: [...state.onCourt, playerId] };
}

export function goLive(state: LiveMatchState): LiveMatchState {
  return { ...state, titularIds: state.onCourt.slice() };
}

function hasKickoffThisPeriod(state: LiveMatchState): boolean {
  return state.events.some((e) => e.type === "kickoff" && e.period === state.period);
}

export function resumeOrStart(state: LiveMatchState, nowMs: number): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  let clockAcc = state.clockAcc;
  state.onCourt.forEach((id) => {
    clockAcc = markOnSince(clockAcc, id, atMs);
  });
  const label = hasKickoffThisPeriod(state) ? "Relógio retomado" : `Início da parte ${state.period}`;
  const ev = createEvent("kickoff", null, atMs, state.period, nowMs, { label });
  return {
    ...state,
    clock: { running: true, elapsedMs: state.clock.elapsedMs, startTs: nowMs },
    clockAcc,
    started: true,
    events: [...state.events, ev],
  };
}

export function pause(state: LiveMatchState, nowMs: number, label: string, reasonId?: string): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  const clockAcc = settleAll(state.clockAcc, state.onCourt, atMs);
  const ev = createEvent("pausa", null, atMs, state.period, nowMs, { label, reasonId });
  return {
    ...state,
    clock: { running: false, elapsedMs: atMs, startTs: null },
    clockAcc,
    events: [...state.events, ev],
  };
}

export function doGoal(
  state: LiveMatchState,
  scorerId: string,
  assistId: string | null,
  nowMs: number,
  tipo?: string | null,
  zona?: number | null
): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  const ev = createEvent("golo", scorerId, atMs, state.period, nowMs, {
    assistId,
    lineup: state.onCourt.slice(),
    tipo: tipo ?? null,
    zona: zona ?? null,
  });
  const events = [...state.events, ev];
  return { ...state, events, score: recomputeScoreFor(events) };
}

export function doOppGoal(state: LiveMatchState, nowMs: number, tipo?: string | null, zona?: number | null): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  const ev = createEvent("golo_sofrido", null, atMs, state.period, nowMs, {
    lineup: state.onCourt.slice(),
    tipo: tipo ?? null,
    zona: zona ?? null,
  });
  const events = [...state.events, ev];
  return { ...state, events, score: recomputeScoreFor(events) };
}

/** Cartão vermelho tira o atleta de campo e assenta o tempo dele na hora; amarelo só regista. */
export function doCard(state: LiveMatchState, playerId: string, kind: "amarelo" | "vermelho", nowMs: number): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  const type = kind === "amarelo" ? "cartao_amarelo" : "cartao_vermelho";
  const ev = createEvent(type, playerId, atMs, state.period, nowMs, {});
  let onCourt = state.onCourt;
  let clockAcc = state.clockAcc;
  if (kind === "vermelho" && onCourt.includes(playerId)) {
    clockAcc = settlePlayer(clockAcc, playerId, atMs);
    onCourt = onCourt.filter((id) => id !== playerId);
  }
  return { ...state, events: [...state.events, ev], onCourt, clockAcc };
}

export function doFoul(state: LiveMatchState, playerId: string, nowMs: number): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  const ev = createEvent("falta", playerId, atMs, state.period, nowMs, {});
  return { ...state, events: [...state.events, ev], periodFouls: state.periodFouls + 1 };
}

/** Falta sofrida por um dos nossos jogadores (cometida pelo adversário) — conta para o total do adversário na parte. */
export function doFoulSuffered(state: LiveMatchState, playerId: string, nowMs: number): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  const ev = createEvent("falta_sofrida", playerId, atMs, state.period, nowMs, {});
  return { ...state, events: [...state.events, ev], periodFoulsAdvers: state.periodFoulsAdvers + 1 };
}

export function startTreatment(state: LiveMatchState, playerId: string, nowMs: number): LiveMatchState {
  if (state.treatment) return state;
  const atMs = matchElapsedMs(state, nowMs);
  const ev = createEvent("lesao_inicio", playerId, atMs, state.period, nowMs, {});
  return { ...state, treatment: { playerId, startedAtMs: atMs }, events: [...state.events, ev] };
}

export function endTreatment(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (!state.treatment) return state;
  const atMs = matchElapsedMs(state, nowMs);
  const durSec = Math.max(0, (atMs - state.treatment.startedAtMs) / 1000);
  const ev = createEvent("lesao_fim", state.treatment.playerId, atMs, state.period, nowMs, { durSec: Math.round(durSec) });
  return { ...state, treatment: null, events: [...state.events, ev] };
}

/** Entra em campo sem ninguém sair — só possível com menos de 5 em campo (ex.: depois de um vermelho, antes de repor o número). */
export function doEnter(state: LiveMatchState, inId: string, nowMs: number): LiveMatchState {
  if (state.onCourt.length >= 5 || state.onCourt.includes(inId)) return state;
  const atMs = matchElapsedMs(state, nowMs);
  const clockAcc = state.clock.running ? markOnSince(state.clockAcc, inId, atMs) : state.clockAcc;
  const ev = createEvent("substituicao", inId, atMs, state.period, nowMs, { outId: null });
  return { ...state, onCourt: [...state.onCourt, inId], clockAcc, events: [...state.events, ev] };
}

export function doSub(state: LiveMatchState, outId: string, inId: string, nowMs: number): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  let clockAcc = state.clockAcc;
  if (state.clock.running) {
    clockAcc = settlePlayer(clockAcc, outId, atMs);
    clockAcc = markOnSince(clockAcc, inId, atMs);
  }
  const onCourt = [...state.onCourt.filter((id) => id !== outId), inId];
  const ev = createEvent("substituicao", inId, atMs, state.period, nowMs, { outId });
  return { ...state, onCourt, clockAcc, events: [...state.events, ev] };
}

/**
 * Assenta o tempo e regista o fim da parte. Se esta é a última parte do
 * formato configurado (regulares + prolongamento), o jogo termina aqui —
 * `finished` fica true e o número da parte NÃO avança mais, em vez de
 * oferecer indefinidamente "mais uma parte". Formatos diferentes (ex.:
 * Sub-13 2×20min vs Sub-15 2×25min) têm cada um o seu próprio limite.
 */
export function endPeriod(state: LiveMatchState, format: MatchFormat, nowMs: number): LiveMatchState {
  const atMs = matchElapsedMs(state, nowMs);
  const clockAcc = state.clock.running ? settleAll(state.clockAcc, state.onCourt, atMs) : state.clockAcc;
  const durSec = Math.round(atMs / 1000);
  const ev = createEvent("fim_periodo", null, atMs, state.period, nowMs, {
    label: `Fim da parte ${state.period}`,
    duracaoSec: durSec,
  });
  const finished = isLastPeriod(state.period, format);
  return {
    ...state,
    clockAcc,
    clock: { running: false, elapsedMs: 0, startTs: null },
    period: finished ? state.period : state.period + 1,
    periodFouls: 0,
    periodFoulsAdvers: 0,
    finished,
    events: [...state.events, ev],
  };
}

export function playerCurrentSeconds(state: LiveMatchState, playerId: string, nowMs: number): number {
  return playerSeconds(state.clockAcc, playerId, matchElapsedMs(state, nowMs));
}

/**
 * Contagem de faltas cometidas/sofridas numa parte, direto da lista de
 * eventos — usada por quem só tem os eventos sincronizados (ex.: o modo
 * leitura de quem não segura a trava do jogo), sem um LiveMatchState local.
 */
export function foulsInPeriod(events: MatchEvent[], period: number): { nos: number; advers: number } {
  return {
    nos: events.filter((e) => e.period === period && e.type === "falta").length,
    advers: events.filter((e) => e.period === period && e.type === "falta_sofrida").length,
  };
}
