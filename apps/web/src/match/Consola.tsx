/**
 * Consola — segunda tela de registo ao vivo (specs/009-captura-detalhada/).
 * Usa o mesmo useLiveMatch montado pelo mesmo MatchFlow do "Jogo ao vivo"
 * (mesma trava, mesma fila). Visual v2 aprovado em 2026-11-01:
 * contracts/consola-visual.md + docs/prototipos/consola-v2-maqueta.html
 * (tema escuro, cartões de jogador, registo rápido de equipa com mosaicos
 * "+" e "−", transições em 1 toque já com a superioridade, banco sempre à
 * vista com troca de linha). Lances com zona opcional seguem o envio adiado
 * para a fila (consola/deferredEnqueue.ts).
 *
 * Ocupa o ecrã inteiro (camada fixa abaixo das folhas `.overlay`) porque a
 * `.page` normal tem no máximo 760 px e leva topo/abas por cima.
 */
import {
  contarCategoria,
  describeEvents,
  eventosEfetivos,
  goleiroLinhaAtivo,
  isLastPeriod,
  timeoutUsedInPeriod,
  ultimoDaCategoria,
  type CategoriaEquipa,
  type MatchEvent,
  type Zona3,
} from "@teambench/engine";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { RejectedNotice } from "../sync/RejectedNotice";
import type { useOutboxSync } from "../sync/useOutboxSync";
import { isGoalkeeper } from "../team/positions";
import type { PlayerRow } from "../team/usePlayers";
import { benchSeconds } from "./consola/bench";
import { BenchStrip, type BenchItem } from "./consola/BenchStrip";
import { reconcileSlots, stepFlow, type Flow, type FlowEvent } from "./consola/flows";
import { GoalSheet, type GoalDraft } from "./consola/GoalSheet";
import { consolaMode, pickButtonSize, rowsFit, type ConsolaMode } from "./consola/layout";
import { PlayerCard, type CardAction } from "./consola/PlayerCard";
import { AdversarioCard, BolaCard, Tile, TransitionsCard, type AdvKey, type Contagem, type TransKey } from "./consola/QuickPanel";
import { SummarySheet } from "./consola/SummarySheet";
import { TransicaoSheet } from "./consola/TransicaoSheet";
import { ZonePanel } from "./consola/ZonePanel";
import { PlayerChip, Sheet } from "./PickerUI";
import type { useLiveMatch } from "./useLiveMatch";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
  onViewSummary: () => void;
  ourLabel: string;
  sync: ReturnType<typeof useOutboxSync>;
  onLeave: () => void;
  matchId: string;
}

type SheetKind =
  | { kind: "goal"; draft: GoalDraft }
  | { kind: "player"; playerId: string }
  | { kind: "pause" }
  | { kind: "equipa" }
  | { kind: "bench" }
  | { kind: "summary" }
  | { kind: "sync" }
  | { kind: "add-convocado" }
  | { kind: "settings" }
  | { kind: "transicao"; dir: "ofensiva" | "defensiva"; resultado?: "ganha" | "perdida" }
  | null;

function fmtMinSec(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

// Posição das linhas é estado de UI deste aparelho, nunca dados do jogo: se
// o localStorage falhar, a Consola funciona na mesma.
function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sem armazenamento: só se perde a ordem visual
  }
}

function viewport() {
  const el = document.documentElement;
  return { w: el.clientWidth, h: el.clientHeight };
}

const TRANS: Record<TransKey, { dir: "ofensiva" | "defensiva"; resultado: "ganha" | "perdida" }> = {
  favor_ganha: { dir: "ofensiva", resultado: "ganha" },
  favor_perdida: { dir: "ofensiva", resultado: "perdida" },
  contra_ganha: { dir: "defensiva", resultado: "ganha" },
  contra_perdida: { dir: "defensiva", resultado: "perdida" },
};

