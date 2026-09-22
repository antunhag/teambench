import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { PlayerRow } from "../team/usePlayers";
import { posAbbr } from "../team/positions";
import type { useLiveMatch } from "./useLiveMatch";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
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
  | { kind: "player"; playerId: string } // toca no chip (em campo ou banco) -> ações contextuais
  | { kind: "sub-in"; outId: string } // "substituir (sai)" a partir do sheet do jogador
  | { kind: "sub-out-for-entry"; inId: string } // banco cheio: escolher quem sai para este entrar
  | null;

function PlayerChip({ p, onClick, dim }: { p: PlayerRow; onClick: () => void; dim?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid #ccc",
        borderRadius: 10,
        padding: "10px 6px",
        minHeight: 64,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        background: dim ? "#f7f7f7" : "#fff",
        color: dim ? "#666" : undefined,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15 }}>#{p.num}</div>
      <div style={{ fontSize: 11 }}>{p.name}</div>
      <div style={{ fontSize: 9, color: "#666" }}>{posAbbr(p.position)}</div>
    </button>
  );
}

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,20,14,.5)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", width: "100%", maxWidth: 520, borderRadius: "18px 18px 0 0", padding: 16, maxHeight: "85vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 16, margin: "0 0 2px" }}>{title}</h3>
        {sub && <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>{sub}</div>}
        {children}
        <button type="button" onClick={onClose} style={{ marginTop: 14, width: "100%", padding: 10 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function LiveMatch({ live, roster, opponent }: Props) {
  const { state, elapsedMs } = live;
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1F7A4D", color: "#fff", borderRadius: 12, padding: 12 }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Nós</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{state.score.nos}</div>
        </div>
        <div style={{ textAlign: "center", minWidth: 90 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Parte {state.period}</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{fmtMinSec(elapsedMs)}</div>
          <button type="button" onClick={handleClockClick} style={{ marginTop: 4, fontSize: 11, borderRadius: 20, border: "none", padding: "4px 10px" }}>
            {clockLabel}
          </button>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{opponent || "Advers."}</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{state.score.advers}</div>
          <button type="button" onClick={live.doOppGoal} style={{ fontSize: 10, marginTop: 4 }}>
            +1 golo advers.
          </button>
        </div>
      </div>

      {showPauseReasons && (
        <div style={{ marginTop: 8, border: "1px solid #ccc", borderRadius: 8, padding: 8 }}>
          <p style={{ fontSize: 12, margin: "0 0 6px" }}>Motivo da pausa:</p>
          {PAUSE_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                live.pause(r.label, r.id);
                setShowPauseReasons(false);
              }}
              style={{ display: "block", width: "100%", marginBottom: 4, textAlign: "left", padding: 6 }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {state.treatment && (
        <div style={{ marginTop: 8, border: "1px solid crimson", borderRadius: 8, padding: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          🩹 Atendimento em curso: <strong>{byId.get(state.treatment.playerId)?.name}</strong>
          <button type="button" onClick={live.endTreatment}>Terminar</button>
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button type="button" disabled={!live.canUndo} onClick={live.undo}>
          ↩️ Desfazer
        </button>
        <button type="button" onClick={() => setPicker({ kind: "golo-scorer" })} style={{ fontWeight: 700 }}>
          ⚽ Golo
        </button>
      </div>

      <p style={{ fontSize: 11, color: "#666", marginTop: 8, marginBottom: 4 }}>
        Toca num atleta para cartão, falta, substituição ou atendimento.
      </p>

      <h3 style={{ fontSize: 14, marginTop: 8 }}>Em campo ({onCourt.length})</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
        {onCourt.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPicker({ kind: "player", playerId: p.id })}
            style={{ border: "1px solid #ccc", borderRadius: 8, padding: 6, fontSize: 12, textAlign: "center", background: "#fff" }}
          >
            #{p.num} {p.name}
            <div style={{ fontSize: 10, color: "#666" }}>
              {posAbbr(p.position)} · {Math.floor(live.playerSeconds(p.id) / 60)}'
            </div>
          </button>
        ))}
      </div>

      <h3 style={{ fontSize: 14, marginTop: 16 }}>Banco ({bench.length})</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
        {bench.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPicker({ kind: "player", playerId: p.id })}
            style={{ border: "1px solid #eee", borderRadius: 8, padding: 6, fontSize: 12, textAlign: "center", background: "#fafafa", color: "#666" }}
          >
            #{p.num} {p.name}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 12, color: "#666" }}>Faltas na parte: {state.periodFouls}</p>
        <button type="button" onClick={live.endPeriod} style={{ width: "100%", padding: 10 }}>
          Terminar Parte {state.period}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14 }}>Registo ({state.events.length})</h3>
        <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
          {state.events
            .slice()
            .reverse()
            .map((e) => {
              const p = e.playerId ? byId.get(e.playerId) : null;
              return (
                <div key={e.id} style={{ borderTop: "1px solid #eee", padding: "4px 0" }}>
                  <span style={{ color: "#666" }}>{fmtMinSec(e.ms)}</span> — {e.type}
                  {p ? ` — #${p.num} ${p.name}` : ""}
                </div>
              );
            })}
        </div>
      </div>

      {/* ---- Sheets de toque ---- */}

      {picker?.kind === "golo-scorer" && (
        <Sheet title="Quem marcou?" sub="Toca no marcador" onClose={() => setPicker(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
            {onCourt.map((p) => (
              <PlayerChip key={p.id} p={p} onClick={() => setPicker({ kind: "golo-assist", scorerId: p.id })} />
            ))}
          </div>
        </Sheet>
      )}

      {picker?.kind === "golo-assist" && (
        <Sheet title="Assistência?" sub='Opcional — toca em "sem assistência" se não houver' onClose={() => setPicker(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
            {onCourt
              .filter((p) => p.id !== picker.scorerId)
              .map((p) => (
                <PlayerChip
                  key={p.id}
                  p={p}
                  onClick={() => {
                    live.doGoal(picker.scorerId, p.id);
                    setPicker(null);
                  }}
                />
              ))}
          </div>
          <button
            type="button"
            onClick={() => {
              live.doGoal(picker.scorerId, null);
              setPicker(null);
            }}
            style={{ marginTop: 10, width: "100%", padding: 10, fontWeight: 700 }}
          >
            Sem assistência
          </button>
        </Sheet>
      )}

      {picker?.kind === "player" &&
        (() => {
          const p = byId.get(picker.playerId);
          if (!p) return null;
          const onC = state.onCourt.includes(p.id);
          const inTreatment = state.treatment?.playerId === p.id;
          return (
            <Sheet title={`#${p.num} ${p.name}`} sub={onC ? "Em campo" : "No banco"} onClose={() => setPicker(null)}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {onC && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        live.doCard(p.id, "amarelo");
                        setPicker(null);
                      }}
                      style={{ padding: 14 }}
                    >
                      🟨 Amarelo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        live.doCard(p.id, "vermelho");
                        setPicker(null);
                      }}
                      style={{ padding: 14 }}
                    >
                      🟥 Vermelho
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        live.doFoul(p.id);
                        setPicker(null);
                      }}
                      style={{ padding: 14 }}
                    >
                      ✋ Falta cometida
                    </button>
                    <button type="button" onClick={() => setPicker({ kind: "sub-in", outId: p.id })} style={{ padding: 14 }}>
                      🔁 Substituir (sai)
                    </button>
                  </>
                )}
                {!onC && (
                  <button
                    type="button"
                    onClick={() => {
                      handleBenchTap(p);
                      setPicker(null);
                    }}
                    style={{ padding: 14, gridColumn: "1 / -1" }}
                  >
                    ➡️ Entrar em campo
                  </button>
                )}
                {!inTreatment ? (
                  <button
                    type="button"
                    onClick={() => {
                      live.startTreatment(p.id);
                      setPicker(null);
                    }}
                    style={{ padding: 14, gridColumn: "1 / -1" }}
                  >
                    🩹 Iniciar atendimento
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      live.endTreatment();
                      setPicker(null);
                    }}
                    style={{ padding: 14, gridColumn: "1 / -1" }}
                  >
                    ✅ Terminar atendimento
                  </button>
                )}
              </div>
            </Sheet>
          );
        })()}

      {picker?.kind === "sub-in" && (
        <Sheet title="Quem entra?" sub={`Sai #${byId.get(picker.outId)?.num} ${byId.get(picker.outId)?.name}`} onClose={() => setPicker(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
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
