import { describeEvent, isLastPeriod, TIPOS_GOLO, ZONAS_GOLO } from "@teambench/engine";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { PlayerRow } from "../team/usePlayers";
import { isGoalkeeper, posAbbr } from "../team/positions";
import type { useLiveMatch } from "./useLiveMatch";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
  onViewSummary: () => void;
}

function fmtMinSec(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

const PAUSE_REASONS = [
  { id: "tempo_nos", label: "Pedido de Tempo — Nós" },
  { id: "tempo_advers", label: "Pedido de Tempo — Adversário" },
  { id: "outro", label: "Outro motivo (lesão, árbitro, etc.)" },
];

type Picker =
  | { kind: "golo-scorer" }
  | { kind: "golo-assist"; scorerId: string }
  | { kind: "golo-tipo"; scorerId: string; assistId: string | null } // golo nosso: último passo antes da zona
  | { kind: "golo-zona"; scorerId: string; assistId: string | null; tipo: string | null }
  | { kind: "opp-golo-tipo" } // golo sofrido: mesmo par tipo/zona, sem marcador/assistência
  | { kind: "opp-golo-zona"; tipo: string | null }
  | { kind: "player"; playerId: string } // toca num jogador EM CAMPO -> ações contextuais (cartão/falta/substituir/atendimento)
  | { kind: "sub-out" } // atalho da barra: escolher primeiro quem sai
  | { kind: "sub-in"; outId: string } // escolher quem entra, já sabendo quem sai
  | { kind: "sub-out-for-entry"; inId: string } // banco cheio: escolher quem sai para este entrar
  | null;

function PlayerChip({ p, onClick, dim }: { p: PlayerRow; onClick: () => void; dim?: boolean }) {
  const gk = isGoalkeeper(p.position);
  return (
    <button type="button" className={`pchip${gk ? " gr" : ""}${dim ? " dim" : ""}`} onClick={onClick}>
      <span className="n">#{p.num}</span>
      <span className="nm">{p.name}</span>
      <span className="pos">{posAbbr(p.position)}</span>
    </button>
  );
}

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
        {children}
        <button type="button" className="btn ghost block" onClick={onClose} style={{ marginTop: 14 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function LiveMatch({ live, roster, opponent, onViewSummary }: Props) {
  const { state, elapsedMs } = live;
  const isFinalPeriod = isLastPeriod(state.period, live.format);
  const byId = new Map(roster.map((p) => [p.id, p]));
  const onCourt = state.onCourt.map((id) => byId.get(id)).filter((p): p is PlayerRow => !!p);
  const bench = state.convocadoIds
    .filter((id) => !state.onCourt.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is PlayerRow => !!p);

  const [showPauseReasons, setShowPauseReasons] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);

  const hasKickoffThisPeriod = state.events.some((e) => e.type === "kickoff" && e.period === state.period);
  const clockLabel = state.clock.running ? "Pausar" : hasKickoffThisPeriod ? "Retomar" : `Iniciar Parte ${state.period}`;

  function handleClockClick() {
    if (state.clock.running) setShowPauseReasons(true);
    else live.resumeOrStart();
  }

  function handleBenchTap(p: PlayerRow) {
    if (state.onCourt.length < 5) {
      live.doEnter(p.id);
    } else {
      setPicker({ kind: "sub-out-for-entry", inId: p.id });
    }
  }

  return (
    <div>
      <div className="scoreboard" style={{ flexDirection: "column" }}>
        <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="score-side">
            <div className="lbl">Nós</div>
            <div className="val">{state.score.nos}</div>
          </div>
          <div className="clock-mid">
            <div className="lbl" style={{ fontSize: 10.5, opacity: 0.85 }}>Parte {state.period}</div>
            <div className="time">{fmtMinSec(elapsedMs)}</div>
            {!state.finished && (
              <button type="button" className="clock-btn" onClick={handleClockClick}>
                {clockLabel}
              </button>
            )}
          </div>
          <div className="score-side">
            <div className="lbl">{opponent || "Advers."}</div>
            <div className="val">{state.score.advers}</div>
            <button type="button" className="oppgoal" onClick={() => setPicker({ kind: "opp-golo-tipo" })} style={{ marginTop: 4 }}>
              +1 golo advers.
            </button>
          </div>
        </div>
        <div className="scoreboard-fouls">
          <div className={`foul${state.periodFouls >= 5 ? " warn" : ""}`}>
            Faltas nós
            <span className="n">{state.periodFouls}</span>
          </div>
          <div className={`foul${state.periodFoulsAdvers >= 5 ? " warn" : ""}`}>
            Faltas advers.
            <span className="n">{state.periodFoulsAdvers}</span>
          </div>
        </div>
      </div>

      {showPauseReasons && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0 }}>Motivo da pausa:</p>
          {PAUSE_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="btn ghost block"
              onClick={() => {
                live.pause(r.label, r.id);
                setShowPauseReasons(false);
              }}
              style={{ marginBottom: 4, textAlign: "left" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {state.finished && (
        <div className="banner success" style={{ textAlign: "center", marginTop: 12 }}>
          <strong>Jogo terminado</strong> — Nós {state.score.nos} – {state.score.advers} {opponent}
          <div style={{ marginTop: 6 }}>
            <button type="button" className="btn primary" onClick={onViewSummary}>
              📋 Ver Resumo
            </button>
          </div>
        </div>
      )}

      {state.treatment && (
        <div className="banner error" style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          🩹 Atendimento em curso: <strong>{byId.get(state.treatment.playerId)?.name}</strong>
          <button type="button" className="btn sm ghost" onClick={live.endTreatment}>Terminar</button>
        </div>
      )}

      {!state.finished && (
        <>
          <div className="tray" style={{ position: "static", background: "transparent", borderTop: "none", padding: 0, marginTop: 12 }}>
            <button type="button" className="btn" disabled={!live.canUndo} onClick={live.undo}>
              ↩️ Desfazer
            </button>
            <button type="button" className="btn primary" onClick={() => setPicker({ kind: "golo-scorer" })}>
              ⚽ Golo
            </button>
            <button type="button" className="btn" onClick={() => setPicker({ kind: "sub-out" })} disabled={bench.length === 0}>
              🔁 Substituição
            </button>
          </div>

          <p className="hint">
            Toca direto no atleta do banco pra entrar, ou num atleta em campo para cartão/falta/atendimento/substituição.
          </p>
        </>
      )}

      <h3 className="section-title" style={{ marginTop: 16 }}>Em campo ({onCourt.length})</h3>
      <div className="pgrid">
        {onCourt.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pchip${isGoalkeeper(p.position) ? " gr" : ""}`}
            disabled={state.finished}
            onClick={() => setPicker({ kind: "player", playerId: p.id })}
          >
            <span className="min">{Math.floor(live.playerSeconds(p.id) / 60)}'</span>
            <span className="n">#{p.num}</span>
            <span className="nm">{p.name}</span>
            <span className="pos">{posAbbr(p.position)}</span>
          </button>
        ))}
      </div>

      <h3 className="section-title" style={{ marginTop: 16 }}>Banco ({bench.length})</h3>
      <p className="hint" style={{ marginTop: 0 }}>Toca para entrar em campo.</p>
      <div className="pgrid">
        {bench.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pchip dim${isGoalkeeper(p.position) ? " gr" : ""}`}
            disabled={state.finished}
            onClick={() => handleBenchTap(p)}
          >
            <span className="min">{Math.floor(live.playerSeconds(p.id) / 60)}'</span>
            <span className="n">#{p.num}</span>
            <span className="nm">{p.name}</span>
          </button>
        ))}
      </div>

      {!state.finished && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className={`btn block${isFinalPeriod ? " primary" : ""}`} onClick={live.endPeriod}>
            {isFinalPeriod ? "Terminar Jogo" : `Terminar Parte ${state.period}`}
          </button>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3 className="section-title">Registo ({state.events.length})</h3>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {state.events
            .slice()
            .reverse()
            .map((e) => {
              const lookup = (id: string) => {
                const p = byId.get(id);
                return p ? { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" } : undefined;
              };
              return (
                <div key={e.id} className="logline">
                  <span className="d">{describeEvent(e, lookup, live.format)}</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* ---- Sheets de toque ---- */}

      {picker?.kind === "golo-scorer" && (
        <Sheet title="Quem marcou?" sub="Toca no marcador" onClose={() => setPicker(null)}>
          <div className="pgrid">
            {onCourt.map((p) => (
              <PlayerChip key={p.id} p={p} onClick={() => setPicker({ kind: "golo-assist", scorerId: p.id })} />
            ))}
          </div>
        </Sheet>
      )}

      {picker?.kind === "golo-assist" && (
        <Sheet title="Assistência?" sub='Opcional — toca em "sem assistência" se não houver' onClose={() => setPicker(null)}>
          <div className="pgrid">
            {onCourt
              .filter((p) => p.id !== picker.scorerId)
              .map((p) => (
                <PlayerChip
                  key={p.id}
                  p={p}
                  onClick={() => setPicker({ kind: "golo-tipo", scorerId: picker.scorerId, assistId: p.id })}
                />
              ))}
          </div>
          <button
            type="button"
            className="btn primary block"
            onClick={() => setPicker({ kind: "golo-tipo", scorerId: picker.scorerId, assistId: null })}
            style={{ marginTop: 10 }}
          >
            Sem assistência
          </button>
        </Sheet>
      )}

      {(picker?.kind === "golo-tipo" || picker?.kind === "opp-golo-tipo") && (
        <Sheet title="Tipo de jogada?" sub="Opcional — ajuda depois a cruzar com a folha de estatísticas" onClose={() => setPicker(null)}>
          <div className="actiongrid">
            {TIPOS_GOLO.map((t) => (
              <button
                key={t.id}
                type="button"
                className="abtn"
                onClick={() =>
                  setPicker(
                    picker.kind === "golo-tipo"
                      ? { kind: "golo-zona", scorerId: picker.scorerId, assistId: picker.assistId, tipo: t.id }
                      : { kind: "opp-golo-zona", tipo: t.id }
                  )
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost block"
            onClick={() =>
              setPicker(
                picker.kind === "golo-tipo"
                  ? { kind: "golo-zona", scorerId: picker.scorerId, assistId: picker.assistId, tipo: null }
                  : { kind: "opp-golo-zona", tipo: null }
              )
            }
            style={{ marginTop: 10 }}
          >
            Não sei / saltar
          </button>
        </Sheet>
      )}

      {(picker?.kind === "golo-zona" || picker?.kind === "opp-golo-zona") && (
        <Sheet
          title="Zona do golo?"
          sub="Opcional — grelha 3×4 (1-3 mais perto da baliza, 10-12 mais perto do meio-campo)"
          onClose={() => setPicker(null)}
        >
          <div className="zonegrid">
            {ZONAS_GOLO.map((z) => (
              <button
                key={z}
                type="button"
                className="zbtn"
                onClick={() => {
                  if (picker.kind === "golo-zona") live.doGoal(picker.scorerId, picker.assistId, picker.tipo, z);
                  else live.doOppGoal(picker.tipo, z);
                  setPicker(null);
                }}
              >
                {z}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              if (picker.kind === "golo-zona") live.doGoal(picker.scorerId, picker.assistId, picker.tipo, null);
              else live.doOppGoal(picker.tipo, null);
              setPicker(null);
            }}
            style={{ marginTop: 10 }}
          >
            Não sei / saltar
          </button>
        </Sheet>
      )}

      {/* Aberto só a partir de um chip EM CAMPO — o banco entra direto (handleBenchTap), sem passar por aqui. */}
      {picker?.kind === "player" &&
        (() => {
          const p = byId.get(picker.playerId);
          if (!p) return null;
          const inTreatment = state.treatment?.playerId === p.id;
          return (
            <Sheet title={`#${p.num} ${p.name}`} sub="Em campo" onClose={() => setPicker(null)}>
              <div className="actiongrid">
                <button
                  type="button"
                  className="abtn yellow"
                  onClick={() => {
                    live.doCard(p.id, "amarelo");
                    setPicker(null);
                  }}
                >
                  <span className="ic">🟨</span>Amarelo
                </button>
                <button
                  type="button"
                  className="abtn red"
                  onClick={() => {
                    live.doCard(p.id, "vermelho");
                    setPicker(null);
                  }}
                >
                  <span className="ic">🟥</span>Vermelho
                </button>
                <button
                  type="button"
                  className="abtn"
                  onClick={() => {
                    live.doFoul(p.id);
                    setPicker(null);
                  }}
                >
                  <span className="ic">✋</span>Falta cometida
                </button>
                <button
                  type="button"
                  className="abtn"
                  onClick={() => {
                    live.doFoulSuffered(p.id);
                    setPicker(null);
                  }}
                >
                  <span className="ic">🙌</span>Falta sofrida
                </button>
                <button type="button" className="abtn" onClick={() => setPicker({ kind: "sub-in", outId: p.id })}>
                  <span className="ic">🔁</span>Substituir (sai)
                </button>
                {!inTreatment ? (
                  <button
                    type="button"
                    className="abtn stop"
                    style={{ gridColumn: "1 / -1" }}
                    onClick={() => {
                      live.startTreatment(p.id);
                      setPicker(null);
                    }}
                  >
                    <span className="ic">🩹</span>Iniciar atendimento
                  </button>
                ) : (
                  <button
                    type="button"
                    className="abtn stop"
                    style={{ gridColumn: "1 / -1" }}
                    onClick={() => {
                      live.endTreatment();
                      setPicker(null);
                    }}
                  >
                    <span className="ic">✅</span>Terminar atendimento
                  </button>
                )}
              </div>
            </Sheet>
          );
        })()}

      {picker?.kind === "sub-out" && (
        <Sheet title="Quem sai?" sub="Atalho rápido — toca em quem vai sair" onClose={() => setPicker(null)}>
          <div className="pgrid">
            {onCourt.map((p) => (
              <PlayerChip key={p.id} p={p} onClick={() => setPicker({ kind: "sub-in", outId: p.id })} />
            ))}
          </div>
        </Sheet>
      )}

      {picker?.kind === "sub-in" && (
        <Sheet title="Quem entra?" sub={`Sai #${byId.get(picker.outId)?.num} ${byId.get(picker.outId)?.name}`} onClose={() => setPicker(null)}>
          <div className="pgrid">
            {bench.map((p) => (
              <PlayerChip
                key={p.id}
                p={p}
                onClick={() => {
                  live.doSub(picker.outId, p.id);
                  setPicker(null);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}

      {picker?.kind === "sub-out-for-entry" && (
        <Sheet title="Quadra completa (5) — quem sai?" sub={`Para entrar #${byId.get(picker.inId)?.num} ${byId.get(picker.inId)?.name}`} onClose={() => setPicker(null)}>
          <div className="pgrid">
            {onCourt.map((p) => (
              <PlayerChip
                key={p.id}
                p={p}
                onClick={() => {
                  live.doSub(p.id, picker.inId);
                  setPicker(null);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
