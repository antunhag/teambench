import * as engine from "@teambench/engine";
import { useEffect, useRef, useState } from "preact/hooks";

const STORAGE_PREFIX = "teambench.liveMatch.";

// O relógio de jogo é sempre a fonte de verdade — este estado local é
// exatamente o que futuramente vai para a fila de sincronização (Fase 2,
// parte 2). Por agora fica só no localStorage do telemóvel, igual ao
// banco.html original, mas já construído sobre o motor modular e testado.
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

export function useLiveMatch(matchId: string) {
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
  function apply(next: (s: engine.LiveMatchState) => engine.LiveMatchState) {
    setState((s) => {
      historyRef.current.push(s);
      if (historyRef.current.length > UNDO_LIMIT) historyRef.current.shift();
      setCanUndo(true);
      return next(s);
    });
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
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
    canUndo,
    undo,
    // toggleConvocado/toggleTitular ficam fora da pilha de undo — são ajustes
    // de pré-jogo, não ações "ao vivo" que o treinador precise desfazer.
    toggleConvocado: (id: string) => setState((s) => engine.toggleConvocado(s, id)),
    toggleTitular: (id: string) => setState((s) => engine.toggleTitular(s, id)),
    goLive: () => setState((s) => engine.goLive(s)),
    resumeOrStart: () => apply((s) => engine.resumeOrStart(s, now())),
    pause: (label: string, reasonId?: string) => apply((s) => engine.pause(s, now(), label, reasonId)),
    doGoal: (scorerId: string, assistId: string | null) => apply((s) => engine.doGoal(s, scorerId, assistId, now())),
    doOppGoal: () => apply((s) => engine.doOppGoal(s, now())),
    doCard: (playerId: string, kind: "amarelo" | "vermelho") => apply((s) => engine.doCard(s, playerId, kind, now())),
    doFoul: (playerId: string) => apply((s) => engine.doFoul(s, playerId, now())),
    doSub: (outId: string, inId: string) => apply((s) => engine.doSub(s, outId, inId, now())),
    startTreatment: (playerId: string) => apply((s) => engine.startTreatment(s, playerId, now())),
    endTreatment: () => apply((s) => engine.endTreatment(s, now())),
    endPeriod: () => apply((s) => engine.endPeriod(s, now())),
    playerSeconds: (playerId: string) => engine.playerCurrentSeconds(state, playerId, now()),
  };
}