export function Consola({ live, roster, opponent, onViewSummary, ourLabel, sync, onLeave, matchId }: Props) {
  const { state, elapsedMs } = live;
  const byId = new Map(roster.map((p) => [p.id, p]));
  const isFinalPeriod = isLastPeriod(state.period, live.format);
  const preKickoff = !state.started;
  const awaitingKickoff = !state.clock.running && !state.finished;

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [flow, setFlow] = useState<Flow>(null);

  // Posição fixa das linhas (ver reconcileSlots): o GR fica na 1ª linha só
  // na primeira arrumação; depois cada um mantém a sua.
  const slotsKey = `teambench.consola.slots.${matchId}`;
  const [slots, setSlots] = useState<(string | null)[]>(() => readLocal<(string | null)[]>(slotsKey, []));
  const ordered = [...state.onCourt].sort((a, b) => Number(isGoalkeeper(byId.get(b)?.position)) - Number(isGoalkeeper(byId.get(a)?.position)));
  const nextSlots = reconcileSlots(slots, slots.some(Boolean) ? state.onCourt : ordered);
  const slotsChanged = nextSlots.length !== slots.length || nextSlots.some((id, i) => id !== slots[i]);
  useEffect(() => {
    if (!slotsChanged) return;
    setSlots(nextSlots);
    writeLocal(slotsKey, nextSlots);
  });

  // ---- layout: modo pelo viewport; botão o maior que cabe (FR-022/023) ----
  const [vp, setVp] = useState(viewport);
  useEffect(() => {
    const on = () => setVp(viewport());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  const mode: ConsolaMode = consolaMode(vp.w, vp.h);
  const phone = mode === "iphone-v" || mode === "iphone-h";
  const rowsRef = useRef<HTMLDivElement>(null);
  const [btn, setBtn] = useState(48);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    const h = el.clientHeight;
    const size = pickButtonSize(h, mode);
    if (size !== btn) setBtn(size);
    setOverflow(!rowsFit(h, mode, size));
  });

  // ---- contagens (sempre sobre os eventos efetivos: sem anulados) ----
  const efetivos = eventosEfetivos(state.events);
  const conta = (cat: CategoriaEquipa): Contagem => contarCategoria(state.events, cat, state.period);
  const podeAnular = (cat: CategoriaEquipa) => !state.finished && ultimoDaCategoria(state.events, cat) !== null;
  function anular(cat: CategoriaEquipa) {
    const alvo = ultimoDaCategoria(state.events, cat);
    if (alvo) live.doAnulacao(alvo.clientEventId ?? alvo.id);
  }
  // Transições por direção E resultado (as filas do cartão): a categoria do
  // motor é só por direção, por isso filtra-se aqui o resultado.
  const transDe = (k: TransKey) => efetivos.filter((e) => e.type === "transicao" && e.dir === TRANS[k].dir && e.resultado === TRANS[k].resultado);
  const transKeys = Object.keys(TRANS) as TransKey[];
  const transCounts = Object.fromEntries(
    transKeys.map((k) => {
      const l = transDe(k);
      return [k, { period: l.filter((e) => e.period === state.period).length, total: l.length }];
    })
  ) as Record<TransKey, Contagem>;
  const ultimaTrans = (k: TransKey): MatchEvent | undefined => { const l = transDe(k); return l[l.length - 1]; };
  const transCanMinus = Object.fromEntries(transKeys.map((k) => [k, !state.finished && !!ultimaTrans(k)])) as Record<TransKey, boolean>;

  const advKeys: AdvKey[] = ["golo_sofrido", "remate_adv_defendido", "remate_adv_fora", "remate_adv_bloqueado"];
  const advCounts = Object.fromEntries(advKeys.map((k) => [k, conta(k)])) as Record<AdvKey, Contagem>;
  const advCanMinus = Object.fromEntries(advKeys.map((k) => [k, podeAnular(k)])) as Record<AdvKey, boolean>;
  const zonas3: Zona3[] = ["defesa", "meio", "ataque"];
  const bolaCounts = {
    perda: Object.fromEntries(zonas3.map((z) => [z, conta(`perda_${z}`)])) as Record<Zona3, Contagem>,
    recuperacao: Object.fromEntries(zonas3.map((z) => [z, conta(`recuperacao_${z}`)])) as Record<Zona3, Contagem>,
  };
  const bolaCanMinus = {
    perda: Object.fromEntries(zonas3.map((z) => [z, podeAnular(`perda_${z}`)])) as Record<Zona3, boolean>,
    recuperacao: Object.fromEntries(zonas3.map((z) => [z, podeAnular(`recuperacao_${z}`)])) as Record<Zona3, boolean>,
  };
  const glInicio = goleiroLinhaAtivo(state.events, state.period);
  const goleiroLinhaMs = glInicio ? elapsedMs - glInicio.ms : null;
  const goalsFor = (id: string) => efetivos.filter((e) => e.type === "golo" && e.playerId === id).length;
  const timeoutNosUsed = timeoutUsedInPeriod(state.events, state.period, "tempo_nos");
  const timeoutAdversUsed = timeoutUsedInPeriod(state.events, state.period, "tempo_advers");
  const PAUSE_REASONS = [
    { id: "tempo_nos", label: `Pedido de Tempo — ${ourLabel}`, used: timeoutNosUsed },
    { id: "tempo_advers", label: "Pedido de Tempo — Adversário", used: timeoutAdversUsed },
    { id: "outro", label: "Outro motivo (lesão, árbitro, etc.)", used: false },
  ];

  const onCourtPlayers = state.onCourt.map((id) => byId.get(id)).filter((p): p is PlayerRow => !!p);
  const gkEmQuadra = onCourtPlayers.find((p) => isGoalkeeper(p.position)) ?? null;
  const bench = state.convocadoIds
    .filter((id) => !state.onCourt.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is PlayerRow => !!p);
  const benchItems: BenchItem[] = bench.map((p) => ({
    player: p,
    minutes: Math.floor(live.playerSeconds(p.id) / 60),
    benchSec: benchSeconds(state.events, p.id, state.period, elapsedMs),
  }));

  const nowMsForEvent = () => (live.manual ? live.manualElapsedMs : Date.now());
  const recording = !state.finished && !awaitingKickoff;

  // ---- fluxos de substituição / troca de linha / vaga ----
  function runFlow(ev: FlowEvent) {
    const step = stepFlow(flow, ev, { onCourtCount: state.onCourt.length, preKickoff });
    setFlow(step.flow);
    const fx = step.effect;
    if (fx?.type === "sub") live.doSub(fx.outId, fx.inId, fx.atMs);
    else if (fx?.type === "enter") live.doEnter(fx.inId);
    else if (fx?.type === "toggleTitular") live.toggleTitular(fx.playerId);
    return step.flow;
  }
  function benchTap(id: string) {
    runFlow({ type: "bench", inId: id, nowMs: nowMsForEvent() });
    // No iPhone o banco é uma folha: fecha-se para mostrar o "SAI" nos cartões.
    if (phone) setSheet(null);
  }
  function startSubFromPlayer(id: string) {
    const next = runFlow({ type: "out", outId: id, nowMs: nowMsForEvent() });
    setSheet(next?.kind === "pick-in" && phone ? { kind: "bench" } : null);
  }
  function cancelFlow() {
    runFlow({ type: "cancel" });
  }
  const queue = flow?.kind === "pick-out" ? flow.queue.map((q) => q.inId) : [];

  function openGoalSofrido() {
    setSheet({ kind: "goal", draft: { side: "adv", scorerId: null, openedAtMs: nowMsForEvent() } });
  }
  function adversario(k: AdvKey) {
    if (k === "golo_sofrido") openGoalSofrido();
    // "Defendido" = defesa do GR em quadra (decisão 6); fora/bloqueado sem jogador nosso.
    else if (k === "remate_adv_defendido") {
      if (gkEmQuadra) live.deferred.doDefesa(gkEmQuadra.id);
    } else live.deferred.doRemateAdv(k === "remate_adv_fora" ? "fora" : "bloqueado");
  }
  function bola(tipo: "perda" | "recuperacao", z: Zona3) {
    if (tipo === "perda") live.doPerda(z);
    else live.doRecuperacao(z);
  }
  function toggleGoleiroLinha() {
    if (goleiroLinhaMs !== null) live.doGoleiroLinhaFim();
    else live.doGoleiroLinhaInicio();
  }

  // `onAction` estável: os cartões são `memo` e não voltam a desenhar a cada
  // segundo do relógio; o handler lê sempre o estado mais recente pelo ref.
  const handlerRef = useRef<(id: string, a: CardAction) => void>(() => {});
  handlerRef.current = (id: string, a: CardAction) => {
    switch (a) {
      case "golo":
        setSheet({ kind: "goal", draft: { side: "nos", scorerId: id, openedAtMs: nowMsForEvent() } });
        break;
      // Lances com zona opcional: ficam à espera da zona antes de irem para a fila.
      case "falta":
        live.deferred.doFoul(id);
        break;
      case "falta_sofrida":
        live.deferred.doFoulSuffered(id);
        break;
      case "remate_defendido":
        live.deferred.doRemate(id, "defendido");
        break;
      case "remate_fora":
        live.deferred.doRemate(id, "fora");
        break;
      case "remate_bloqueado":
        live.deferred.doRemate(id, "bloqueado");
        break;
      case "saida_ganha":
        live.deferred.doSaida(id, "ganha");
        break;
      case "saida_perdida":
        live.deferred.doSaida(id, "perdida");
        break;
      case "mais":
        setSheet({ kind: "player", playerId: id });
        break;
      case "sai":
      case "tirar":
        runFlow({ type: "out", outId: id, nowMs: nowMsForEvent() });
        break;
    }
  };
  const onAction = useCallback((id: string, a: CardAction) => handlerRef.current(id, a), []);

  // ---- último lance + desfazer ----
  const lookup = (id: string) => {
    const p = byId.get(id);
    return p ? { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" } : undefined;
  };
  const last = state.events[state.events.length - 1];
  // Texto do registo sem o prefixo "[1ª Parte · mm:ss]" (a hora já vem à
  // frente) nem a lista "| em quadra: …", que não cabem na faixa.
  const lastText = last
    ? describeEvents(state.events, lookup, live.format)
        .get(last.id)
        ?.replace(/^\[[^\]]*\]\s*/, "")
        .replace(/^Anulado: \[[^\]]*\]\s*/, "Anulado: ")
        .replace(/\s*\|\s*em quadra:.*$/, "")
    : undefined;
  // Limites de parte não se desfazem aqui (research Decisão 9): o relógio nunca recua.
  const lastIsBoundary = last?.type === "kickoff" || last?.type === "fim_periodo";
  const canUndo = live.canUndo && !lastIsBoundary && flow === null && !state.finished;

  const cardMode = (): "events" | "pick-out" | "prekickoff" | "off" | "done" => {
    if (state.finished) return "done";
    if (preKickoff) return "prekickoff";
    if (flow?.kind === "pick-out") return "pick-out";
    if (awaitingKickoff) return "off";
    return "events";
  };

  const pauseMs = state.activePause ? elapsedMs - state.activePause.startedAtMs : 0;
  const nm = (id: string) => `#${byId.get(id)?.num} ${byId.get(id)?.name}`;
  const flowText =
    flow?.kind === "pick-out"
      ? flow.queue.length > 1
        ? `Troca de linha — entram ${flow.queue.map((q, i) => `${i + 1}. ${nm(q.inId)}`).join(", ")}. Toca em SAI pela mesma ordem`
        : `Entra ${nm(flow.queue[0].inId)} — toca em SAI no cartão de quem sai (ou junta mais do banco)`
      : flow?.kind === "pick-in"
        ? `Sai ${nm(flow.outId)} — escolhe no banco quem entra`
        : null;
  const syncText = sync.pending > 0 ? (sync.syncing ? "A sincronizar…" : `${sync.pending} por sincronizar`) : "Sincronizado";

  // ---- blocos ----
  const lastLine = (
    <span className="cv-last">
      {state.activePause
        ? `⏱ ${state.activePause.label} · ${fmtMinSec(pauseMs)}`
        : last
          ? `${String(last.min).padStart(2, "0")}:${String(last.sec).padStart(2, "0")} · ${lastText ?? last.type}`
          : preKickoff
            ? `Cinco inicial ${state.onCourt.length}/5 — toca no banco para pôr, "Tirar do cinco" para tirar`
            : "Sem lances ainda"}
    </span>
  );
  const glBtn = (
    <button type="button" className={`cv-ghost gl${goleiroLinhaMs !== null ? " on" : ""}`} disabled={!recording} onClick={toggleGoleiroLinha}>
      {goleiroLinhaMs !== null ? `GR-linha ${fmtMinSec(goleiroLinhaMs)} ■` : "GR-linha"}
    </button>
  );
  const pauseBtn = (
    <button
      type="button"
      className={`cv-ghost pz${state.activePause ? " warn" : ""}`}
      disabled={!recording}
      onClick={() => (state.activePause ? live.endPause() : setSheet({ kind: "pause" }))}
    >
      {state.activePause ? "▶ Retomar" : "⏸ Pausa"}
    </button>
  );
  const endBtn = (
    <button type="button" className="cv-ghost end" disabled={!recording} onClick={() => live.endPeriod()}>
      {isFinalPeriod ? "Terminar jogo" : "Fim da parte"}
    </button>
  );
  const undoBtn = (
    <button type="button" className="cv-ghost undo" disabled={!canUndo} onClick={live.undo}>
      <span className="ic">↩</span> <span>Desfazer</span>
    </button>
  );

  const top = (
    <header className="cv-top">
      <div className="cv-score">
        <span className="t">{ourLabel}</span>
        <span className="n">
          {state.score.nos}–{state.score.advers}
        </span>
        <span className="t">{opponent || "Adv."}</span>
      </div>
      <div className="cv-clock">
        <span className="p">
          {state.period}.ª parte{state.activePause ? " · pausa" : ""}
        </span>
        <span className="t">{fmtMinSec(elapsedMs)}</span>
      </div>
      <div className={`cv-fouls${state.periodFouls >= 5 ? " warn" : ""}`}>
        Faltas
        <b>
          {state.periodFouls} · {state.periodFoulsAdvers}
        </b>
      </div>
      {lastLine}
      {sync.rejectedCount > 0 || sync.rejectedCorrupted ? (
        <button
          type="button"
          className="cv-pill rejected"
          onClick={() => setSheet({ kind: "sync" })}
          aria-label={
            sync.rejectedCorrupted
              ? "Lista de lances recusados ilegível, ver detalhes"
              : `${sync.rejectedCount} ${sync.rejectedCount === 1 ? "lance recusado" : "lances recusados"} pelo servidor, ver detalhes`
          }
        >
          <span aria-hidden="true">⚠ </span>
          {sync.rejectedCorrupted ? "recusados ilegíveis" : `${sync.rejectedCount} recusado${sync.rejectedCount === 1 ? "" : "s"}`}
        </button>
      ) : (
        <span className={`cv-pill${sync.pending > 0 ? " pending" : ""}`}>{syncText}</span>
      )}
      {!phone && (
        <>
          {glBtn}
          {pauseBtn}
          {endBtn}
        </>
      )}
      {undoBtn}
      {!phone && (
        <button type="button" className="cv-ghost cfg" aria-label="Definições" onClick={() => setSheet({ kind: "settings" })}>
          ⚙
        </button>
      )}
    </header>
  );

  const transitions = (
    <TransitionsCard
      counts={transCounts}
      canMinus={transCanMinus}
      disabled={!recording}
      onPick={(k, n) => live.doTransicao(TRANS[k].dir, TRANS[k].resultado, n)}
      onMore={(k) => setSheet({ kind: "transicao", dir: TRANS[k].dir, resultado: TRANS[k].resultado })}
      onMinus={(k) => {
        const alvo = ultimaTrans(k);
        if (alvo) live.doAnulacao(alvo.clientEventId ?? alvo.id);
      }}
    />
  );
  const adversarioCard = (
    <AdversarioCard
      counts={advCounts}
      canMinus={advCanMinus}
      disabled={!recording}
      defesaDisabled={!gkEmQuadra}
      onPlus={(k) => {
        adversario(k);
        if (phone && k !== "golo_sofrido") setSheet(null);
      }}
      onMinus={anular}
    />
  );
  const bolaCard = (
    <BolaCard
      counts={bolaCounts}
      canMinus={bolaCanMinus}
      disabled={!recording}
      onPlus={(t, z) => {
        bola(t, z);
        if (phone) setSheet(null);
      }}
      onMinus={(t, z) => anular(`${t}_${z}`)}
    />
  );

  // iPhone: as três categorias mais usadas sempre à vista, com "−".
  const phoneTiles = (
    <>
      <Tile
        label="Trans. a favor"
        c={conta("transicao_favor")}
        tone="pos"
        disabled={!recording}
        canMinus={podeAnular("transicao_favor")}
        onPlus={() => setSheet({ kind: "transicao", dir: "ofensiva" })}
        onMinus={() => anular("transicao_favor")}
      />
      <Tile
        label="Trans. contra"
        c={conta("transicao_contra")}
        tone="neg"
        disabled={!recording}
        canMinus={podeAnular("transicao_contra")}
        onPlus={() => setSheet({ kind: "transicao", dir: "defensiva" })}
        onMinus={() => anular("transicao_contra")}
      />
      <Tile
        label="Golo sofrido"
        c={advCounts.golo_sofrido}
        tone="neg"
        disabled={!recording}
        canMinus={advCanMinus.golo_sofrido}
        onPlus={openGoalSofrido}
        onMinus={() => anular("golo_sofrido")}
      />
    </>
  );

  const cards = (
    <div className={`cv-players${overflow ? " overflow" : ""}`} ref={rowsRef}>
      {nextSlots.map((id, i) => {
        const p = id ? byId.get(id) ?? null : null;
        return (
          <PlayerCard
            key={id ?? `vaga-${i}`}
            slot={i}
            player={p}
            minutes={id ? Math.floor(live.playerSeconds(id) / 60) : 0}
            goals={id ? goalsFor(id) : 0}
            compact={phone}
            mode={cardMode()}
            saiN={flow?.kind === "pick-out" && flow.queue.length > 1 ? 1 : null}
            inTreatment={!!id && state.treatment?.playerId === id}
            onAction={onAction}
          />
        );
      })}
    </div>
  );

  return (
    <div className={`consola cv cv--${mode}`} style={{ "--cbtn": `${btn}px` } as unknown as Record<string, string>}>
      {top}

      {flowText && (
        <div className="cv-banner flow">
          <span>{flowText}</span>
          <button type="button" className="cv-ghost" onClick={cancelFlow}>
            Cancelar
          </button>
        </div>
      )}
      {awaitingKickoff && (
        <button type="button" className="cv-kick" onClick={() => live.resumeOrStart()}>
          Iniciar Parte {state.period}
        </button>
      )}
      {state.treatment && (
        <div className="cv-banner">
          <span>🩹 Atendimento: {byId.get(state.treatment.playerId)?.name}</span>
          <button type="button" className="cv-ghost" onClick={live.endTreatment}>
            Terminar
          </button>
        </div>
      )}
      {state.finished && (
        <div className="cv-banner done">
          <span>
            Jogo terminado — {state.score.nos}–{state.score.advers}
          </span>
          <button type="button" className="cv-ghost" onClick={onViewSummary}>
            Ver Resumo
          </button>
        </div>
      )}
      {live.enqueueFailed && (
        <div className="cv-banner error">
          Não foi possível guardar um lance neste aparelho (armazenamento cheio ou indisponível). Liberte espaço antes de continuar.
        </div>
      )}

      {mode === "iphone-v" && <div className="cv-phonebar">{phoneTiles}</div>}

      <div className="cv-main">
        <section className="cv-left">
          {cards}
          {!phone && <BenchStrip items={benchItems} queue={queue} pickIn={flow?.kind === "pick-in"} disabled={state.finished} onTap={benchTap} />}
        </section>
        {!phone && (
          <aside className="cv-right">
            {transitions}
            {adversarioCard}
            {bolaCard}
          </aside>
        )}
        {mode === "iphone-h" && (
          <aside className="cv-side">
            {phoneTiles}
            <button type="button" className="cv-ghost" disabled={state.finished} onClick={() => setSheet({ kind: "bench" })}>
              Banco
            </button>
            <button type="button" className="cv-ghost" onClick={() => setSheet({ kind: "equipa" })}>
              Equipa…
            </button>
          </aside>
        )}
      </div>

      {mode === "iphone-v" && (
        <nav className="cv-dock">
          <button type="button" className="cv-ghost" disabled={state.finished} onClick={() => setSheet({ kind: "bench" })}>
            Banco
          </button>
          <button type="button" className="cv-ghost" onClick={() => setSheet({ kind: "equipa" })}>
            Equipa…
          </button>
          <button type="button" className="cv-ghost" onClick={() => setSheet({ kind: "summary" })}>
            Resumo
          </button>
          {pauseBtn}
        </nav>
      )}

      {(() => {
        const ev = live.pendingZonaKey ? state.events.find((e) => (e.clientEventId ?? e.id) === live.pendingZonaKey) : undefined;
        if (!ev || sheet || flow) return null;
        return (
          <ZonePanel
            event={ev}
            player={ev.playerId ? byId.get(ev.playerId) : undefined}
            onPick={(z) => live.setPendingZona(z)}
            onClose={() => live.closePendingZona()}
          />
        );
      })()}

      {/* ---- folhas ---- */}

      {sheet?.kind === "goal" && (
        <GoalSheet
          draft={sheet.draft}
          onCourt={onCourtPlayers}
          roster={byId}
          opponent={opponent}
          onClose={() => setSheet(null)}
          onConfirm={(r) => {
            if (sheet.draft.side === "nos" && r.scorerId) {
              live.doGoal(r.scorerId, r.assistId, r.tipo, r.zona, r.transicaoNumeros, r.balizaDeserta, r.openedAtMs);
            } else if (sheet.draft.side === "adv") {
              live.doOppGoal(r.tipo, r.zona, r.transicaoNumeros, r.balizaDeserta, r.openedAtMs);
            }
            setSheet(null);
          }}
        />
      )}

      {sheet?.kind === "player" &&
        (() => {
          const p = byId.get(sheet.playerId);
          if (!p) return null;
          const inTreatment = state.treatment?.playerId === p.id;
          const close = (fn: () => void) => () => {
            fn();
            setSheet(null);
          };
          return (
            <Sheet title={`#${p.num} ${p.name}`} onClose={() => setSheet(null)}>
              <div className="actiongrid">
                <button type="button" className="abtn yellow" disabled={preKickoff} onClick={close(() => live.deferred.doCard(p.id, "amarelo"))}>
                  <span className="ic">🟨</span>Amarelo
                </button>
                <button type="button" className="abtn red" disabled={preKickoff} onClick={close(() => live.deferred.doCard(p.id, "vermelho"))}>
                  <span className="ic">🟥</span>Vermelho
                </button>
                <button
                  type="button"
                  className="abtn stop"
                  disabled={preKickoff}
                  onClick={close(() => (inTreatment ? live.endTreatment() : live.startTreatment(p.id)))}
                >
                  <span className="ic">🩹</span>
                  {inTreatment ? "Terminar atendimento" : "Atendimento"}
                </button>
                <button type="button" className="abtn" disabled={preKickoff || bench.length === 0} onClick={() => startSubFromPlayer(p.id)}>
                  <span className="ic">🔁</span>Substituir (sai)
                </button>
              </div>
            </Sheet>
          );
        })()}

      {sheet?.kind === "bench" && (
        <Sheet
          title={flow?.kind === "pick-in" ? "Quem entra?" : "Banco"}
          sub={flow?.kind === "pick-in" ? `Sai ${nm(flow.outId)}` : "Toca em quem entra; depois em SAI no cartão de quem sai"}
          onClose={() => {
            setSheet(null);
            if (flow?.kind === "pick-in") cancelFlow();
          }}
        >
          <BenchStrip className="in-sheet" items={benchItems} queue={queue} pickIn={flow?.kind === "pick-in"} disabled={state.finished} onTap={benchTap} />
          {!state.finished && (
            <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setSheet({ kind: "add-convocado" })}>
              + Chamar atleta ao banco
            </button>
          )}
        </Sheet>
      )}

      {flow?.kind === "vacancy" && (
        <Sheet title="Repor a vaga" sub="A elegibilidade da reposição não é validada — confirma que este atleta pode entrar." onClose={cancelFlow}>
          <div className="cv-bench in-sheet">
            {bench.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`cv-bp${flow.inId === p.id ? " sel" : ""}`}
                onClick={() => runFlow({ type: "bench", inId: p.id, nowMs: nowMsForEvent() })}
              >
                <b>
                  #{p.num} {p.name}
                </b>
              </button>
            ))}
          </div>
          <button type="button" className="btn primary block" style={{ marginTop: 12 }} onClick={() => runFlow({ type: "confirm" })}>
            Confirmar entrada de {nm(flow.inId)}
          </button>
        </Sheet>
      )}

      {sheet?.kind === "pause" && (
        <Sheet title="Motivo da pausa" onClose={() => setSheet(null)}>
          {PAUSE_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="btn ghost block"
              disabled={r.used}
              style={{ marginBottom: 6, textAlign: "left", minHeight: 48 }}
              onClick={() => {
                live.pause(r.label, r.id);
                setSheet(null);
              }}
            >
              {r.label}
              {r.used ? " (já usado nesta parte)" : ""}
            </button>
          ))}
        </Sheet>
      )}

      {sheet?.kind === "equipa" && (
        <Sheet title="Equipa" onClose={() => setSheet(null)}>
          {recording && (
            <>
              {mode === "iphone-h" && transitions}
              {adversarioCard}
              {bolaCard}
            </>
          )}
          <div className="actiongrid">
            {recording && (
              <button
                type="button"
                className="abtn"
                onClick={() => {
                  toggleGoleiroLinha();
                  setSheet(null);
                }}
              >
                {goleiroLinhaMs !== null ? `Terminar GR-linha (${fmtMinSec(goleiroLinhaMs)})` : "Iniciar GR-linha"}
              </button>
            )}
            {recording && (
              <button
                type="button"
                className="abtn"
                onClick={() => {
                  live.endPeriod();
                  setSheet(null);
                }}
              >
                {isFinalPeriod ? "Terminar jogo" : `Fim da Parte ${state.period}`}
              </button>
            )}
            {mode === "iphone-h" && recording && (
              <button type="button" className="abtn" onClick={() => (state.activePause ? (live.endPause(), setSheet(null)) : setSheet({ kind: "pause" }))}>
                {state.activePause ? "▶ Retomar" : "⏸ Pausa"}
              </button>
            )}
            {!state.finished && (
              <button type="button" className="abtn" onClick={() => setSheet({ kind: "add-convocado" })}>
                Chamar atleta ao banco
              </button>
            )}
            <button type="button" className="abtn" onClick={() => setSheet({ kind: "summary" })}>
              Resumo rápido
            </button>
            <button type="button" className="abtn" onClick={onViewSummary}>
              📋 Resumo do jogo
            </button>
            <button type="button" className="abtn" onClick={() => setSheet({ kind: "settings" })}>
              ⚙ Definições
            </button>
          </div>
        </Sheet>
      )}

      {sheet?.kind === "settings" && (
        <Sheet title="Definições da Consola" onClose={() => setSheet(null)}>
          {!phone && (
            <div className="actiongrid" style={{ marginTop: 0 }}>
              <button type="button" className="abtn" onClick={() => setSheet({ kind: "summary" })}>
                Resumo rápido
              </button>
              <button type="button" className="abtn" onClick={onViewSummary}>
                📋 Resumo do jogo
              </button>
              {!state.finished && (
                <button type="button" className="abtn" onClick={() => setSheet({ kind: "add-convocado" })}>
                  Chamar atleta ao banco
                </button>
              )}
            </div>
          )}
          <button type="button" className="btn block" style={{ marginTop: 14 }} onClick={onLeave}>
            Sair da Consola (voltar ao Jogo)
          </button>
        </Sheet>
      )}

      {sheet?.kind === "sync" && (
        <Sheet title="Sincronização" onClose={() => setSheet(null)}>
          <p className="hint" style={{ marginBottom: 10 }}>{syncText}</p>
          <RejectedNotice sync={sync} />
        </Sheet>
      )}

      {sheet?.kind === "summary" && (
        <SummarySheet
          events={state.events}
          period={state.period}
          canAnular={!state.finished}
          onAnular={(alvoId) => live.doAnulacao(alvoId)}
          onOpenFullSummary={onViewSummary}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === "transicao" && (
        <TransicaoSheet
          dir={sheet.dir}
          resultado={sheet.resultado}
          onClose={() => setSheet(null)}
          onPick={(resultado, numeros) => {
            live.doTransicao(sheet.dir, resultado, numeros);
            setSheet(null);
          }}
        />
      )}

      {sheet?.kind === "add-convocado" && !state.finished && (
        <Sheet title="Chamar atleta ao banco" sub="Quem não estava nos convocados — passa a poder entrar a partir de agora" onClose={() => setSheet(null)}>
          <div className="pgrid">
            {roster
              .filter((p) => !state.convocadoIds.includes(p.id))
              .map((p) => (
                <PlayerChip
                  key={p.id}
                  p={p}
                  onClick={() => {
                    live.toggleConvocado(p.id);
                    setSheet(null);
                  }}
                />
              ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
