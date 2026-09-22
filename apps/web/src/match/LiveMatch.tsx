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

export function LiveMatch({ live, roster, opponent }: Props) {
  const { state, elapsedMs } = live;
  const byId = new Map(roster.map((p) => [p.id, p]));
  const onCourt = state.onCourt.map((id) => byId.get(id)).filter((p): p is PlayerRow => !!p);
  const bench = state.convocadoIds.filter((id) => !state.onCourt.includes(id)).map((id) => byId.get(id)).filter((p): p is PlayerRow => !!p);

  const [showPauseReasons, setShowPauseReasons] = useState(false);
  const [scorerId, setScorerId] = useState("");
  const [assistId, setAssistId] = useState("");
  const [cardPlayerId, setCardPlayerId] = useState("");
  const [foulPlayerId, setFoulPlayerId] = useState("");
  const [subOutId, setSubOutId] = useState("");
  const [subInId, setSubInId] = useState("");
  const [treatPlayerId, setTreatPlayerId] = useState("");

  const hasKickoffThisPeriod = state.events.some((e) => e.type === "kickoff" && e.period === state.period);
  const clockLabel = state.clock.running ? "Pausar" : hasKickoffThisPeriod ? "Retomar" : `Iniciar Parte ${state.period}`;

  function handleClockClick() {
    if (state.clock.running) {
      setShowPauseReasons(true);
    } else {
      live.resumeOrStart();
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

      <div style={{ marginTop: 12 }}>
        <button type="button" disabled={!live.canUndo} onClick={live.undo}>
          ↩️ Desfazer
        </button>
      </div>

      <h3 style={{ fontSize: 14, marginTop: 16 }}>Em campo ({onCourt.length})</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 6 }}>
        {onCourt.map((p) => (
          <div key={p.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 6, fontSize: 12, textAlign: "center" }}>
            #{p.num} {p.name}
            <div style={{ fontSize: 10, color: "#666" }}>
              {posAbbr(p.position)} · {Math.floor(live.playerSeconds(p.id) / 60)}'
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 14, marginTop: 16 }}>Banco ({bench.length})</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 6 }}>
        {bench.map((p) => (
          <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 6, fontSize: 12, textAlign: "center", color: "#666" }}>
            #{p.num} {p.name}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <fieldset>
          <legend>⚽ Golo</legend>
          <select value={scorerId} onChange={(e) => setScorerId((e.target as HTMLSelectElement).value)}>
            <option value="">Marcador...</option>
            {onCourt.map((p) => (
              <option key={p.id} value={p.id}>#{p.num} {p.name}</option>
            ))}
          </select>
          <select value={assistId} onChange={(e) => setAssistId((e.target as HTMLSelectElement).value)}>
            <option value="">Sem assistência</option>
            {onCourt.filter((p) => p.id !== scorerId).map((p) => (
              <option key={p.id} value={p.id}>#{p.num} {p.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!scorerId}
            onClick={() => {
              live.doGoal(scorerId, assistId || null);
              setScorerId("");
              setAssistId("");
            }}
          >
            Registar golo
          </button>
        </fieldset>

        <fieldset>
          <legend>🟨🟥 Cartão / ✋ Falta</legend>
          <select value={cardPlayerId} onChange={(e) => setCardPlayerId((e.target as HTMLSelectElement).value)}>
            <option value="">Atleta...</option>
            {onCourt.map((p) => (
              <option key={p.id} value={p.id}>#{p.num} {p.name}</option>
            ))}
          </select>
          <button type="button" disabled={!cardPlayerId} onClick={() => live.doCard(cardPlayerId, "amarelo")}>Amarelo</button>
          <button type="button" disabled={!cardPlayerId} onClick={() => live.doCard(cardPlayerId, "vermelho")}>Vermelho</button>
          <button type="button" disabled={!cardPlayerId} onClick={() => live.doFoul(cardPlayerId)}>Falta</button>
        </fieldset>

        <fieldset>
          <legend>🔁 Substituição</legend>
          <select value={subOutId} onChange={(e) => setSubOutId((e.target as HTMLSelectElement).value)}>
            <option value="">Sai...</option>
            {onCourt.map((p) => (
              <option key={p.id} value={p.id}>#{p.num} {p.name}</option>
            ))}
          </select>
          <select value={subInId} onChange={(e) => setSubInId((e.target as HTMLSelectElement).value)}>
            <option value="">Entra...</option>
            {bench.map((p) => (
              <option key={p.id} value={p.id}>#{p.num} {p.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!subOutId || !subInId}
            onClick={() => {
              live.doSub(subOutId, subInId);
              setSubOutId("");
              setSubInId("");
            }}
          >
            Substituir
          </button>
        </fieldset>

        <fieldset>
          <legend>🩹 Atendimento</legend>
          {state.treatment ? (
            <button type="button" onClick={live.endTreatment}>
              Terminar atendimento — {byId.get(state.treatment.playerId)?.name}
            </button>
          ) : (
            <>
              <select value={treatPlayerId} onChange={(e) => setTreatPlayerId((e.target as HTMLSelectElement).value)}>
                <option value="">Atleta...</option>
                {roster.filter((p) => state.convocadoIds.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>#{p.num} {p.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!treatPlayerId}
                onClick={() => {
                  live.startTreatment(treatPlayerId);
                  setTreatPlayerId("");
                }}
              >
                Iniciar atendimento
              </button>
            </>
          )}
        </fieldset>
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
          {state.events.slice().reverse().map((e) => {
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
    </div>
  );
}
