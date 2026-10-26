import * as engine from "@teambench/engine";
import { useEffect, useRef, useState } from "preact/hooks";
import { enqueue, removeByClientEventIds } from "../sync/outbox";
import { supabase } from "../supabaseClient";
import { PRAZO_ZONA_MS, resolvePending, startPending, type Pending, type Trigger } from "./consola/deferredEnqueue";
import { useRotationPlan } from "./useRotationPlan";

const SUB_ALERT_LEAD_SEC = 60;

export interface UpcomingSubAlert {
  outId: string;
  inId: string | null;
  secondsLeft: number;
}

const STORAGE_PREFIX = "teambench.liveMatch.";
// clientEventId do lance da Consola à espera de zona (ver deferredEnqueue.ts)
// — guardado à parte para, se a app fechar com o painel aberto, o lance ser
// enfileirado no próximo arranque em vez de ficar só no estado local.
const PENDING_PREFIX = "teambench.liveMatch.pending.";

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

export function useLiveMatch(matchId: string, teamId: string, ownerId: string, format: engine.MatchFormat, dbStatus?: string) {
  const [state, setState] = useState<engine.LiveMatchState>(() => loadState(matchId));
  const [tick, setTick] = useState(0); // força re-render a cada segundo enquanto o relógio corre, só para o display
  const historyRef = useRef<engine.LiveMatchState[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // Fica true só quando um evento não coube NEM na fila principal NEM na
  // quarentena (outbox.ts) — caso raro e grave (localStorage indisponível
  // ou esgotado em ambos). Aviso persistente de propósito: não se limpa
  // sozinho, porque o evento em causa continua por garantir até alguém
  // resolver o espaço/estado do armazenamento deste aparelho.
  const [enqueueFailed, setEnqueueFailed] = useState(false);

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
  // `convocadoIds` reconstruído de duas fontes, unidas: o heurístico de
  // sempre (todo mundo que aparece em algum evento de jogo — jogador, quem
  // saiu, ou o cinco inicial do apito; quem foi convocado mas nunca chegou a
  // entrar em campo não aparece aqui, limitação conhecida já existente) MAIS
  // `squadEvents` já sincronizados (specs/007-convocados-sync/), que cobrem
  // exatamente esse buraco pra jogos novos. Jogos antigos (sem nenhum
  // `squadEvents`, de antes desta feature) continuam a funcionar só com o
  // heurístico — nada regride.
  //
  // IMPORTANTE: eventos de escalação são excluídos daqui antes de chamar
  // `replayEvents` — `state.events` é só ações em quadra (ver
  // `LiveMatchState.squadEvents`); misturar os dois poluiria o registo
  // cronológico/timeline exibidos noutras telas.
  //
  // BUG REAL ENCONTRADO E CORRIGIDO: a guarda `state.events.length > 0` só
  // olha pro cache local deste aparelho — uma vez que ele tem QUALQUER
  // progresso salvo, nunca mais volta a consultar o Supabase, mesmo que o
  // jogo já tenha sido corrigido depois (ex.: via aba Registo, que grava
  // direto no Supabase sem nunca tocar nesse cache local). Resultado real:
  // corrigir um jogo terminado pela aba Registo e reabrir a aba Jogo no
  // MESMO aparelho continuava a mostrar a versão antiga, poluída, até
  // limpar o cache à mão. Um jogo `finished` nunca mais recebe uma ação
  // local legítima por este caminho (só a Registo mexe nele a partir
  // daí) — por isso, pra esse caso, SEMPRE confia no Supabase por cima do
  // que estiver em cache, nunca o contrário.
  const [checkingRemote, setCheckingRemote] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function checkRemote() {
      if (state.events.length > 0 && dbStatus !== "finished") {
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
        const all = data.map((row) => row.payload as engine.MatchEvent);
        const squadEvents = all.filter((e) => (engine.SQUAD_EVENT_TYPES as string[]).includes(e.type));
        const gameEvents = all.filter((e) => !(engine.SQUAD_EVENT_TYPES as string[]).includes(e.type));
        if (gameEvents.length > 0) {
          const heuristicIds = gameEvents.flatMap((e) => [e.playerId, e.outId, ...(e.lineup ?? [])].filter((x): x is string => !!x));
          const convocadoIds = Array.from(new Set([...heuristicIds, ...engine.deriveConvocadoIds(squadEvents)]));
          setState({ ...engine.replayEvents(convocadoIds, gameEvents, format), squadEvents });
        }
        // Sem nenhum evento de jogo ainda (gameEvents vazio): o jogo não
        // começou neste aparelho — fica por conta do efeito de merge ativo
        // logo abaixo (ativo enquanto !state.started), que já faz esse
        // primeiro carregamento de squadEvents sozinho, sem duplicar aqui.
      }
      setCheckingRemote(false);
    }
    checkRemote();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Merge ativo de convocados/titulares com outros aparelhos (specs/007-convocados-sync/
  // US1/FR-010) — ativo só antes do apito. Primeira execução cobre tanto "este
  // aparelho nunca tocou neste jogo" (squadEvents local vazio) quanto "outro
  // aparelho marcou algo enquanto este já estava aberto" (polls seguintes).
  // NUNCA reenfileira o que busca — já veio do servidor, reenviar seria redundante
  // (o upsert por client_event_id até seria inofensivo, mas desperdiça fila/rede).
  useEffect(() => {
    if (state.started) return;
    let cancelled = false;
    async function mergeSquad() {
      const { data, error } = await supabase
        .from("match_events")
        .select("payload")
        .eq("match_id", matchId)
        .in("type", engine.SQUAD_EVENT_TYPES as string[]);
      if (cancelled || error || !data) return;
      setState((s) => {
        const known = new Set(s.squadEvents.map((e) => e.clientEventId ?? e.id));
        const fresh = data.map((row) => row.payload as engine.MatchEvent).filter((e) => !known.has(e.clientEventId ?? e.id));
        if (fresh.length === 0) return s;
        const squadEvents = [...s.squadEvents, ...fresh];
        return {
          ...s,
          squadEvents,
          convocadoIds: engine.deriveConvocadoIds(squadEvents),
          onCourt: s.started ? s.onCourt : engine.deriveTitularIds(squadEvents),
        };
      });
    }
    mergeSquad();
    const interval = setInterval(mergeSquad, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, state.started]);

  function enqueueNewEvents(newEvents: engine.MatchEvent[]) {
    for (const ev of newEvents) {
      const result = enqueue(ownerId, {
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
      // "quarantined" não é mostrado aqui: fica visível no aviso global de
      // sync (useOutboxSync), que já expõe quarantinedCount por proprietário
      // — não é específico deste jogo. Só o caso "failed" (nem a quarentena
      // aceitou) justifica um aviso dedicado neste ecrã, porque é o único
      // em que o evento pode mesmo não ter sido guardado em lado nenhum.
      if (result.status === "failed") setEnqueueFailed(true);
    }
  }

  // ---- Envio adiado do lance à espera de zona (só a Consola usa) ----
  // O "Jogo ao vivo" nunca chama `applyDeferred`, por isso para ele nada muda:
  // `pendingRef` fica sempre null e cada evento entra na fila na hora.
  const pendingRef = useRef<Pending | null>(null);
  const [pendingZonaKey, setPendingZonaKey] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keyOf = (e: engine.MatchEvent) => e.clientEventId ?? e.id;

  function enqueueByKey(events: engine.MatchEvent[], key: string) {
    const ev = events.find((e) => keyOf(e) === key);
    if (ev) enqueueNewEvents([ev]);
  }

  function setPending(next: Pending | null) {
    pendingRef.current = next;
    setPendingZonaKey(next ? next.key : null);
    try {
      if (next) localStorage.setItem(PENDING_PREFIX + matchId, next.key);
      else localStorage.removeItem(PENDING_PREFIX + matchId);
    } catch {
      // sem armazenamento: perde-se só a recuperação no arranque; sair da tela continua a enfileirar
    }
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = next
      ? // O temporizador pertence sempre ao pendente atual (cada setPending
        // cancela o anterior), por isso ao disparar expira-o sempre — sem
        // comparar com Date.now(), que pode recuar (acerto de relógio) e
        // deixar o lance preso sem novo temporizador.
        setTimeout(() => setState((s) => (runTrigger(s, { type: "prazo", now: Number.POSITIVE_INFINITY }), s)), PRAZO_ZONA_MS)
      : null;
  }

  /** Aplica um gatilho ao lance pendente; enfileira-o a partir de `s` (o estado mais recente) quando for a hora. */
  function runTrigger(s: engine.LiveMatchState, t: Trigger) {
    if (!pendingRef.current) return;
    const r = resolvePending(pendingRef.current, t);
    if (r.enqueueKey) enqueueByKey(s.events, r.enqueueKey);
    if (r.next !== pendingRef.current) setPending(r.next);
  }

  // Arranque: um lance que ficou pendente quando a app fechou entra agora na
  // fila, tal como ficou (com ou sem zona). Reenfileirar é idempotente por
  // client_event_id (outbox.ts), por isso não há duplicado se já lá estava.
  useEffect(() => {
    try {
      const key = localStorage.getItem(PENDING_PREFIX + matchId);
      if (key) {
        enqueueByKey(stateRef.current.events, key);
        localStorage.removeItem(PENDING_PREFIX + matchId);
      }
    } catch {
      // sem armazenamento: nada a recuperar
    }
    // App em segundo plano ou a fechar (chamada, ecrã bloqueado, o iOS a
    // matar a PWA): enfileira já o pendente, sem zona. A limpeza do efeito
    // não corre num fecho de página, e a recuperação no arranque só acontece
    // quando este jogo voltar a ser aberto neste aparelho.
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") setState((s) => (runTrigger(s, { type: "desmontar" }), s));
    };
    const flushNow = () => setState((s) => (runTrigger(s, { type: "desmontar" }), s));
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushNow);
    // Sair da tela (trocar de aba, fechar o jogo) enfileira o pendente.
    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushNow);
      const p = pendingRef.current;
      if (!p) return;
      enqueueByKey(stateRef.current.events, p.key);
      pendingRef.current = null;
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      try {
        localStorage.removeItem(PENDING_PREFIX + matchId);
      } catch {
        // idem
      }
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
      // Outra ação: o lance à espera de zona entra primeiro na fila (ordem preservada).
      runTrigger(s, { type: "outra-acao" });
      historyRef.current.push(s);
      if (historyRef.current.length > UNDO_LIMIT) historyRef.current.shift();
      setCanUndo(true);
      const result = next(s);
      if (result.events.length > s.events.length) {
        enqueueNewEvents(result.events.slice(s.events.length));
      }
      return result;
    });
  }

  // Mesma ideia de `apply()` (enfileira os eventos novos pra sincronização),
  // mas SEM entrar na pilha de undo — convocado/titular continuam sendo
  // ajustes de pré-jogo, não ações "ao vivo" que o treinador precise
  // desfazer (specs/007-convocados-sync/). Opera sobre `squadEvents`, nunca
  // `events` (ver LiveMatchState.squadEvents).
  function applySquad(next: (s: engine.LiveMatchState) => engine.LiveMatchState) {
    setState((s) => {
      runTrigger(s, { type: "outra-acao" });
      const result = next(s);
      if (result.squadEvents.length > s.squadEvents.length) {
        enqueueNewEvents(result.squadEvents.slice(s.squadEvents.length));
      }
      return result;
    });
  }

  /**
   * Como `apply`, mas o (último) evento novo fica à espera de zona em vez de
   * entrar logo na fila (research.md Decisão 3). Um pendente anterior é
   * enfileirado primeiro. Se a ação não criou evento (entrada inválida),
   * nada fica pendente.
   */
  function applyDeferred(next: (s: engine.LiveMatchState) => engine.LiveMatchState) {
    setState((s) => {
      const result = next(s);
      if (result.events.length <= s.events.length) return s;
      historyRef.current.push(s);
      if (historyRef.current.length > UNDO_LIMIT) historyRef.current.shift();
      setCanUndo(true);
      const fresh = result.events.slice(s.events.length);
      const last = fresh[fresh.length - 1];
      const r = startPending(pendingRef.current, keyOf(last), Date.now());
      if (r.enqueueKey) enqueueByKey(s.events, r.enqueueKey);
      if (fresh.length > 1) enqueueNewEvents(fresh.slice(0, -1));
      setPending(r.next);
      return result;
    });
  }

  /** Zona escolhida no painel: entra no evento pendente (ainda não enfileirado) e só então ele vai para a fila. */
  function setPendingZona(zona: number) {
    if (!Number.isInteger(zona) || zona < 1 || zona > 12) return;
    // `p` capturado fora do updater: se o updater correr mais de uma vez, a
    // zona entra sempre no estado e o enqueue (idempotente) só acontece na 1ª.
    const p = pendingRef.current;
    if (!p) return;
    setState((s) => {
      const idx = s.events.findIndex((e) => keyOf(e) === p.key);
      if (idx < 0) {
        if (pendingRef.current === p) setPending(null);
        return s;
      }
      const events = s.events.slice();
      events[idx] = { ...events[idx], zona };
      if (pendingRef.current === p) runTrigger({ ...s, events }, { type: "zona" });
      return { ...s, events };
    });
  }

  /** Painel fechado sem zona (✕): o lance vai para a fila tal como está. */
  function closePendingZona() {
    setState((s) => (runTrigger(s, { type: "fechar" }), s));
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
    removeByClientEventIds(ownerId, removedIds);
    // O lance desfeito pode ser o que esperava zona: nunca chegou à fila, descarta-se.
    if (pendingRef.current) {
      const r = resolvePending(pendingRef.current, { type: "desfazer", removedKeys: removedIds });
      if (r.next !== pendingRef.current) setPending(r.next);
    }
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

  // Assim que as duas partes terminam (state.finished, puro — nunca lê o
  // banco), marca matches.status = 'finished' sozinho, sem depender de
  // alguém abrir o Resumo e clicar em "Marcar jogo como terminado" — sem
  // isto, a etiqueta do Calendário ("Continuar jogo" vs. "Ver resumo")
  // ficava errada pra qualquer jogo que ninguém tivesse fechado à mão
  // (descobrimos que era quase todo jogo de teste). Melhor esforço: se
  // falhar agora (sem rede), tenta de novo da próxima vez que este hook
  // montar com o jogo já terminado — RPC, não update direto, ver migração
  // 0019 (a policy de UPDATE direto em matches só permite team_admin).
  //
  // BUG REAL ENCONTRADO E CORRIGIDO (specs/007-convocados-sync/, achado
  // durante verificação): `supabase.rpc(...)` do supabase-js só dispara o
  // pedido de rede de verdade quando o thenable devolvido é consumido
  // (`.then()`/`await`) — chamar e descartar, como aqui antes, NUNCA
  // enviava o pedido, silenciosamente. Confirmado ao vivo: nenhum destes
  // dois RPCs jamais apareceu na rede em meses de uso — `matches.status`
  // nunca saiu de 'scheduled' sozinho pra NENHUM jogo, só via
  // `claim_live_match` (que já é `await`ado em useMatchLock.ts, por isso
  // sempre funcionou). `.then(() => {})` basta pra consumir o thenable e
  // disparar o pedido, mantendo o espírito "melhor esforço" (sem bloquear
  // nem tratar erro aqui).
  useEffect(() => {
    if (!state.finished) return;
    supabase.rpc("finish_live_match", { p_match_id: matchId }).then(() => {});
  }, [state.finished, matchId]);

  // Assim que o jogo realmente começa (state.started, puro — fica true só
  // depois de "Iniciar Parte 1"/registar com vídeo, nunca só por abrir a
  // tela), marca matches.status = 'live'. Antes isto acontecia como efeito
  // colateral de reivindicar a trava de edição (claim_live_match) — ou
  // seja, só por ABRIR a tela do jogo, mesmo sem tocar em nada. Isso ficou
  // visível com o MatchHub (ver migração 0020): "Rotações" virou uma aba
  // dentro do mesmo ecrã, que já monta "Jogo" primeiro por omissão — então
  // só espreitar as rotações de um jogo agendado já marcava "live" sem
  // ninguém ter começado de verdade.
  useEffect(() => {
    if (!state.started) return;
    supabase.rpc("start_live_match", { p_match_id: matchId }).then(() => {});
  }, [state.started, matchId]);

  const now = () => (manual ? manualElapsedMs : Date.now());
  const elapsedMs = engine.matchElapsedMs(state, now());
  void tick; // usado só para disparar o re-render acima

  // Plano de rotação é só leitura aqui — nunca grava nada, e some de vez
  // (sem aviso nenhum) se o jogo não tiver plano. Nunca em modo manual
  // (reconstrução/correção por vídeo): quem está ali não vai fazer uma
  // substituição de verdade a partir de um aviso de "tempo acabando".
  const rotationPlan = useRotationPlan(teamId, matchId);
  let upcomingSubAlert: UpcomingSubAlert | null = null;
  if (!manual && state.started && !state.finished && rotationPlan.stints.length > 0) {
    const elapsedSec = elapsedMs / 1000;
    for (const playerId of state.onCourt) {
      const stint = engine.currentStintFor(rotationPlan.stints, playerId, state.period, elapsedSec);
      if (!stint) continue;
      const secondsLeft = stint.endSec - elapsedSec;
      if (secondsLeft > 0 && secondsLeft <= SUB_ALERT_LEAD_SEC && (!upcomingSubAlert || secondsLeft < upcomingSubAlert.secondsLeft)) {
        const next = engine.nextStintInSlot(rotationPlan.stints, stint.slotIndex, stint.period, stint.endSec);
        upcomingSubAlert = { outId: playerId, inId: next?.playerId ?? null, secondsLeft };
      }
    }
  }

  return {
    upcomingSubAlert,
    enqueueFailed,
    state,
    elapsedMs,
    format,
    canUndo,
    undo,
    checkingRemote,
    manual,
    manualElapsedMs,
    setManualElapsedMs: (ms: number) => setManualElapsedMsState(Math.max(0, ms)),
    // toggleConvocado/toggleTitular ficam fora da pilha de undo (ver
    // applySquad acima) — são ajustes de pré-jogo, não ações "ao vivo" que o
    // treinador precise desfazer. `ts` usa sempre Date.now() (nunca `now()`,
    // que em modo manual devolveria `manualElapsedMs` — um número pequeno de
    // tempo de jogo, não um instante de parede real) porque é isso que o
    // merge entre aparelhos (última ação vence) precisa pra comparar
    // corretamente qual marcação é mais recente de verdade.
    toggleConvocado: (id: string) => applySquad((s) => engine.toggleConvocado(s, id, Date.now())),
    toggleTitular: (id: string) => applySquad((s) => engine.toggleTitular(s, id, Date.now())),
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
    // `atNowMs` deixa quem chama fixar o instante do golo no momento em que
    // ABRIU a tela de registo (1º toque), não em que a fechou — preencher
    // marcador/tipo/zona/assistência leva vários toques, e usar now() só no
    // fim atrasaria o tempo gravado do golo pelo tanto que isso demorou.
    // Sem o parâmetro, cai em now() como antes (demais ações, de um toque só).
    doGoal: (
      scorerId: string,
      assistId: string | null,
      tipo?: string | null,
      zona?: number | null,
      transicaoNumeros?: string | null,
      transicaoBalizaDeserta?: boolean,
      atNowMs?: number
    ) => apply((s) => engine.doGoal(s, scorerId, assistId, atNowMs ?? now(), tipo, zona, transicaoNumeros, transicaoBalizaDeserta)),
    doOppGoal: (
      tipo?: string | null,
      zona?: number | null,
      transicaoNumeros?: string | null,
      transicaoBalizaDeserta?: boolean,
      atNowMs?: number
    ) => apply((s) => engine.doOppGoal(s, atNowMs ?? now(), tipo, zona, transicaoNumeros, transicaoBalizaDeserta)),
    doCard: (playerId: string, kind: "amarelo" | "vermelho") => apply((s) => engine.doCard(s, playerId, kind, now())),
    doFoul: (playerId: string) => apply((s) => engine.doFoul(s, playerId, now())),
    doFoulSuffered: (playerId: string) => apply((s) => engine.doFoulSuffered(s, playerId, now())),
    // `atNowMs` opcional, mesmo motivo do doGoal/doOppGoal acima: a troca é
    // escolhida em 2 toques (quem sai, quem entra) — o tempo gravado é o do
    // 1º toque da sequência, não o do 2º que só termina de decidir.
    doSub: (outId: string, inId: string, atNowMs?: number) => apply((s) => engine.doSub(s, outId, inId, atNowMs ?? now())),
    doEnter: (inId: string) => apply((s) => engine.doEnter(s, inId, now())),
    startTreatment: (playerId: string) => apply((s) => engine.startTreatment(s, playerId, now())),
    endTreatment: () => apply((s) => engine.endTreatment(s, now())),
    endPeriod: () => apply((s) => engine.endPeriod(s, format, now())),
    playerSeconds: (playerId: string) => engine.playerCurrentSeconds(state, playerId, now()),
    // ---- Consola (specs/009): lances com zona opcional e envio adiado ----
    pendingZonaKey,
    setPendingZona,
    closePendingZona,
    deferred: {
      doFoul: (playerId: string) => applyDeferred((s) => engine.doFoul(s, playerId, now())),
      doFoulSuffered: (playerId: string) => applyDeferred((s) => engine.doFoulSuffered(s, playerId, now())),
      doCard: (playerId: string, kind: "amarelo" | "vermelho") => applyDeferred((s) => engine.doCard(s, playerId, kind, now())),
      doRemate: (playerId: string, desfecho: engine.Desfecho) => applyDeferred((s) => engine.doRemate(s, playerId, desfecho, now())),
      doRemateAdv: (desfecho: "fora" | "bloqueado") => applyDeferred((s) => engine.doRemateAdv(s, desfecho, now())),
      doDefesa: (gkId: string) => applyDeferred((s) => engine.doDefesa(s, gkId, now())),
      doSaida: (gkId: string, resultado: "ganha" | "perdida") => applyDeferred((s) => engine.doSaida(s, gkId, resultado, now())),
    },
  };
}
