import * as engine from "@teambench/engine";
import { useEffect, useRef, useState } from "preact/hooks";
import { enqueue, removeByClientEventIds } from "../sync/outbox";

const STORAGE_PREFIX = "teambench.liveMatch.";

// O relógio de jogo é sempre a fonte de verdade — este estado local é o que
// vale durante o jogo. Cada evento novo entra também na fila de
// sincronização (ver ../sync/), que envia para o Supabase em segundo plano
// quando há rede — sem exigir conexão nenhuma para o jogo continuar.
function loadState(matchId: string): engine.LiveMatchState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + matchId);
    if (raw) return JSON.parse(raw) as engine.LiveMatchState;
  } catch {
    // localStorage indisponível ou dado corrompido — recomeça do zero para este jogo.
  }
  return engine.createLiveMatchState();
}

const UNDO_LIMIT = 25;

export function useLiveMatch(matchId: string, teamId: string, format: engine.MatchFormat) {
  const [state, setState] = useState<engine.LiveMatchState>(() => loadState(matchId));
  const [tick, setTick] = useState(0); // força re-render a cada segundo enquanto o relógio corre, só para o display
  const historyRef = useRef<engine.LiveMatchState[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify(state));
  }, [matchId, state]);

  // Cada ação empilha o estado ANTERIOR antes de aplicar a mudança — desfazer
  // é simplesmente voltar ao topo da pilha. Suficiente para correções em
  // campo; não sobrevive a um recarregar de página (aceitável: undo é para
  // "toquei errado agora mesmo", não para reabrir o jogo depois).
  //
  // Todo evento novo criado por uma ação entra na fila de sincronização na
  // hora — antes mesmo de saber se há rede. A fila é que decide depois
  // quando/se consegue enviar.
  function apply(next: (s: engine.LiveMatchState) => engine.LiveMatchState) {
    setState((s) => {
      historyRef.current.push(s);
      if (historyRef.current.length > UNDO_LIMIT) historyRef.current.shift();
      setCanUndo(true);
      const result = next(s);
      if (result.events.length > s.events.length) {
        for (const ev of result.events.slice(s.events.length)) {
          enqueue({
            client_event_id: ev.clientEventId ?? ev.id,
            match_id: matchId,
            team_id: teamId,
            type: ev.type,
            player_id: ev.playerId,
            payload: ev as unknown as Record<string, unknown>,
            ms: ev.ms,
            min: ev.min,
            sec: ev.sec,
            period: ev.period,
          });
        }
      }
      return result;
    });
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    // Se o evento desfeito ainda não tinha saído da fila local, tira-o de
    // lá também. Limitação conhecida: se já tiver sincronizado (raro — a
    // fila esvazia a cada ~8s), a cópia no Supabase fica para trás; isso
    // exigiria um evento de "correção" explícito, como o próprio banco.html
    // já fazia para correções feitas depois do jogo — fica para depois.
    const removedIds = state.events
      .filter((e) => !prev.events.some((pe) => pe.id === e.id))
      .map((e) => e.clientEventId ?? e.id);
    removeByClientEventIds(removedIds);
    setCanUndo(historyRef.current.length > 0);
    setState(prev);
  }

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current.clock.running) setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const now = () => Date.now();
  const elapsedMs = engine.matchElapsedMs(state, now());
  void tick; // usado só para disparar o re-render acima

  return {
    state,
    elapsedMs,
    format,
    canUndo,
    undo,
    // toggleConvocado/toggleTitular ficam fora da pilha de undo — são ajustes
    // de pré-jogo, não ações "ao vivo" que o treinador precise desfazer.
    toggleConvocado: (id: string) => setState((s) => engine.toggleConvocado(s, id)),
    toggleTitular: (id: string) => setState((s) => engine.toggleTitular(s, id)),
    goLive: () => setState((s) => engine.goLive(s)),
    // Na primeira vez (ainda não "started"), tira o retrato dos titulares
    // imediatamente antes do relógio arrancar de verdade — é só aí que se
    // sabe ao certo quem ficou em campo, já que o treinador pode continuar
    // ajustando o cinco inicial até apitar o início.
    resumeOrStart: () =>
      apply((s) => {
        const withTitulars = s.started ? s : engine.goLive(s);
        return engine.resumeOrStart(withTitulars, now());
      }),
    pause: (label: string, reasonId?: string) => apply((s) => engine.pause(s, now(), label, reasonId)),
    doGoal: (scorerId: string, assistId: string | null, tipo?: string | null, zona?: number | null) =>
      apply((s) => engine.doGoal(s, scorerId, assistId, now(), tipo, zona)),
    doOppGoal: (tipo?: string | null, zona?: number | null) => apply((s) => engine.doOppGoal(s, now(), tipo, zona)),
    doCard: (playerId: string, kind: "amarelo" | "vermelho") => apply((s) => engine.doCard(s, playerId, kind, now())),
    doFoul: (playerId: string) => apply((s) => engine.doFoul(s, playerId, now())),
    doFoulSuffered: (playerId: string) => apply((s) => engine.doFoulSuffered(s, playerId, now())),
    doSub: (outId: string, inId: string) => apply((s) => engine.doSub(s, outId, inId, now())),
    doEnter: (inId: string) => apply((s) => engine.doEnter(s, inId, now())),
    startTreatment: (playerId: string) => apply((s) => engine.startTreatment(s, playerId, now())),
    endTreatment: () => apply((s) => engine.endTreatment(s, now())),
    endPeriod: () => apply((s) => engine.endPeriod(s, format, now())),
    playerSeconds: (playerId: string) => engine.playerCurrentSeconds(state, playerId, now()),
  };
}
