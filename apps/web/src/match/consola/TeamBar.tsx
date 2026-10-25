import type { ConsolaMode } from "./layout";

export interface TeamBarProps {
  mode: ConsolaMode;
  period: number;
  /** Golos sofridos na parte atual / no jogo (FR-026). */
  oppGoals: { period: number; total: number };
  awaitingKickoff: boolean;
  finished: boolean;
  paused: boolean;
  isFinalPeriod: boolean;
  onOppGoal: () => void;
  onKickoff: () => void;
  onPause: () => void;
  onResume: () => void;
  onEndPeriod: () => void;
  onMore: () => void;
}

/**
 * Barra de equipa (FR-012). Etapa 1: só o que já existe no motor — golo
 * sofrido, pausa, início/fim de parte. As transições, o GR-linha e os "−"
 * entram na Etapa 2. No iPhone vertical a pausa vive na doca e o fim de
 * parte no "Mais…", para os botões que ficam terem tamanho.
 */
export function TeamBar(p: TeamBarProps) {
  const phoneV = p.mode === "iphone-v";
  if (p.finished) return null;
  const counter = (
    <span className="cnt">
      {p.period}ª {p.oppGoals.period} · total {p.oppGoals.total}
    </span>
  );
  return (
    <div className="consola-team">
      {p.awaitingKickoff ? (
        <button type="button" className="cbtn kick" onClick={p.onKickoff}>
          Iniciar Parte {p.period}
        </button>
      ) : (
        <button type="button" className="cbtn opp" onClick={p.onOppGoal}>
          <span>Golo sofrido</span>
          {counter}
        </button>
      )}
      {!phoneV && !p.awaitingKickoff && (
        <button type="button" className={`cbtn${p.paused ? " warn" : ""}`} onClick={p.paused ? p.onResume : p.onPause}>
          {p.paused ? "▶ Retomar" : "⏸ Pausa"}
        </button>
      )}
      {!phoneV && !p.awaitingKickoff && (
        <button type="button" className="cbtn" onClick={p.onEndPeriod}>
          {p.isFinalPeriod ? "Terminar jogo" : `Fim da Parte ${p.period}`}
        </button>
      )}
      <button type="button" className="cbtn" onClick={p.onMore}>
        Mais…
      </button>
    </div>
  );
}
