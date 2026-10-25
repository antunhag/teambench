/**
 * Consola — segunda tela de registo ao vivo (specs/009-captura-detalhada/).
 * Etapa 1: só usa ações que o "Jogo ao vivo" já usa, através do mesmo
 * useLiveMatch montado pelo mesmo MatchFlow (mesma trava, mesma fila):
 * resumeOrStart, pause/endPause, endPeriod, doGoal, doOppGoal, doCard,
 * doFoul, doFoulSuffered, startTreatment/endTreatment, doSub, doEnter,
 * toggleTitular, toggleConvocado, undo. Nada de novo no motor nem na BD.
 *
 * Ocupa o ecrã inteiro (camada fixa abaixo das folhas `.overlay`) porque a
 * `.page` normal tem no máximo 760 px e leva topo/abas por cima — no iPhone
 * a altura útil e no tablet deitado a largura não chegavam.
 */
import { describeEvents, isLastPeriod, timeoutUsedInPeriod } from "@teambench/engine";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { useOutboxSync } from "../sync/useOutboxSync";
import { isGoalkeeper } from "../team/positions";
import type { PlayerRow } from "../team/usePlayers";
import { ConsolaRow, type Density, type RowAction } from "./consola/ConsolaRow";
import { reconcileSlots, stepFlow, type Flow, type FlowEvent } from "./consola/flows";
import { GoalSheet, type GoalDraft } from "./consola/GoalSheet";
import { consolaMode, pickButtonSize, rowsFit, type ConsolaMode } from "./consola/layout";
import { SummarySheet } from "./consola/SummarySheet";
import { TeamBar } from "./consola/TeamBar";
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

type Sheetkind =
  | { kind: "goal"; draft: GoalDraft }
  | { kind: "player"; playerId: string }
  | { kind: "pause" }
  | { kind: "more" }
  | { kind: "bench" }
  | { kind: "summary" }
  | { kind: "add-convocado" }
  | { kind: "settings" }
  | null;

function fmtMinSec(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

// Preferências e posição das linhas são estado de UI deste aparelho, nunca
// dados do jogo: se o localStorage falhar, a Consola funciona na mesma.
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
    // sem armazenamento: só se perde a preferência/ordem visual
  }
}

function viewport() {
  const el = document.documentElement;
  return { w: el.clientWidth, h: el.clientHeight };
}

