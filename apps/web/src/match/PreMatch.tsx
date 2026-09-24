import type { PlayerRow } from "../team/usePlayers";
import { isGoalkeeper, posAbbr } from "../team/positions";
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
      <h2 style={{ fontSize: 18 }}>Pré-jogo{opponent ? ` — vs ${opponent}` : ""}</h2>

      <h3 className="section-title" style={{ marginTop: 20 }}>Convocados ({convocados.length})</h3>
      <div className="pgrid">
        {roster.map((p) => {
          const checked = state.convocadoIds.includes(p.id);
          const gk = isGoalkeeper(p.position);
          return (
            <button
              type="button"
              key={p.id}
              className={`pchip checkbox-chip${checked ? " checked" : ""}${gk ? " gr" : ""}`}
              onClick={() => live.toggleConvocado(p.id)}
            >
              <span className="n">#{p.num}</span>
              <span className="nm">{p.name}</span>
              <span className="pos">{posAbbr(p.position)}</span>
            </button>
          );
        })}
      </div>

      <h3 className="section-title" style={{ marginTop: 20 }}>Cinco inicial ({state.onCourt.length}/5)</h3>
      {convocados.length === 0 ? (
        <p className="empty">Seleciona os convocados acima primeiro.</p>
      ) : (
        <div className="pgrid">
          {convocados.map((p) => {
            const selected = state.onCourt.includes(p.id);
            const gk = isGoalkeeper(p.position);
            return (
              <button
                type="button"
                key={p.id}
                className={`pchip${selected ? " selected" : ""}${gk ? " gr" : ""}`}
                onClick={() => live.toggleTitular(p.id)}
              >
                <span className="n">#{p.num}</span>
                <span className="nm">{p.name}</span>
                <span className="pos">{posAbbr(p.position)}</span>
              </button>
            );
          })}
        </div>
      )}

      <button type="button" className="btn primary block" disabled={state.onCourt.length === 0} onClick={() => { live.goLive(); live.resumeOrStart(); }} style={{ marginTop: 20 }}>
        Ir para o jogo →
      </button>
    </div>
  );
}
