import type { PlayerRow } from "../team/usePlayers";
import { isGoalkeeper, posAbbr } from "../team/positions";
import type { useLiveMatch } from "./useLiveMatch";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
  /** Mínimo de convocados esperado pro Formato de Jogo deste jogo — null = sem aviso configurado (specs/007-convocados-sync/ US3). */
  minConvocados: number | null;
  onConfirm: () => void;
}

export function PreMatch({ live, roster, opponent, minConvocados, onConfirm }: Props) {
  const { state } = live;
  const convocados = roster.filter((p) => state.convocadoIds.includes(p.id));
  const abaixoDoMinimo = minConvocados != null && convocados.length < minConvocados;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Pré-jogo{opponent ? ` — vs ${opponent}` : ""}</h2>

      <h3 className="section-title" style={{ marginTop: 20 }}>Convocados ({convocados.length})</h3>
      {abaixoDoMinimo && (
        <p className="banner warn">
          Só {convocados.length} convocado{convocados.length === 1 ? "" : "s"} — o habitual pra este formato é pelo
          menos {minConvocados}. Pode continuar mesmo assim.
        </p>
      )}
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
              <span className="nm">{p.name}</span>
              <span className="corner-bl">
                <span className="n">#{p.num}</span>
                <span className="pos">{posAbbr(p.position)}</span>
              </span>
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
                <span className="nm">{p.name}</span>
                <span className="corner-bl">
                  <span className="n">#{p.num}</span>
                  <span className="pos">{posAbbr(p.position)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {state.onCourt.length < 5 && convocados.length > 0 && (
        <p className="hint">
          Pode continuar sem os 5 completos — dá pra ajustar quem fica em quadra até apitar o início, já na próxima tela.
        </p>
      )}
      <button type="button" className="btn primary block" disabled={convocados.length === 0} onClick={onConfirm} style={{ marginTop: 8 }}>
        Ir para o jogo →
      </button>
    </div>
  );
}
