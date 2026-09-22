import type { PlayerRow } from "../team/usePlayers";
import { GOALKEEPER_COLOR, isGoalkeeper, posAbbr } from "../team/positions";
import type { useLiveMatch } from "./useLiveMatch";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
}

export function PreMatch({ live, roster, opponent }: Props) {
  const { state } = live;
  const convocados = roster.filter((p) => state.convocadoIds.includes(p.id));

  return (
    <div>
      <h2 style={{ fontSize: 16 }}>Pré-jogo{opponent ? ` — vs ${opponent}` : ""}</h2>

      <h3 style={{ fontSize: 14, marginTop: 16 }}>Convocados ({convocados.length})</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
        {roster.map((p) => {
          const checked = state.convocadoIds.includes(p.id);
          const gk = isGoalkeeper(p.position);
          return (
            <label
              key={p.id}
              style={{
                border: `1px solid ${gk ? GOALKEEPER_COLOR : "#ccc"}`,
                borderRadius: 8,
                padding: 8,
                background: checked ? "#eef7ee" : gk ? `${GOALKEEPER_COLOR}14` : "#fff",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: gk ? GOALKEEPER_COLOR : undefined,
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => live.toggleConvocado(p.id)} />#{p.num} {p.name}
            </label>
          );
        })}
      </div>

      <h3 style={{ fontSize: 14, marginTop: 16 }}>Cinco inicial ({state.onCourt.length}/5)</h3>
      {convocados.length === 0 ? (
        <p style={{ color: "#666" }}>Seleciona os convocados acima primeiro.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
          {convocados.map((p) => {
            const selected = state.onCourt.includes(p.id);
            const gk = isGoalkeeper(p.position);
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => live.toggleTitular(p.id)}
                style={{
                  border: selected ? "2px solid #2a7" : `1px solid ${gk ? GOALKEEPER_COLOR : "#ccc"}`,
                  borderRadius: 8,
                  padding: 8,
                  background: selected ? "#eef7ee" : gk ? `${GOALKEEPER_COLOR}14` : "#fff",
                  color: gk && !selected ? GOALKEEPER_COLOR : undefined,
                }}
              >
                #{p.num} {p.name}
                <div style={{ fontSize: 10, color: gk && !selected ? GOALKEEPER_COLOR : "#666" }}>{posAbbr(p.position)}</div>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={state.onCourt.length === 0}
        onClick={() => {
          live.goLive();
          live.resumeOrStart();
        }}
        style={{ marginTop: 16, width: "100%", padding: 10 }}
      >
        Ir para o jogo →
      </button>
    </div>
  );
}
