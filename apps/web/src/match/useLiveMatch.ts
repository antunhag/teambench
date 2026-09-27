import * as engine from "@teambench/engine";
import { useEffect, useRef, useState } from "preact/hooks";
import { enqueue, removeByClientEventIds } from "../sync/outbox";
import { supabase } from "../supabaseClient";

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

  // Modo manual: para reconstruir/corrigir uma parte depois do jogo (ex.:
  // revendo o vídeo, ou por ter perdido o registo ao vivo por algum erro) —
  // aqui o "agora" deixa de ser Date.now() e passa a ser um tempo decorrido
  // controlado à mão (ver setManualElapsedMs). Cada parte decide o próprio
  // modo no instante do apito: resumeOrStart() sempre usa tempo real,
  // manualResumeOrStart() sempre começa em 0 e ancora clock.startTs em 0.
  //
  // `manual` é DERIVADO do próprio clock persistido (startTs===0), nunca
  // guardado à parte — startTs=0 é um valor que Date.now() jamais produz,
  // então serve de sinal inequívoco. Isto importa porque só o `state` (via
  // localStorage) sobrevive a um recarregar de página; um booleano React
  // solto aqui voltaria a `false` no reload enquanto o relógio continuasse
  // ancorado em 0 — e então `matchElapsedMs` passaria a devolver o
  // Date.now() em bruto (um número gigante), corrompendo o relógio e os
  // minutos de todo mundo. (Bug real que já aconteceu — ver commit.)
  const manual = state.clock.running && state.clock.startTs === 0;
  // Ao recarregar a página em plena parte manual, não há "posição atual do
  // scrub" persistida (só o instante do apito é guardado) — recupera-se o
  // melhor palpite: o ms do último evento já lançado nesta parte, em vez de
  // voltar sempre para 00:00.
  const [manualElapsedMs, setManualElapsedMsState] = useState(() => {
    if (!manual) return 0;
    const inPeriod = state.events.filter((e) => e.period === state.period && e.type !== "fim_periodo");
    return inPeriod.length ? Math.max(...inPeriod.map((e) => e.ms)) : 0;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify(state));
  }, [matchId, state]);

  // Se este aparelho nunca teve progresso local deste jogo (localStorage
  // vazio — ex.: reabrindo num aparelho diferente do que registou o jogo ao
  // vivo, ou depois de o navegador limpar os dados) mas o jogo já tem
  // eventos sincronizados no Supabase, reconstrói o estado a partir deles
  // (ver replay.ts) em vez de começar do zero — sem isto, um jogo já
  // começado voltaria a mostrar a tela de escolher o cinco inicial, o que
  // não faz sentido para um jogo que já aconteceu.
  //
  // `convocadoIds` nunca chega a ser sincronizado à parte (só o motor local
  // sabe quem foi convocado) — aqui é reconstruído como todo mundo que
  // aparece em algum evento (jogador, quem saiu, ou o cinco inicial do
  // apito). Quem foi convocado mas nunca chegou a entrar em campo não
  // aparece nessa lista; é uma limitação conhecida deste caminho.
  const [checkingRemote, setCheckingRemote] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function checkRemote() {
      if (state.events.length > 0) {
        setCheckingRemote(false);
        return;
      }
      const { data, error } = await supabase
        .from("match_events")
        .select("payload")
        .eq("match_id", matchId)
        .order("period", { ascending: true })
        .order("ms", { ascending: true });
      if (cancelled) return;
      if (!error && data && data.length > 0) {
        const events = data.map((row) => row.payload as engine.MatchEvent);
        const convocadoIds = Array.from(
          new Set(events.flatMap((e) => [e.playerId, e.outId, ...(e.lineup ?? [])].filter((x): x is string => !!x)))
        );
        setState(engine.replayEvents(convocadoIds, events, format));
      }
      setCheckingRemote(false);
    }
    checkRemote();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

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
      const s = stateRef.current;
      if (s.clock.running && s.clock.startTs !== 0) setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const now = () => (manual ? manualElapsedMs : Date.now());
  const elapsedMs = engine.matchElapsedMs(state, now());
  void tick; // usado só para disparar o re-render acima

  return {
    state,
    elapsedMs,
    format,
    canUndo,
    undo,
    checkingRemote,
    manual,
    manualElapsedMs,
    setManualElapsedMs: (ms: number) => setManualElapsedMsState(Math.max(0, ms)),
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
        return engine.resumeOrStart(withTitulars, Date.now());
      }),
    // Começa (ou recomeça) esta parte em modo manual: o relógio interno liga
    // (clock.running=true) mas ancorado em 0 em vez do relógio de parede —
    // dali em diante `matchElapsedMs` passa a devolver exatamente o valor de
    // manualElapsedMs, então cada ação fica carimbada no tempo que o
    // treinador escolher (ver setManualElapsedMs), nunca no tempo real.
    manualResumeOrStart: () =>
      apply((s) => {
        setManualElapsedMsState(0);
        const withTitulars = s.started ? s : engine.goLive(s);
        return engine.resumeOrStart(withTitulars, 0);
      }),
    pause: (label: string, reasonId?: string) => apply((s) => engine.pause(s, now(), label, reasonId)),
    endPause: () => apply((s) => engine.endPause(s, now())),
    doGoal: (
      scorerId: string,
      assistId: string | null,
      tipo?: string | null,
      zona?: number | null,
      transicaoNumeros?: string | null,
      transicaoBalizaDeserta?: boolean
    ) => apply((s) => engine.doGoal(s, scorerId, assistId, now(), tipo, zona, transicaoNumeros, transicaoBalizaDeserta)),
    doOppGoal: (tipo?: string | null, zona?: number | null, transicaoNumeros?: string | null, transicaoBalizaDeserta?: boolean) =>
      apply((s) => engine.doOppGoal(s, now(), tipo, zona, transicaoNumeros, transicaoBalizaDeserta)),
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
