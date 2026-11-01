import { isGoalkeeper } from "../../team/positions";
import type { PlayerRow } from "../../team/usePlayers";

export interface BenchItem {
  player: PlayerRow;
  minutes: number;
  benchSec: number;
}

/**
 * Banco sempre à vista (contracts/consola-visual.md, decisão 8): minutos
 * jogados e tempo no banco; quem descansou mais fica destacado. Na troca de
 * linha, os escolhidos mostram a ordem (1, 2…) em que vão entrar.
 */
export function BenchStrip({
  items,
  queue,
  pickIn,
  disabled,
  onTap,
  className,
}: {
  items: BenchItem[];
  queue: string[];
  /** Fluxo "quem entra?" (⋯ → Substituir): realça o banco todo. */
  pickIn: boolean;
  disabled: boolean;
  onTap: (playerId: string) => void;
  className?: string;
}) {
  const maxRest = Math.max(0, ...items.filter((i) => !isGoalkeeper(i.player.position)).map((i) => i.benchSec));
  return (
    <div className={`cv-bench ${className ?? ""}`}>
      {items.map(({ player: p, minutes, benchSec }) => {
        const n = queue.indexOf(p.id);
        const gk = isGoalkeeper(p.position);
        // Destaque só a partir de 1 minuto de banco (antes disso todos empatam em 0').
        const rested = !gk && maxRest >= 60 && benchSec === maxRest;
        return (
          <button
            key={p.id}
            type="button"
            className={`cv-bp${gk ? " gk" : ""}${n >= 0 ? " sel" : ""}${pickIn ? " entra" : ""}`}
            disabled={disabled}
            onClick={() => onTap(p.id)}
          >
            {n >= 0 && <span className="q">{n + 1}</span>}
            <b>
              #{p.num} {p.name}
            </b>
            <span>
              {minutes}' jogados · <span className={rested ? "rest" : ""}>banco {Math.floor(benchSec / 60)}'</span>
            </span>
          </button>
        );
      })}
      {items.length === 0 && <span className="cv-dim">Ninguém no banco.</span>}
    </div>
  );
}