export function Consola({ live, roster, opponent, onViewSummary, ourLabel, sync, onLeave, matchId }: Props) {
  const { state, elapsedMs } = live;
  const byId = new Map(roster.map((p) => [p.id, p]));
  const isFinalPeriod = isLastPeriod(state.period, live.format);
  const preKickoff = !state.started;
  const awaitingKickoff = !state.clock.running && !state.finished;

  const [sheet, setSheet] = useState<Sheetkind>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [density, setDensityState] = useState<Density>(() => readLocal<Density>("teambench.consola.density", "B"));
  function setDensity(d: Density) {
    setDensityState(d);
    writeLocal("teambench.consola.density", d);
  }

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

  // ---- contagens ----
  const oppGoals = {
    period: state.events.filter((e) => e.type === "golo_sofrido" && e.period === state.period).length,
    total: state.events.filter((e) => e.type === "golo_sofrido").length,
  };
  const goalsFor = (id: string) => state.events.filter((e) => e.type === "golo" && e.playerId === id).length;
  const timeoutNosUsed = timeoutUsedInPeriod(state.events, state.period, "tempo_nos");
  const timeoutAdversUsed = timeoutUsedInPeriod(state.events, state.period, "tempo_advers");
  const PAUSE_REASONS = [
    { id: "tempo_nos", label: `Pedido de Tempo — ${ourLabel}`, used: timeoutNosUsed },
    { id: "tempo_advers", label: "Pedido de Tempo — Adversário", used: timeoutAdversUsed },
    { id: "outro", label: "Outro motivo (lesão, árbitro, etc.)", used: false },
  ];

  const onCourtPlayers = state.onCourt.map((id) => byId.get(id)).filter((p): p is PlayerRow => !!p);
  const bench = state.convocadoIds
    .filter((id) => !state.onCourt.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is PlayerRow => !!p);

  const nowMsForEvent = () => (live.manual ? live.manualElapsedMs : Date.now());

  // ---- fluxos de substituição / vaga ----
  function runFlow(ev: FlowEvent) {
    const step = stepFlow(flow, ev, { onCourtCount: state.onCourt.length, preKickoff });
    setFlow(step.flow);
    const fx = step.effect;
    if (fx?.type === "sub") live.doSub(fx.outId, fx.inId, fx.atMs);
    else if (fx?.type === "enter") live.doEnter(fx.inId);
    else if (fx?.type === "toggleTitular") live.toggleTitular(fx.playerId);
    return step.flow;
  }
  const benchVisible = mode === "tablet-v" || mode === "tablet-h";

  function benchTap(id: string) {
    const next = runFlow({ type: "bench", inId: id, nowMs: nowMsForEvent() });
    // No iPhone o banco é uma folha: fecha-se para mostrar o "SAI" nas linhas.
    setSheet(null);
    return next;
  }
  function startSubFromPlayer(id: string) {
    const next = runFlow({ type: "out", outId: id, nowMs: nowMsForEvent() });
    setSheet(next?.kind === "pick-in" && !benchVisible ? { kind: "bench" } : null);
  }
  function cancelFlow() {
    runFlow({ type: "cancel" });
  }

  // `onAction` estável: as linhas são `memo` e não voltam a desenhar a cada
  // segundo do relógio; o handler lê sempre o estado mais recente pelo ref.
  const handlerRef = useRef<(id: string, a: RowAction) => void>(() => {});
  handlerRef.current = (id: string, a: RowAction) => {
    switch (a) {
      case "golo":
        setSheet({ kind: "goal", draft: { side: "nos", scorerId: id, openedAtMs: nowMsForEvent() } });
        break;
      case "golo_sofrido":
        setSheet({ kind: "goal", draft: { side: "adv", scorerId: null, openedAtMs: nowMsForEvent() } });
        break;
      case "falta":
        live.doFoul(id);
        break;
      case "falta_sofrida":
        live.doFoulSuffered(id);
        break;
      case "amarelo":
        live.doCard(id, "amarelo");
        break;
      case "vermelho":
        live.doCard(id, "vermelho");
        break;
      case "mais":
        setSheet({ kind: "player", playerId: id });
        break;
      case "sai":
        runFlow({ type: "out", outId: id, nowMs: nowMsForEvent() });
        break;
      case "tirar":
        runFlow({ type: "out", outId: id, nowMs: nowMsForEvent() });
        break;
    }
  };
  const onAction = useCallback((id: string, a: RowAction) => handlerRef.current(id, a), []);

  // ---- último evento + desfazer ----
  const lookup = (id: string) => {
    const p = byId.get(id);
    return p ? { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" } : undefined;
  };
  const last = state.events[state.events.length - 1];
  // describeEvents é o texto do registo do "Jogo ao vivo"; na faixa curta
  // tira-se o prefixo "[1ª Parte · mm:ss]" (a hora já aparece à frente) e a
  // lista "| em quadra: …", que não cabem numa linha de telefone.
  const lastText = last
    ? describeEvents(state.events, lookup, live.format)
        .get(last.id)
        ?.replace(/^\[[^\]]*\]\s*/, "")
        .replace(/\s*\|\s*em quadra:.*$/, "")
    : undefined;
  // Limites de parte não se desfazem aqui (research Decisão 9): o relógio nunca recua.
  const lastIsBoundary = last?.type === "kickoff" || last?.type === "fim_periodo";
  const canUndo = live.canUndo && !lastIsBoundary && flow === null && !state.finished;

  const rowMode = (): "events" | "pick-out" | "prekickoff" | "off" | "done" => {
    if (state.finished) return "done";
    if (preKickoff) return "prekickoff";
    if (flow?.kind === "pick-out") return "pick-out";
    if (awaitingKickoff) return "off";
    return "events";
  };

  const pauseMs = state.activePause ? elapsedMs - state.activePause.startedAtMs : 0;
  const flowText =
    flow?.kind === "pick-out"
      ? `Entra #${byId.get(flow.inId)?.num} ${byId.get(flow.inId)?.name} — toca em SAI na linha de quem sai`
      : flow?.kind === "pick-in"
        ? `Sai #${byId.get(flow.outId)?.num} ${byId.get(flow.outId)?.name} — escolhe no banco quem entra`
        : null;

  const syncText = sync.pending > 0 ? (sync.syncing ? "A sincronizar…" : `${sync.pending} por sincronizar`) : "Sincronizado";

  const benchList = (
    <div className="consola-bench-list">
      {bench.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`cbtn bench${isGoalkeeper(p.position) ? " gr" : ""}${flow?.kind === "pick-in" ? " entra" : ""}${flow?.kind === "pick-out" && flow.inId === p.id ? " selected" : ""}`}
          disabled={state.finished}
          onClick={() => benchTap(p.id)}
        >
          <span>#{p.num} {p.name}</span>
          <span className="cnt">{Math.floor(live.playerSeconds(p.id) / 60)}'</span>
        </button>
      ))}
      {bench.length === 0 && <span className="hint">Ninguém no banco.</span>}
    </div>
  );

  const headEl = (
    <header className="consola-head">
      <div className="score">
        <span className="lbl">{ourLabel}</span>
        <span className="val num">{state.score.nos}</span>
      </div>
      <div className="clock">
        <span className="lbl">Parte {state.period}{state.activePause ? " · pausa" : ""}</span>
        <span className="time num">{fmtMinSec(elapsedMs)}</span>
      </div>
      <div className="score">
        <span className="lbl">{opponent || "Advers."}</span>
        <span className="val num">{state.score.advers}</span>
      </div>
      <div className="side">
        <span className={`fouls${state.periodFouls >= 5 ? " warn" : ""}`}>Faltas {state.periodFouls}·{state.periodFoulsAdvers}</span>
        <span className={`sync${sync.pending > 0 ? " pending" : ""}`}>{syncText}</span>
      </div>
    </header>
  );

  const lastEl = (
    <div className={`consola-last${flowText ? " flow" : ""}`}>
      {flowText ? (
        <>
          <span className="txt">{flowText}</span>
          <button type="button" className="cbtn" onClick={cancelFlow}>Cancelar</button>
        </>
      ) : (
        <>
          <span className="txt">
            {state.activePause
              ? `⏱ ${state.activePause.label} · ${fmtMinSec(pauseMs)}`
              : last
                ? `${String(last.min).padStart(2, "0")}:${String(last.sec).padStart(2, "0")} · ${lastText ?? last.type}`
                : preKickoff
                  ? `Cinco inicial ${state.onCourt.length}/5 — toca no banco para pôr, "Tirar do cinco" para tirar`
                  : "Sem eventos ainda"}
          </span>
          <button type="button" className="cbtn" disabled={!canUndo} onClick={live.undo}>
            ↩ Desfazer
          </button>
          {mode === "tablet-v" || mode === "tablet-h" ? (
            <button type="button" className="cbtn" onClick={() => setSheet({ kind: "summary" })}>Resumo</button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <div
      className={`consola consola--${mode}`}
      style={{ "--cbtn": `${btn}px` } as unknown as Record<string, string>}
    >
      {mode === "iphone-h" ? (
        <div className="consola-top">
          {headEl}
          {lastEl}
        </div>
      ) : (
        <>
          {headEl}
          <TeamBar
            mode={mode}
            period={state.period}
            oppGoals={oppGoals}
            awaitingKickoff={awaitingKickoff}
            finished={state.finished}
            paused={!!state.activePause}
            isFinalPeriod={isFinalPeriod}
            onOppGoal={() => handlerRef.current("", "golo_sofrido")}
            onKickoff={() => live.resumeOrStart()}
            onPause={() => setSheet({ kind: "pause" })}
            onResume={() => live.endPause()}
            onEndPeriod={() => live.endPeriod()}
            onMore={() => setSheet({ kind: "more" })}
          />
          {lastEl}
        </>
      )}

      {state.treatment && (
        <div className="consola-banner">
          🩹 Atendimento: {byId.get(state.treatment.playerId)?.name}
          <button type="button" className="cbtn" onClick={live.endTreatment}>Terminar</button>
        </div>
      )}
      {state.finished && (
        <div className="consola-banner done">
          Jogo terminado — {state.score.nos}–{state.score.advers}
          <button type="button" className="cbtn kick" onClick={onViewSummary}>Ver Resumo</button>
        </div>
      )}
      {live.enqueueFailed && (
        <div className="consola-banner error">
          Não foi possível guardar um evento neste aparelho (armazenamento cheio ou indisponível). Liberte espaço antes de continuar.
        </div>
      )}

      <div className="consola-body">
        <div className={`consola-rows${overflow ? " overflow" : ""}`} ref={rowsRef}>
          {nextSlots.map((id, i) => {
            const p = id ? byId.get(id) ?? null : null;
            return (
              <ConsolaRow
                key={id ?? `vaga-${i}`}
                slot={i}
                player={p}
                minutes={id ? Math.floor(live.playerSeconds(id) / 60) : 0}
                goals={id ? goalsFor(id) : 0}
                density={density}
                mode={rowMode()}
                inTreatment={!!id && state.treatment?.playerId === id}
                onAction={onAction}
              />
            );
          })}
        </div>

        {benchVisible && (
          <aside className="consola-bench">
            <div className="consola-bench-title">Banco ({bench.length})</div>
            {benchList}
          </aside>
        )}

        {mode === "iphone-h" && (
          <aside className="consola-side">
            {awaitingKickoff && !state.finished ? (
              <button type="button" className="cbtn kick" onClick={() => live.resumeOrStart()}>Iniciar Parte {state.period}</button>
            ) : (
              !state.finished && (
                <button type="button" className="cbtn opp" onClick={() => handlerRef.current("", "golo_sofrido")}>
                  Golo sofrido <span className="cnt">{oppGoals.period}·{oppGoals.total}</span>
                </button>
              )
            )}
            <button type="button" className="cbtn" onClick={() => setSheet({ kind: "bench" })}>Banco</button>
            <button type="button" className="cbtn" onClick={() => setSheet({ kind: "summary" })}>Resumo</button>
            <button type="button" className="cbtn" onClick={() => setSheet({ kind: "more" })}>Equipa…</button>
          </aside>
        )}
      </div>

      {mode === "iphone-v" && (
        <nav className="consola-dock">
          <button type="button" className="cbtn" disabled={state.finished} onClick={() => setSheet({ kind: "bench" })}>Substituir</button>
          <button type="button" className="cbtn" onClick={() => setSheet({ kind: "summary" })}>Resumo</button>
          <button
            type="button"
            className={`cbtn${state.activePause ? " warn" : ""}`}
            disabled={awaitingKickoff || state.finished}
            onClick={() => (state.activePause ? live.endPause() : setSheet({ kind: "pause" }))}
          >
            {state.activePause ? "▶ Retomar" : "⏸ Pausa"}
          </button>
          <button type="button" className="cbtn" aria-label="Definições" onClick={() => setSheet({ kind: "settings" })}>⚙</button>
        </nav>
      )}

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
                <button type="button" className="abtn yellow" disabled={preKickoff} onClick={close(() => live.doCard(p.id, "amarelo"))}>
                  <span className="ic">🟨</span>Amarelo
                </button>
                <button type="button" className="abtn red" disabled={preKickoff} onClick={close(() => live.doCard(p.id, "vermelho"))}>
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
          sub={flow?.kind === "pick-in" ? `Sai #${byId.get(flow.outId)?.num} ${byId.get(flow.outId)?.name}` : "Toca em quem entra; depois em SAI na linha de quem sai"}
          onClose={() => {
            setSheet(null);
            if (flow?.kind === "pick-in") cancelFlow();
          }}
        >
          {benchList}
          {!state.finished && (
            <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setSheet({ kind: "add-convocado" })}>
              + Chamar atleta ao banco
            </button>
          )}
        </Sheet>
      )}

      {flow?.kind === "vacancy" && (
        <Sheet title="Repor a vaga" sub="A elegibilidade da reposição não é validada — confirma que este atleta pode entrar." onClose={cancelFlow}>
          <div className="consola-bench-list">
            {bench.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`cbtn bench${flow.inId === p.id ? " selected" : ""}`}
                onClick={() => runFlow({ type: "bench", inId: p.id, nowMs: nowMsForEvent() })}
              >
                #{p.num} {p.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn primary block" style={{ marginTop: 12 }} onClick={() => runFlow({ type: "confirm" })}>
            Confirmar entrada de #{byId.get(flow.inId)?.num} {byId.get(flow.inId)?.name}
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

      {sheet?.kind === "more" && (
        <Sheet title="Equipa" onClose={() => setSheet(null)}>
          <div className="actiongrid">
            {!awaitingKickoff && !state.finished && (
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
            {mode === "iphone-h" && !awaitingKickoff && !state.finished && (
              <button
                type="button"
                className="abtn"
                onClick={() => (state.activePause ? (live.endPause(), setSheet(null)) : setSheet({ kind: "pause" }))}
              >
                {state.activePause ? "▶ Retomar" : "⏸ Pausa"}
              </button>
            )}
            {!state.finished && (
              <button type="button" className="abtn" onClick={() => setSheet({ kind: "add-convocado" })}>
                Chamar atleta ao banco
              </button>
            )}
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
          <p className="sub">Ações em cada linha</p>
          <div className="actiongrid">
            <button type="button" className={`abtn${density === "B" ? " selected" : ""}`} onClick={() => setDensity("B")}>
              Essenciais (cartões no ⋯)
            </button>
            <button type="button" className={`abtn${density === "A" ? " selected" : ""}`} onClick={() => setDensity("A")}>
              Todas (cartões na linha)
            </button>
          </div>
          <button type="button" className="btn block" style={{ marginTop: 14 }} onClick={onLeave}>
            Sair da Consola (voltar ao Jogo)
          </button>
        </Sheet>
      )}

      {sheet?.kind === "summary" && (
        <SummarySheet events={state.events} period={state.period} onOpenFullSummary={onViewSummary} onClose={() => setSheet(null)} />
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
